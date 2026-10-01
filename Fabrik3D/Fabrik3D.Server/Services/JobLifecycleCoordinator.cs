using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Jobs;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Authoritative job lifecycle coordinator (S52). It is the only component that derives progress,
/// current task and terminal job state from persisted tasks plus execution-session facts. Task and
/// session services call it after every reported fact; duplicate calls are idempotent because the
/// policy only transitions non-terminal jobs and terminal timestamps are never overwritten.
/// </summary>
public class JobLifecycleCoordinator
{
    private readonly JobRepository _jobs;
    private readonly TaskRepository _tasks;
    private readonly SimulationSessionRepository _sessions;
    private readonly IHubNotificationService _hub;
    private readonly ILogger<JobLifecycleCoordinator> _log;

    public JobLifecycleCoordinator(
        JobRepository jobs,
        TaskRepository tasks,
        SimulationSessionRepository sessions,
        IHubNotificationService hub,
        ILogger<JobLifecycleCoordinator> log)
    {
        _jobs = jobs;
        _tasks = tasks;
        _sessions = sessions;
        _hub = hub;
        _log = log;
    }

    /// <summary>
    /// Recomputes and persists the authoritative snapshot for a job. Returns null when the job is
    /// not visible in the caller's tenant. A concurrent writer wins without throwing: the caller's
    /// fact is already persisted and the next recalculation converges.
    /// </summary>
    public async Task<JobDto?> RecalculateAsync(string jobId, string? correlationId)
    {
        var job = await _jobs.GetByIdAsync(jobId);
        if (job is null) return null;

        var tasks = await _tasks.GetByJobIdAsync(jobId);

        SimulationSession? session = null;
        if (job.SimulationSessionId is not null)
        {
            session = await _sessions.GetByIdAsync(job.SimulationSessionId);
        }
        session ??= await _sessions.GetByJobIdAsync(jobId);

        var snapshot = JobLifecyclePolicy.Evaluate(job.Status, tasks, session?.Status);
        var oldStatus = job.Status;
        var now = DateTime.UtcNow;
        var changed = false;

        if (job.TaskCount != snapshot.RequiredTaskCount)
        {
            job.TaskCount = snapshot.RequiredTaskCount;
            changed = true;
        }

        if (job.CompletedTaskCount != snapshot.CompletedRequiredTaskCount)
        {
            job.CompletedTaskCount = snapshot.CompletedRequiredTaskCount;
            changed = true;
        }

        if (job.ProgressPercent != snapshot.ProgressPercent)
        {
            job.ProgressPercent = snapshot.ProgressPercent;
            changed = true;
        }

        if (job.CurrentTaskIndex != snapshot.CurrentTaskIndex)
        {
            job.CurrentTaskIndex = snapshot.CurrentTaskIndex;
            changed = true;
        }

        switch (snapshot.Outcome)
        {
            case JobLifecycleOutcome.Completed:
                job.Status = JobStatus.Completed;
                job.CompletedAtUtc ??= now;
                changed = true;
                break;
            case JobLifecycleOutcome.Failed:
                job.Status = JobStatus.Failed;
                job.FailedAtUtc ??= now;
                changed = true;
                break;
            case JobLifecycleOutcome.Cancelled:
                job.Status = JobStatus.Cancelled;
                job.CancelledAtUtc ??= now;
                changed = true;
                break;
        }

        if (!changed) return job.ToDto();

        job.UpdatedAtUtc = now;
        if (!await _jobs.UpdateAsync(job))
        {
            // Another writer persisted a newer version; return the authoritative stored state.
            var reloaded = await _jobs.GetByIdAsync(jobId);
            return reloaded?.ToDto();
        }

        if (oldStatus != job.Status)
        {
            _log.LogInformation(
                "[Server][JobLifecycle] {Old}→{New} → job={JobId} progress={Progress}% tasks={Completed}/{Total} correlation={CorrelationId}",
                oldStatus, job.Status, job.Id, job.ProgressPercent,
                job.CompletedTaskCount, job.TaskCount, correlationId);

            await _hub.JobStateChangedAsync(new JobStateChangedEvent(
                job.Id, oldStatus.ToString(), job.Status.ToString(), now, correlationId));
        }

        return job.ToDto();
    }
}