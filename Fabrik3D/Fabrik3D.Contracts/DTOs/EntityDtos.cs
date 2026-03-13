namespace Fabrik3D.Contracts.DTOs;

public record JobDto(
    string Id,
    string Name,
    string Description,
    string Status,
    string MachineMode,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    DateTime? StartedAtUtc,
    DateTime? CompletedAtUtc,
    DateTime? PausedAtUtc,
    DateTime? StoppedAtUtc,
    int CurrentTaskIndex,
    int ProgressPercent,
    string? SimulationSessionId,
    Dictionary<string, string> Metadata);

public record TaskDto(
    string Id,
    string JobId,
    string Name,
    string Description,
    string Status,
    int SequenceOrder,
    string PartType,
    string? PalletId,
    int SlotRow,
    int SlotColumn,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    DateTime? StartedAtUtc,
    DateTime? CompletedAtUtc,
    string? ErrorMessage);

public record SimulationSessionDto(
    string Id,
    string JobId,
    string Status,
    DateTime StartedAtUtc,
    DateTime? EndedAtUtc,
    bool IsPaused,
    string CurrentPhase,
    string? CurrentPalletId,
    string? CurrentTaskId,
    string? CurrentPartId,
    int MachinedCount,
    int RemainingCount,
    int TotalCount,
    DateTime LastHeartbeatUtc);

public record AlarmDto(
    string Id,
    string Code,
    string Title,
    string Message,
    string Severity,
    string Source,
    string? JobId,
    string? SimulationSessionId,
    DateTime CreatedAtUtc,
    bool Acknowledged,
    DateTime? AcknowledgedAtUtc,
    string? AcknowledgedBy);

public record OperatorMessageDto(
    string Id,
    string Title,
    string Message,
    string Type,
    string Source,
    string? JobId,
    string? SimulationSessionId,
    DateTime CreatedAtUtc,
    bool Read,
    DateTime? ReadAtUtc);

public record MachineStateDto(
    string Id,
    string? SimulationSessionId,
    string MachineMode,
    string SimulationStatus,
    string RobotState,
    string CncState,
    string CurrentPhase,
    string? CurrentPalletId,
    string? CurrentTaskId,
    string? CurrentPartId,
    int CurrentSlotRow,
    int CurrentSlotColumn,
    bool IsRunning,
    bool IsPaused,
    DateTime LastUpdatedAtUtc);
