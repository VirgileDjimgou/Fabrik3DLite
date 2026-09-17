using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Server.Services;

public class JobService
{
    private readonly JobRepository _jobs;
    private readonly TaskRepository _tasks;
    private readonly SimulationSessionRepository _sessions;
    private readonly IHubNotificationService _hub;
    private readonly ILogger<JobService> _log;
    private readonly TimeSpan _heartbeatTimeout;

    public JobService(
        JobRepository jobs,
        TaskRepository tasks,
        SimulationSessionRepository sessions,
        IHubNotificationService hub,
        ILogger<JobService> log,
        IOptions<OrchestrationOptions> options)
    {
        _jobs = jobs;
        _tasks = tasks;
        _sessions = sessions;
        _hub = hub;
        _log = log;
        _heartbeatTimeout = TimeSpan.FromSeconds(Math.Max(1, options.Value.HeartbeatTimeoutSeconds));
    }

    public async Task<List<JobDto>> GetAllAsync()
    {
        var jobs = await _jobs.GetAllAsync();
        return jobs.Select(j => j.ToDto()).ToList();
    }

    public async Task<JobDto?> GetByIdAsync(string id)
    {
        var job = await _jobs.GetByIdAsync(id);
        return job?.ToDto();
    }

    public async Task<JobDto> CreateAsync(CreateJobRequest request)
    {
        if (!Enum.TryParse<MachineMode>(request.MachineMode, true, out var mode))
            mode = MachineMode.Automatic;

        var job = new Job
        {
            Name = request.Name,
            Description = request.Description,
            MachineMode = mode,
            Status = JobStatus.Created,
            Metadata = request.Metadata,
        };

        await _jobs.CreateAsync(job);
        _log.LogInformation("[Server][Jobs] Created → id={JobId} name={Name} mode={Mode}", job.Id, job.Name, mode);

        if (request.Tasks.Count > 0)
        {
            var tasks = request.Tasks.Select((t, i) => new MachiningTask
            {
                JobId = job.Id,
                Name = t.Name,
                Description = t.Description,
                PartType = t.PartType,
                PalletId = t.PalletId,
                SlotRow = t.SlotRow,
                SlotColumn = t.SlotColumn,
                SequenceOrder = i,
                Status = TaskStatusEnum.Pending,
            }).ToList();

            await _tasks.InsertManyAsync(tasks);
        }

        return job.ToDto();
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return false;

        await _tasks.DeleteByJobIdAsync(id);
        await _jobs.DeleteAsync(id);
        return true;
    }

    public async Task<JobDto?> StartAsync(string id, string? correlationId)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        JobStateTransitionRules.EnsureCanStart(job.Status);

        var oldStatus = job.Status.ToString();
        var now = DateTime.UtcNow;

        var tasks = await _tasks.GetByJobIdAsync(id);
        var session = new SimulationSession
        {
            JobId = id,
            Status = SimulationStatus.Running,
            TotalCount = tasks.Count,
            RemainingCount = tasks.Count,
            CorrelationId = correlationId,
            LastHeartbeatUtc = now,
        };
        await _sessions.CreateAsync(session);

        job.Status = JobStatus.Running;
        job.StartedAtUtc = now;
        job.UpdatedAtUtc = now;
        job.SimulationSessionId = session.Id;

        if (!await _jobs.UpdateAsync(job))
        {
            // Another writer won the race; remove the orphaned session.
            await _sessions.DeleteAsync(session.Id);
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Job '{id}' was modified concurrently. Reload the job and retry.");
        }

