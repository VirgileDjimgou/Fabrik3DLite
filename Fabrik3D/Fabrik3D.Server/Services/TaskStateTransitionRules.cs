using Fabrik3D.Contracts.Enums;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Explicit lifecycle rules for machining tasks, shared by the
/// task service and its tests.
/// </summary>
public static class TaskStateTransitionRules
{
    public static bool CanRun(TaskStatusEnum status) => status is TaskStatusEnum.Pending or TaskStatusEnum.Ready;
    public static bool CanComplete(TaskStatusEnum status) => status is TaskStatusEnum.Running;
    public static bool CanFail(TaskStatusEnum status) => status is TaskStatusEnum.Running;
    public static bool CanCancel(TaskStatusEnum status) =>
        status is TaskStatusEnum.Pending or TaskStatusEnum.Ready or TaskStatusEnum.Running or TaskStatusEnum.Paused;

    public static void EnsureCanRun(TaskStatusEnum status) =>
        Ensure(CanRun(status), "run", "started", status, "Pending or Ready");

    public static void EnsureCanComplete(TaskStatusEnum status) =>
        Ensure(CanComplete(status), "complete", "completed", status, "Running");

    public static void EnsureCanFail(TaskStatusEnum status) =>
        Ensure(CanFail(status), "fail", "failed", status, "Running");

    public static void EnsureCanCancel(TaskStatusEnum status) =>
        Ensure(CanCancel(status), "cancel", "cancelled", status, "Pending, Ready, Running or Paused");

    private static void Ensure(bool allowed, string action, string pastAction, TaskStatusEnum status, string allowedStates)
    {
        if (!allowed)
        {
            throw new InvalidOperationException(
                $"Cannot {action} task in '{status}' state. Only {allowedStates} tasks can be {pastAction}.");
        }
    }
}
