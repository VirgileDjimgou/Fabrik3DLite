using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Server.Services;

public class JobService
{
    private readonly JobRepository _jobs;
    private readonly TaskRepository _tasks;
    private readonly SimulationSessionRepository _sessions;
    private readonly HubNotificationService _hub;
    private readonly ILogger<JobService> _log;

    public JobService(
        JobRepository jobs,
        TaskRepository tasks,
        SimulationSessionRepository sessions,
        HubNotificationService hub,
        ILogger<JobService> log)
    {
        _jobs = jobs;
        _tasks = tasks;
        _sessions = sessions;
        _hub = hub;
        _log = log;
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

    public async Task<JobDto?> StartAsync(string id)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        if (job.Status is not (JobStatus.Created or JobStatus.Ready))
            throw new InvalidOperationException(
                $"Cannot start job in '{job.Status}' state. Only Created or Ready jobs can be started.");

        var oldStatus = job.Status.ToString();
        job.Status = JobStatus.Running;
        job.StartedAtUtc = DateTime.UtcNow;
        job.UpdatedAtUtc = DateTime.UtcNow;

        var tasks = await _tasks.GetByJobIdAsync(id);
        var session = new SimulationSession
        {
            JobId = id,
            Status = SimulationStatus.Running,
            TotalCount = tasks.Count,
            RemainingCount = tasks.Count,
        };
        await _sessions.CreateAsync(session);
        job.SimulationSessionId = session.Id;

        await _jobs.UpdateAsync(job);

        _log.LogInformation("[Server][Jobs] StartAsync → job={JobId} session={SessionId} tasks={TaskCount}", job.Id, session.Id, tasks.Count);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), DateTime.UtcNow));

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, job.Id, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, DateTime.UtcNow));

        return job.ToDto();
    }

    public async Task<JobDto?> PauseAsync(string id)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        if (job.Status is not JobStatus.Running)
            throw new InvalidOperationException(
                $"Cannot pause job in '{job.Status}' state. Only Running jobs can be paused.");

        var oldStatus = job.Status.ToString();
        job.Status = JobStatus.Paused;
        job.PausedAtUtc = DateTime.UtcNow;
        job.UpdatedAtUtc = DateTime.UtcNow;
        await _jobs.UpdateAsync(job);

        if (job.SimulationSessionId is not null)
        {
            var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
            if (session is not null)
            {
                session.Status = SimulationStatus.Paused;
                session.IsPaused = true;
                await _sessions.UpdateAsync(session);

                await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                    session.Id, job.Id, session.Status.ToString(),
                    session.CurrentPhase, session.MachinedCount,
                    session.RemainingCount, session.TotalCount, DateTime.UtcNow));
            }
        }

        _log.LogInformation("[Server][Jobs] PauseAsync → job={JobId}", job.Id);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), DateTime.UtcNow));

        return job.ToDto();
    }

    public async Task<JobDto?> ResumeAsync(string id)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        if (job.Status is not JobStatus.Paused)
            throw new InvalidOperationException(
                $"Cannot resume job in '{job.Status}' state. Only Paused jobs can be resumed.");

        var oldStatus = job.Status.ToString();
        job.Status = JobStatus.Running;
        job.PausedAtUtc = null;
        job.UpdatedAtUtc = DateTime.UtcNow;
        await _jobs.UpdateAsync(job);

        if (job.SimulationSessionId is not null)
        {
            var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
            if (session is not null)
            {
                session.Status = SimulationStatus.Running;
                session.IsPaused = false;
                await _sessions.UpdateAsync(session);

                await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                    session.Id, job.Id, session.Status.ToString(),
                    session.CurrentPhase, session.MachinedCount,
                    session.RemainingCount, session.TotalCount, DateTime.UtcNow));
            }
        }

        _log.LogInformation("[Server][Jobs] ResumeAsync → job={JobId}", job.Id);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), DateTime.UtcNow));

        return job.ToDto();
    }

    public async Task<JobDto?> StopAsync(string id)
    {
        var job = await _jobs.GetByIdAsync(id);
        if (job is null) return null;

        if (job.Status is not (JobStatus.Running or JobStatus.Paused))
            throw new InvalidOperationException(
                $"Cannot stop job in '{job.Status}' state. Only Running or Paused jobs can be stopped.");

        var oldStatus = job.Status.ToString();
        job.Status = JobStatus.Stopped;
        job.StoppedAtUtc = DateTime.UtcNow;
        job.UpdatedAtUtc = DateTime.UtcNow;
        await _jobs.UpdateAsync(job);

        if (job.SimulationSessionId is not null)
        {
            var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
            if (session is not null)
            {
                session.Status = SimulationStatus.Stopped;
                session.IsPaused = false;
                session.EndedAtUtc = DateTime.UtcNow;
                await _sessions.UpdateAsync(session);

                await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                    session.Id, job.Id, session.Status.ToString(),
                    session.CurrentPhase, session.MachinedCount,
                    session.RemainingCount, session.TotalCount, DateTime.UtcNow));
            }
        }

        _log.LogInformation("[Server][Jobs] StopAsync → job={JobId}", job.Id);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), DateTime.UtcNow));

        return job.ToDto();
    }

    public async Task<List<TaskDto>> GetTasksByJobIdAsync(string jobId)
    {
        var tasks = await _tasks.GetByJobIdAsync(jobId);
        return tasks.Select(t => t.ToDto()).ToList();
    }
}
