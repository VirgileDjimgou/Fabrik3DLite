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
    int Version,
    string? TargetCellId = null,
    string? AssignedSimulatorId = null,
    string DispatchState = "None",
    string? DispatchCorrelationId = null,
    DateTime? DispatchedAtUtc = null,
    DateTime? DispatchAcknowledgedAtUtc = null,
    DateTime? DispatchTimeoutAtUtc = null,
    string? DispatchFailureReason = null,
    int Priority = 0,
    string? ScenarioId = null,
    string? CellTemplateId = null,
    string? PalletId = null,
    int PalletRows = 0,
    int PalletColumns = 0,
    int TaskCount = 0,
    int CompletedTaskCount = 0,
    int SchemaVersion = 1,
    DateTime? FailedAtUtc = null,
    DateTime? CancelledAtUtc = null);

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
    int Version,
    string? SlotKey = null,
    bool IsRequired = true);

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
    int ScenarioProgress,
    string? TargetCellId = null);

public record ClaimResultDto(
    JobDto Job,
    SimulationSessionDto Session,
    List<TaskDto> Tasks);

/// <summary>
/// Result of a server-authoritative dispatch request (S51). The HMI observes the dispatch state
/// through this payload and the targeted <c>ExecutionDispatchRequested</c> SignalR event.
/// </summary>
public record DispatchResultDto(
    JobDto Job,
    SimulationSessionDto Session,
    List<TaskDto> Tasks,
    string DispatchState,
    string? TargetCellId,
    string? AssignedSimulatorId,
    string? DispatchCorrelationId,
    DateTime? DispatchTimeoutAtUtc,
    string? FailureReason);

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

// ── Job composer read models (S52) ─────────────────────────────────

/// <summary>A selectable target cell with its compatibility metadata and live availability.</summary>
public record ComposerCellOptionDto(
    string Id,
    string Name,
    bool Available,
    int SimulatorCount,
    List<string> CompatibleScenarioIds,
    string DefaultScenarioId);

/// <summary>A selectable scenario/recipe.</summary>
public record ComposerScenarioOptionDto(
    string Id,
    string Name,
    string Level);

/// <summary>A selectable persisted cell template.</summary>
public record ComposerCellTemplateOptionDto(
    string Id,
    string Name,
    string SchemaVersion);

/// <summary>Everything the HMI composer needs to build a valid definition.</summary>
public record JobComposerOptionsDto(
    List<ComposerCellOptionDto> Cells,
    List<ComposerScenarioOptionDto> Scenarios,
    List<ComposerCellTemplateOptionDto> CellTemplates,
    int MaxRows,
    int MaxColumns,
    int MaxTasks);

/// <summary>Actionable validation issue returned by the composer preview.</summary>
public record ComposerValidationIssueDto(
    string Code,
    string Field,
    string Message);

/// <summary>A deterministically generated task preview (no id assigned yet).</summary>
public record GeneratedTaskPreviewDto(
    int SequenceOrder,
    string Name,
    string PartType,
    string PalletId,
    int SlotRow,
    int SlotColumn,
    string StableKey);

/// <summary>Result of validating a composer definition before submission.</summary>
public record JobComposerPreviewDto(
    bool Valid,
    string? ResolvedTargetCellId,
    string? ScenarioId,
    int TaskCount,
    List<GeneratedTaskPreviewDto> Tasks,
    List<ComposerValidationIssueDto> Errors,
    List<ComposerValidationIssueDto> Warnings);
