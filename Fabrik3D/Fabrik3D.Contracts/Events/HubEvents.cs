namespace Fabrik3D.Contracts.Events;

public record JobStateChangedEvent(
    string JobId,
    string OldStatus,
    string NewStatus,
    DateTime TimestampUtc,
    string? CorrelationId = null);

public record SimulationStateChangedEvent(
    string SessionId,
    string JobId,
    string Status,
    string CurrentPhase,
    int MachinedCount,
    int RemainingCount,
    int TotalCount,
    DateTime TimestampUtc,
    string? CorrelationId = null,
    string? ScenarioId = null,
    string? ScenarioActivityId = null,
    int ScenarioProgress = 0);

public record TaskStateChangedEvent(
    string TaskId,
    string JobId,
    string OldStatus,
    string NewStatus,
    DateTime TimestampUtc,
    string? CorrelationId = null);

public record AlarmRaisedEvent(
    string AlarmId,
    string Code,
    string Title,
    string Message,
    string Severity,
    string Source,
    DateTime TimestampUtc);

public record AlarmAcknowledgedEvent(
    string AlarmId,
    string AcknowledgedBy,
    DateTime TimestampUtc);

public record OperatorMessageEvent(
    string MessageId,
    string Title,
    string Message,
    string Type,
    string Source,
    DateTime TimestampUtc);

public record MachineStateChangedEvent(
    string MachineStateId,
    string MachineMode,
    string SimulationStatus,
    string RobotState,
    string CncState,
    string CurrentPhase,
    bool IsRunning,
    bool IsPaused,
    DateTime TimestampUtc);

/// <summary>
/// Broadcast whenever the control authority for a scope changes: acquisition, release, takeover,
/// degraded (lease lost) or conflict rejection. The payload never contains secrets.
/// </summary>
public record ControlAuthorityChangedEvent(
    string Scope,
    string Mode,
    string State,
    string? OwnerId,
    string? OwnerKind,
    string? PreviousMode,
    string? PreviousOwnerId,
    string? DegradedReason,
    DateTime? LeaseExpiresAtUtc,
    string EventType,
    DateTime TimestampUtc,
    string? CorrelationId = null);
