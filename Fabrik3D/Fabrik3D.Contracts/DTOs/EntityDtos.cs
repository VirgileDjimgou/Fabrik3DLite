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
    Dictionary<string, string> Metadata,
    int Version);

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
    string? ErrorMessage,
    int Version);

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
    DateTime LastHeartbeatUtc,
    string? SimulatorId,
    string? CorrelationId,
    int Version,
    string? ScenarioId,
    string? ScenarioActivityId,
    int ScenarioProgress);

public record ClaimResultDto(
    JobDto Job,
    SimulationSessionDto Session,
    List<TaskDto> Tasks);

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
    string? AcknowledgedBy,
    string LifecycleState,
    DateTime FirstOccurredAtUtc,
    DateTime LastOccurredAtUtc,
    int OccurrenceCount,
    string Cause,
    string Consequence,
    string OperatorGuidance,
    List<AlarmAuditDto> AuditTrail);

public record AlarmAuditDto(string Action, string By, DateTime AtUtc, string? Note);

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

/// <summary>
/// A named, persisted cell template. <c>Content</c> is the versioned cell
/// file JSON (schemaVersion 0.9 or 1.0) retained verbatim for Git review.
/// </summary>
public record CellTemplateDto(
    string Id,
    string Name,
    string SchemaVersion,
    string Content,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    int Version,
    string? CreatedBy = null,
    string? UpdatedBy = null);
