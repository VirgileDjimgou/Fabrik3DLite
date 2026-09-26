using System.ComponentModel.DataAnnotations;

namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// A persisted training session as returned by the API (S44). Scores are always the server-computed
/// authoritative values; the client never supplies them.
/// </summary>
public record TrainingSessionDto(
    string Id,
    string? OrganizationId,
    string? ClassId,
    string LearnerSubject,
    string? Alias,
    string ScenarioId,
    string ScenarioVersion,
    string? SimulationSessionId,
    string? SimulatorId,
    DateTime StartedAtUtc,
    DateTime? EndedAtUtc,
    string Status,
    bool Completed,
    int CompletionPercent,
    IReadOnlyList<string> ExpectedActions,
    int ActionCount,
    int FaultCount,
    int HintCount,
    int SafetyViolationCount,
    int RecoveryActionCount,
    int Score,
    int PossibleScore,
    string AssessmentSchemaVersion,
    string ScoringRuleVersion,
    string SoftwareVersion,
    string AssessmentStatus,
    string? AssessmentDiagnostic,
    TrainingAssessmentDto? Assessment,
    IReadOnlyList<TrainingAuditEntryDto> Audit,
    int Version);

/// <summary>One typed recorded action/event with its optional fault/hint/violation/recovery payload.</summary>
public record TrainingActionDto(
    string Id,
    string ActionId,
    string? CorrelationId,
    string Role,
    string Type,
    string? Target,
    string? ExpectedActionId,
    string Correctness,
    string Severity,
    DateTime TimestampUtc,
    long Sequence,
    bool IsFault,
    bool IsHint,
    bool IsRecovery,
    bool IsSafetyViolation,
    ReportedHintDto? Hint,
    ReportedSafetyViolationDto? SafetyViolation,
    ReportedRecoveryDto? Recovery,
    string SchemaVersion,
    DateTime RecordedAtUtc);

/// <summary>Deterministic assessment output with evidence, explanations and versioning.</summary>
public record TrainingAssessmentDto(
    string ScoringRuleVersion,
    string AssessmentSchemaVersion,
    string SoftwareVersion,
    int ComputedScore,
    int ComputedPossibleScore,
    int EffectiveScore,
    int EffectivePossibleScore,
    bool Complete,
    string Status,
    string? Diagnostic,
    string Disclaimer,
    string EducationalScope,
    IReadOnlyList<TrainingCriterionDto> Criteria,
    int AssessmentVersion,
    IReadOnlyList<TrainingCorrectionDto> Corrections,
    DateTime ComputedAtUtc);

/// <summary>One scored criterion with its explanation and evidence references.</summary>
public record TrainingCriterionDto(
    string Id,
    string Label,
    string Explanation,
    int Points,
    int Earned,
    bool Passed,
    IReadOnlyList<string> Evidence);

/// <summary>An audited correction to an assessment. The computed score is preserved.</summary>
public record TrainingCorrectionDto(
    int FromVersion,
    int ToVersion,
    int PreviousEffectiveScore,
    int NewEffectiveScore,
    string Reason,
    string CorrectedBySubject,
    DateTime CorrectedAtUtc);

/// <summary>Append-only audit entry for a training session.</summary>
public record TrainingAuditEntryDto(
    string Action,
    string Subject,
    string? Detail,
    DateTime AtUtc);

/// <summary>Result of one idempotent action batch.</summary>
public record TrainingIngestionResultDto(
    int Inserted,
    int Duplicates,
    int ActionCount,
    int FaultCount,
    int HintCount,
    int SafetyViolationCount,
    int RecoveryActionCount,
    TrainingAssessmentDto? Assessment);

