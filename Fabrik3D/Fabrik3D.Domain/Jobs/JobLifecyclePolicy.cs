using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Domain.Jobs;

/// <summary>Terminal outcome the authoritative lifecycle policy derives from persisted facts.</summary>
public enum JobLifecycleOutcome
{
    /// <summary>No terminal transition is justified by the current facts.</summary>
    None,

    /// <summary>Every required task and the execution session completed.</summary>
    Completed,

    /// <summary>A required task failed or the execution session faulted.</summary>
    Failed,

    /// <summary>Every required task was cancelled.</summary>
    Cancelled,
}

/// <summary>Server-derived progress facts for a job.</summary>
public sealed record JobProgressSnapshot(
    int RequiredTaskCount,
    int CompletedRequiredTaskCount,
    int ProgressPercent,
    int CurrentTaskIndex,
    JobLifecycleOutcome Outcome);

/// <summary>
/// Authoritative job lifecycle and progress policy (S52). Pure and deterministic so the same rules
/// are used by the coordinator, the composer and the tests. The server is the only writer of
/// progress and terminal state; clients and simulators only report task/session facts.
/// </summary>
public static class JobLifecyclePolicy
{
    /// <summary>
    /// Progress denominator: the number of required tasks. Rounding rule: floor of
    /// <c>completedRequired * 100 / requiredCount</c>, clamped to 0..100. A job without required
    /// tasks reports 0% (legacy records keep their stored value).
    /// </summary>
    public static int ComputeProgressPercent(int completedRequired, int requiredCount)
    {
        if (requiredCount <= 0) return 0;
        var percent = (int)Math.Floor(completedRequired * 100.0 / requiredCount);
        return Math.Clamp(percent, 0, 100);
    }

    /// <summary>
    /// Zero-based index of the first task that is neither Completed nor Cancelled in the supplied
    /// stable order. When every task is terminal the index equals the task count (past-end sentinel).
    /// </summary>
    public static int ComputeCurrentTaskIndex(IReadOnlyList<MachiningTask> orderedTasks)
    {
        for (var i = 0; i < orderedTasks.Count; i++)
        {
            var status = orderedTasks[i].Status;
            if (status is not (TaskStatusEnum.Completed or TaskStatusEnum.Cancelled)) return i;
        }
        return orderedTasks.Count;
    }

    /// <summary>
    /// Evaluates the authoritative snapshot. Completion requires at least one required task, every
    /// required task Completed, and the execution session Completed. A failed required task or a
    /// Faulted session fails the job. All required tasks Cancelled cancels the job. Jobs already in
    /// a terminal state never transition again, so previous terminal timestamps are preserved.
    /// </summary>
    public static JobProgressSnapshot Evaluate(
        JobStatus jobStatus,
        IReadOnlyList<MachiningTask> orderedTasks,
        SimulationStatus? sessionStatus)
    {
        var required = orderedTasks.Where(t => t.IsRequired).ToList();
        var completed = required.Count(t => t.Status == TaskStatusEnum.Completed);
        var progress = ComputeProgressPercent(completed, required.Count);
        var currentIndex = ComputeCurrentTaskIndex(orderedTasks);

        var outcome = JobLifecycleOutcome.None;
        if (!IsTerminal(jobStatus))
        {
            if (sessionStatus == SimulationStatus.Faulted
                || required.Any(t => t.Status == TaskStatusEnum.Failed))
            {
                outcome = JobLifecycleOutcome.Failed;
            }
            else if (required.Count > 0
                     && completed == required.Count
                     && sessionStatus == SimulationStatus.Completed)
            {
                outcome = JobLifecycleOutcome.Completed;
            }
            else if (required.Count > 0
                     && required.All(t => t.Status == TaskStatusEnum.Cancelled))
            {
                outcome = JobLifecycleOutcome.Cancelled;
            }
        }

        return new JobProgressSnapshot(required.Count, completed, progress, currentIndex, outcome);
    }

    public static bool IsTerminal(JobStatus status) =>
        status is JobStatus.Completed or JobStatus.Stopped or JobStatus.Failed or JobStatus.Cancelled;
}