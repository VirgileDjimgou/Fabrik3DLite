using Fabrik3D.Contracts.Enums;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Explicit lifecycle rules shared by the orchestration service and its tests.
/// </summary>
public static class JobStateTransitionRules
{
    public static bool CanStart(JobStatus status) => status is JobStatus.Created or JobStatus.Ready;
    public static bool CanPause(JobStatus status) => status is JobStatus.Running;
    public static bool CanResume(JobStatus status) => status is JobStatus.Paused;
    public static bool CanStop(JobStatus status) => status is JobStatus.Running or JobStatus.Paused;

    public static void EnsureCanStart(JobStatus status) =>
        Ensure(CanStart(status), "start", "started", status, "Created or Ready");

    public static void EnsureCanPause(JobStatus status) =>
        Ensure(CanPause(status), "pause", "paused", status, "Running");

    public static void EnsureCanResume(JobStatus status) =>
        Ensure(CanResume(status), "resume", "resumed", status, "Paused");

    public static void EnsureCanStop(JobStatus status) =>
        Ensure(CanStop(status), "stop", "stopped", status, "Running or Paused");

    private static void Ensure(bool allowed, string action, string pastAction, JobStatus status, string allowedStates)
    {
        if (!allowed)
        {
            throw new InvalidOperationException(
                $"Cannot {action} job in '{status}' state. Only {allowedStates} jobs can be {pastAction}.");
        }
    }
}
