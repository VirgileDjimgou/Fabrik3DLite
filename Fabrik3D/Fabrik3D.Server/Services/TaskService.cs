using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Task lifecycle updates reported by the owning simulator.
/// Status changes are rule-checked and tied to the claimed session.
/// </summary>
public class TaskService
{
    private readonly TaskRepository _tasks;
    private readonly JobRepository _jobs;
    private readonly SimulationSessionRepository _sessions;
    private readonly IHubNotificationService _hub;
    private readonly ILogger<TaskService> _log;

    public TaskService(
        TaskRepository tasks,
        JobRepository jobs,
        SimulationSessionRepository sessions,
        IHubNotificationService hub,
        ILogger<TaskService> log)
    {
        _tasks = tasks;
        _jobs = jobs;
        _sessions = sessions;
        _hub = hub;
        _log = log;
    }

    public async Task<TaskDto?> UpdateStatusAsync(
        string taskId, UpdateTaskStatusRequest request, string? correlationId)
    {
        var task = await _tasks.GetByIdAsync(taskId);
        if (task is null) return null;

        var job = await _jobs.GetByIdAsync(task.JobId);
        if (job is null || job.SimulationSessionId is null)
            throw new OrchestrationConflictException(
                "task_not_runnable",
                $"Task '{taskId}' belongs to a job without an active simulation session.");

        if (job.SimulationSessionId != request.SimulationSessionId)
            throw new OrchestrationConflictException(
                "session_not_owned",
                $"Task '{taskId}' belongs to session '{job.SimulationSessionId}', not '{request.SimulationSessionId}'.");

        var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
        if (session is null || session.SimulatorId != request.SimulatorId)
            throw new OrchestrationConflictException(
                "session_not_owned",
                $"Task '{taskId}' cannot be updated: simulator '{request.SimulatorId}' does not own session '{job.SimulationSessionId}'.");

        if (!Enum.TryParse<TaskStatusEnum>(request.Status, true, out var newStatus))
            throw new InvalidOperationException($"Unknown task status '{request.Status}'.");

        var oldStatus = task.Status;
        switch (newStatus)
        {
            case TaskStatusEnum.Running:
                TaskStateTransitionRules.EnsureCanRun(task.Status);
                task.StartedAtUtc = DateTime.UtcNow;
                break;
            case TaskStatusEnum.Completed:
                TaskStateTransitionRules.EnsureCanComplete(task.Status);
                task.CompletedAtUtc = DateTime.UtcNow;
                break;
            case TaskStatusEnum.Failed:
                TaskStateTransitionRules.EnsureCanFail(task.Status);
                break;
            case TaskStatusEnum.Cancelled:
                TaskStateTransitionRules.EnsureCanCancel(task.Status);
                break;
            default:
                throw new InvalidOperationException(
                    $"Simulators may only report Running, Completed, Failed or Cancelled task states, not '{newStatus}'.");
        }

        task.Status = newStatus;
        task.ErrorMessage = request.ErrorMessage;
        task.UpdatedAtUtc = DateTime.UtcNow;

        if (!await _tasks.UpdateAsync(task))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Task '{taskId}' was modified concurrently. Reload the task and retry.");

        _log.LogInformation("[Server][Tasks] UpdateStatus → task={TaskId} job={JobId} {Old}→{New} correlation={CorrelationId}",
            task.Id, task.JobId, oldStatus, newStatus, correlationId);

        await _hub.TaskStateChangedAsync(new TaskStateChangedEvent(
            task.Id, task.JobId, oldStatus.ToString(), newStatus.ToString(),
            DateTime.UtcNow, correlationId));

        return task.ToDto();
    }
}
