namespace Fabrik3D.Contracts.Events;

public record JobStateChangedEvent(
    string JobId,
    string OldStatus,
    string NewStatus,
    DateTime TimestampUtc);

public record SimulationStateChangedEvent(
    string SessionId,
    string JobId,
    string Status,
    string CurrentPhase,
    int MachinedCount,
    int RemainingCount,
    int TotalCount,
    DateTime TimestampUtc);

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