/// <summary>
/// Server-stored training report with its educational-scope statement. Exported JSON keeps a shape
/// compatible with the local simulator report where practical.
/// </summary>
public record TrainingReportDto(
    string SchemaVersion,
    string ReportKind,
    DateTime GeneratedAtUtc,
    string AssessmentAuthority,
    string EducationalScope,
    string Disclaimer,
    TrainingSessionDto Session,
    TrainingAssessmentDto? Assessment,
    IReadOnlyList<TrainingActionDto> Actions,
    TrainingReportMetricsDto Metrics);

/// <summary>Compact report metrics mirroring the local simulator report fields.</summary>
public record TrainingReportMetricsDto(
    bool ScenarioCompleted,
    int StepsAttempted,
    int FaultsEncountered,
    int HintsUsed,
    int RecoveryActions,
    int SafetyViolations,
    int IncorrectActions);

/// <summary>
/// One ranked aggregate entry (S45): a stable action/fault/rule key and how often it was observed in
/// the tenant-scoped, filtered session window.
/// </summary>
public record TrainingMetricCountDto(string Key, int Count);

/// <summary>
/// Server-computed instructor aggregate (S45). It is a teaching aid over stored simulated training
/// evidence, computed on demand with tenant-scoped queries. The definitions are versioned
/// (<see cref="DefinitionsVersion"/>) and documented in <c>docs/architecture/INSTRUCTOR_DASHBOARD.md</c>;
/// it is deliberately not a grade or a certification.
/// </summary>
public record InstructorMetricsDto(
    string AssessmentSchemaVersion,
    string DefinitionsVersion,
    string ScoringRuleVersion,
    DateTime GeneratedAtUtc,
    string? ClassId,
    string? ScenarioId,
    DateTime? FromUtc,
    DateTime? ToUtc,
    int SessionCount,
    int CompletedCount,
    int FailedCount,
    int RunningCount,
    int TerminalCount,
    double CompletionRate,
    int MeanSessionSeconds,
    int MeanDiagnosisSeconds,
    int TotalActions,
    int IncorrectActionCount,
    int HintCount,
    int SessionsWithHints,
    double MeanHintsPerSession,
    int FaultCount,
    int RecoveryActionCount,
    int SafetyViolationCount,
    int SessionsWithSafetyViolations,
    IReadOnlyList<TrainingMetricCountDto> CommonIncorrectActions,
    IReadOnlyList<TrainingMetricCountDto> RepeatedFaultTypes,
    IReadOnlyList<TrainingMetricCountDto> SafetyMistakeRules,
    bool Truncated,
    string EducationalNote);

/// <summary>Audited request to restart a completed/failed simulated training session (S45).</summary>
public record RestartTrainingSessionRequest
{
    [MaxLength(500)]
    public string? Reason { get; init; }
}

/// <summary>
/// Result of a training-session restart (S45). The original session is preserved and audited; a new
/// running session for the same learner/scenario/class is returned.
/// </summary>
public record RestartTrainingSessionResultDto(
    TrainingSessionDto Session,
    string RestartedFromSessionId,
    string? Reason);

/// <summary>Starts a training session. The learner subject is always bound from the caller identity.</summary>
public record StartTrainingSessionRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string ScenarioId { get; init; } = string.Empty;

    [MaxLength(50)]
    public string? ScenarioVersion { get; init; }

    [MaxLength(40)]
    public string? ClassId { get; init; }

    [MaxLength(40)]
    public string? SimulationSessionId { get; init; }

    [MaxLength(200)]
    public string? SimulatorId { get; init; }

    [MaxLength(40)]
    public string? Alias { get; init; }

    public List<string> ExpectedActions { get; init; } = [];
}

/// <summary>A bounded, idempotent batch of reported actions/events.</summary>
public record ReportTrainingActionsRequest
{
    [Required]
    public List<ReportedTrainingAction> Actions { get; init; } = [];
}

/// <summary>One reported action/event. <c>ActionId</c> is the idempotency key.</summary>
public record ReportedTrainingAction
{
    [Required, MinLength(1), MaxLength(120)]
    public string ActionId { get; init; } = string.Empty;