        _log.LogInformation("[Server][Jobs] StartAsync → job={JobId} session={SessionId} tasks={TaskCount} correlation={CorrelationId}",
            job.Id, session.Id, tasks.Count, correlationId);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), now, correlationId));

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, job.Id, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, now, correlationId));

        return job.ToDto();
    }

    /// <summary>
    /// Explicit claim/assignment of an existing runnable job to a simulator.
    /// Creates (or adopts) the simulation session and marks the job Running.
    /// Duplicate claims from the same simulator are idempotent; claims from a
    /// different simulator are rejected unless the current owner's heartbeat
    /// has expired (recovery).
    /// </summary>
    public async Task<ClaimResultDto?> ClaimAsync(string id, ClaimJobRequest request, string? correlationId)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        var claimCorrelationId = correlationId ?? request.CorrelationId;
        var now = DateTime.UtcNow;

        switch (job.Status)
        {
            case JobStatus.Created:
            case JobStatus.Ready:
                return await CreateSessionAndAssignAsync(job, request.SimulatorId, claimCorrelationId, now);

            case JobStatus.Running:
            {
                var session = job.SimulationSessionId is null
                    ? null
                    : await _sessions.GetByIdAsync(job.SimulationSessionId);

                if (session is null || string.IsNullOrEmpty(session.SimulatorId))
                    return await AdoptUnownedSessionAsync(job, session, request.SimulatorId, claimCorrelationId, now);

                if (session.SimulatorId == request.SimulatorId)
                {
                    // Idempotent duplicate claim: refresh ownership heartbeat.
                    session.LastHeartbeatUtc = now;
                    if (!await _sessions.UpdateAsync(session))
                        throw new OrchestrationConflictException(
                            "concurrent_modification",
                            $"Session '{session.Id}' was modified concurrently. Retry the claim.");
                    return await BuildClaimResultAsync(job, session);
                }

                if (HeartbeatExpiryPolicy.IsStale(session, now, _heartbeatTimeout))
                    return await ReassignExpiredSessionAsync(job, session, request.SimulatorId, claimCorrelationId, now);

                throw new OrchestrationConflictException(
                    "session_already_claimed",
                    $"Job '{id}' is already claimed by simulator '{session.SimulatorId}'.");
            }

            default:
                throw new OrchestrationConflictException(
                    "job_not_claimable",
                    $"Job '{id}' in state '{job.Status}' cannot be claimed. Only Created, Ready or Running jobs are claimable.");
        }
    }

    public async Task<JobDto?> PauseAsync(string id, string? correlationId)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        JobStateTransitionRules.EnsureCanPause(job.Status);

        var oldStatus = job.Status.ToString();
        var now = DateTime.UtcNow;
        job.Status = JobStatus.Paused;
        job.PausedAtUtc = now;
        job.UpdatedAtUtc = now;
        if (!await _jobs.UpdateAsync(job))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Job '{id}' was modified concurrently. Reload the job and retry.");

        if (job.SimulationSessionId is not null)
        {
            var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
            if (session is not null)
            {
                session.Status = SimulationStatus.Paused;
                session.IsPaused = true;
                if (!await _sessions.UpdateAsync(session))
                    throw new OrchestrationConflictException(
                        "concurrent_modification",
                        $"Session '{session.Id}' was modified concurrently.");

                await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                    session.Id, job.Id, session.Status.ToString(),
                    session.CurrentPhase, session.MachinedCount,
                    session.RemainingCount, session.TotalCount, now, correlationId));
            }
        }

        _log.LogInformation("[Server][Jobs] PauseAsync → job={JobId} correlation={CorrelationId}", job.Id, correlationId);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), now, correlationId));

        return job.ToDto();
    }

    public async Task<JobDto?> ResumeAsync(string id, string? correlationId)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        JobStateTransitionRules.EnsureCanResume(job.Status);

        var oldStatus = job.Status.ToString();
        var now = DateTime.UtcNow;
        job.Status = JobStatus.Running;
        job.PausedAtUtc = null;
        job.UpdatedAtUtc = now;
        if (!await _jobs.UpdateAsync(job))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Job '{id}' was modified concurrently. Reload the job and retry.");

        if (job.SimulationSessionId is not null)
        {
            var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
            if (session is not null)
            {
                session.Status = SimulationStatus.Running;
                session.IsPaused = false;
                session.LastHeartbeatUtc = now;
                if (!await _sessions.UpdateAsync(session))
                    throw new OrchestrationConflictException(
                        "concurrent_modification",
                        $"Session '{session.Id}' was modified concurrently.");

                await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                    session.Id, job.Id, session.Status.ToString(),
                    session.CurrentPhase, session.MachinedCount,
                    session.RemainingCount, session.TotalCount, now, correlationId));
            }
        }

        _log.LogInformation("[Server][Jobs] ResumeAsync → job={JobId} correlation={CorrelationId}", job.Id, correlationId);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), now, correlationId));

        return job.ToDto();
    }

    public async Task<JobDto?> StopAsync(string id, string? correlationId)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        JobStateTransitionRules.EnsureCanStop(job.Status);

        var oldStatus = job.Status.ToString();
        var now = DateTime.UtcNow;
        job.Status = JobStatus.Stopped;
        job.StoppedAtUtc = now;
        job.UpdatedAtUtc = now;
        if (!await _jobs.UpdateAsync(job))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Job '{id}' was modified concurrently. Reload the job and retry.");

        if (job.SimulationSessionId is not null)
        {
            var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
            if (session is not null)
            {
                session.Status = SimulationStatus.Stopped;
                session.IsPaused = false;
                session.EndedAtUtc = now;
                if (!await _sessions.UpdateAsync(session))
                    throw new OrchestrationConflictException(
                        "concurrent_modification",
                        $"Session '{session.Id}' was modified concurrently.");

                await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                    session.Id, job.Id, session.Status.ToString(),
                    session.CurrentPhase, session.MachinedCount,
                    session.RemainingCount, session.TotalCount, now, correlationId));
            }
        }

        _log.LogInformation("[Server][Jobs] StopAsync → job={JobId} correlation={CorrelationId}", job.Id, correlationId);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), now, correlationId));

        return job.ToDto();
    }

    public async Task<List<TaskDto>> GetTasksByJobIdAsync(string jobId)
    {
        var tasks = await _tasks.GetByJobIdAsync(jobId);
        return tasks.Select(t => t.ToDto()).ToList();
    }

    // ── Claim helpers ──────────────────────────────────────────

    private async Task<ClaimResultDto> CreateSessionAndAssignAsync(
        Job job, string simulatorId, string? correlationId, DateTime now)
    {
        var oldStatus = job.Status.ToString();
        var tasks = await _tasks.GetByJobIdAsync(job.Id);

        var session = new SimulationSession
        {
            JobId = job.Id,
            Status = SimulationStatus.Running,
            TotalCount = tasks.Count,
            RemainingCount = tasks.Count,
            SimulatorId = simulatorId,
            CorrelationId = correlationId,
            LastHeartbeatUtc = now,
        };
        await _sessions.CreateAsync(session);

        job.Status = JobStatus.Running;
        job.StartedAtUtc = now;
        job.UpdatedAtUtc = now;
        job.SimulationSessionId = session.Id;

        if (!await _jobs.UpdateAsync(job))
        {
            await _sessions.DeleteAsync(session.Id);
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Job '{job.Id}' was modified concurrently. Reload the job and retry.");
        }

        _log.LogInformation("[Server][Jobs] Claim → job={JobId} session={SessionId} simulator={SimulatorId} tasks={TaskCount} correlation={CorrelationId}",
            job.Id, session.Id, simulatorId, tasks.Count, correlationId);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), now, correlationId));

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, job.Id, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, now, correlationId));

        return new ClaimResultDto(job.ToDto(), session.ToDto(), tasks.Select(t => t.ToDto()).ToList());
    }

    private async Task<ClaimResultDto> AdoptUnownedSessionAsync(
        Job job, SimulationSession? session, string simulatorId, string? correlationId, DateTime now)
    {
        if (session is null)
        {
            var created = new SimulationSession
            {
                JobId = job.Id,
                Status = SimulationStatus.Running,
                SimulatorId = simulatorId,
                CorrelationId = correlationId,
                LastHeartbeatUtc = now,
            };
            await _sessions.CreateAsync(created);
            session = created;

            job.SimulationSessionId = session.Id;
            if (!await _jobs.UpdateAsync(job))
            {
                await _sessions.DeleteAsync(session.Id);
                throw new OrchestrationConflictException(
                    "concurrent_modification",
                    $"Job '{job.Id}' was modified concurrently. Reload the job and retry.");
            }
        }
        else
        {
            session.SimulatorId = simulatorId;
            session.CorrelationId = correlationId;
            session.LastHeartbeatUtc = now;
            if (!await _sessions.UpdateAsync(session))
                throw new OrchestrationConflictException(
                    "concurrent_modification",
                    $"Session '{session.Id}' was modified concurrently. Retry the claim.");
        }

        _log.LogInformation("[Server][Jobs] ClaimAdopt → job={JobId} session={SessionId} simulator={SimulatorId} correlation={CorrelationId}",
            job.Id, session.Id, simulatorId, correlationId);

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, job.Id, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, now, correlationId));

        return await BuildClaimResultAsync(job, session);
    }

    private async Task<ClaimResultDto> ReassignExpiredSessionAsync(
        Job job, SimulationSession session, string simulatorId, string? correlationId, DateTime now)
    {
        session.SimulatorId = simulatorId;
        session.CorrelationId = correlationId;
        session.LastHeartbeatUtc = now;
        if (session.Status == SimulationStatus.Faulted)
        {
            session.Status = SimulationStatus.Running;
            session.IsPaused = false;
        }

        if (!await _sessions.UpdateAsync(session))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Session '{session.Id}' was modified concurrently. Retry the claim.");

        _log.LogInformation("[Server][Jobs] ClaimRecover → job={JobId} session={SessionId} simulator={SimulatorId} correlation={CorrelationId}",
            job.Id, session.Id, simulatorId, correlationId);

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, job.Id, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, now, correlationId));

        return await BuildClaimResultAsync(job, session);
    }

    private async Task<ClaimResultDto> BuildClaimResultAsync(Job job, SimulationSession session)
    {
        var tasks = await _tasks.GetByJobIdAsync(job.Id);
        return new ClaimResultDto(job.ToDto(), session.ToDto(), tasks.Select(t => t.ToDto()).ToList());
    }
}

