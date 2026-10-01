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

/// <summary>
/// Targeted execution request published to the assigned simulator's SignalR group (S51). The
/// simulator validates the target/session, adopts the session and starts automatically, then
/// acknowledges with the same correlation id. Never broadcast to all clients.
/// </summary>
public record ExecutionDispatchRequestedEvent(
    string JobId,
    string SessionId,
    string TargetCellId,
    string AssignedSimulatorId,
    string CorrelationId,
    DateTime DispatchedAtUtc,
    DateTime TimeoutAtUtc,
    List<string> TaskIds);

/// <summary>
/// Dispatch lifecycle change observed by the HMI (S51): pending, acknowledged, running, failed or
/// timed out. Carries the target and correlation id so the operator sees actionable detail.
/// </summary>
public record DispatchStateChangedEvent(
    string JobId,
    string SessionId,
    string DispatchState,
    string? TargetCellId,
    string? AssignedSimulatorId,
    string? CorrelationId,
    string? FailureReason,
    DateTime TimestampUtc);

/// <summary>
/// Targeted jog command delivered to the assigned simulator's group only (S53). The server has
/// already authorized the Operator role, the compatible mode and the control authority; the
/// simulator still enforces the dead-man, limits, collision and motion-safety path before moving.
/// Deliberately narrow: no broadcast to unrelated simulators or tenants.
/// </summary>
public record JogCommandIssuedEvent(
    string CellId,
    string RobotId,
    string SimulatorId,
    string Action,
    string Joint,
    int Direction,
    string? DeadManToken,
    string? Reason,
    string CorrelationId,
    DateTime IssuedAtUtc);

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