    [MaxLength(120)]
    public string? CorrelationId { get; init; }

    /// <summary>expected or observed. Defaults to observed.</summary>
    [MaxLength(20)]
    public string? Role { get; init; }

    [Required, MinLength(1), MaxLength(200)]
    public string Type { get; init; } = string.Empty;

    [MaxLength(200)]
    public string? Target { get; init; }

    [MaxLength(200)]
    public string? ExpectedActionId { get; init; }

    /// <summary>unknown, correct or incorrect. Defaults to unknown.</summary>
    [MaxLength(20)]
    public string? Correctness { get; init; }

    /// <summary>info, warning, error or critical. Defaults to info.</summary>
    [MaxLength(20)]
    public string? Severity { get; init; }

    public DateTime TimestampUtc { get; init; } = DateTime.UtcNow;

    public long Sequence { get; init; }

    public bool IsFault { get; init; }

    public bool IsHint { get; init; }

    public bool IsRecovery { get; init; }

    public bool IsSafetyViolation { get; init; }

    public ReportedHintDto? Hint { get; init; }

    public ReportedSafetyViolationDto? SafetyViolation { get; init; }

    public ReportedRecoveryDto? Recovery { get; init; }
}

/// <summary>Typed hint payload.</summary>
public record ReportedHintDto
{
    [Required, MinLength(1), MaxLength(120)]
    public string HintId { get; init; } = string.Empty;

    public int Level { get; init; }

    public DateTime RevealedAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>Typed safety-violation payload.</summary>
public record ReportedSafetyViolationDto
{
    [Required, MinLength(1), MaxLength(120)]
    public string RuleId { get; init; } = string.Empty;

    [MaxLength(500)]
    public string Description { get; init; } = string.Empty;

    /// <summary>info, warning, error or critical. Defaults to error.</summary>
    [MaxLength(20)]
    public string? Severity { get; init; }
}

/// <summary>Typed recovery payload.</summary>
public record ReportedRecoveryDto
{
    [MaxLength(120)]
    public string? FaultId { get; init; }

    [MaxLength(120)]
    public string? RecoveredActionId { get; init; }

    public bool Successful { get; init; } = true;

    [MaxLength(200)]
    public string? Target { get; init; }
}

/// <summary>Marks a session complete (or failed) and returns the computed assessment.</summary>
public record CompleteTrainingSessionRequest
{
    public bool Completed { get; init; } = true;

    [Range(0, 100)]
    public int? CompletionPercent { get; init; }

    public DateTime? EndedAtUtc { get; init; }
}

/// <summary>Audited correction of a stored assessment. Never overwrites the computed criteria.</summary>
public record CorrectAssessmentRequest
{
    [Required, MinLength(1), MaxLength(500)]
    public string Reason { get; init; } = string.Empty;

    [Range(0, 1000)]
    public int AdjustedScore { get; init; }
}

/// <summary>
/// Best-effort import of a local simulator report JSON (S44). The local score is deliberately
/// ignored: the server recomputes the authoritative assessment from the imported evidence.
/// </summary>
public record ImportLocalTrainingReportRequest
{
    [MaxLength(20)]
    public string? SchemaVersion { get; init; }

    [MaxLength(40)]
    public string? SessionAlias { get; init; }

    public DateTime? GeneratedAt { get; init; }

    [Required, MinLength(1), MaxLength(200)]
    public string ScenarioId { get; init; } = string.Empty;

    public ImportLocalReportMetricsDto Metrics { get; init; } = new();

    public List<string> ExpectedActions { get; init; } = [];

    public List<string> ObservedActions { get; init; } = [];
}

/// <summary>Metrics of a locally produced simulator report.</summary>
public record ImportLocalReportMetricsDto
{
    public bool ScenarioCompleted { get; init; }

    public int StepsAttempted { get; init; }

    public int FaultsEncountered { get; init; }

    public int HintsUsed { get; init; }

    public int RecoveryActions { get; init; }
}
