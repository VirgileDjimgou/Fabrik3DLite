using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Training;

/// <summary>
/// A persisted training session (S44). It is the durable server-side counterpart of a simulator run:
/// learner, organization/class, scenario (id + version), simulator/session references, start/end,
/// status, completion, expected actions, the authoritative deterministic assessment and the
/// software/schema/scoring versions needed to interpret the stored score later.
/// </summary>
public class TrainingSession
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary (S43). Never null for documents created after S44.</summary>
    public string? OrganizationId { get; set; }

    /// <summary>Class/cohort the learner belongs to, when the session was started for one.</summary>
    [BsonRepresentation(BsonType.ObjectId)]
    public string? ClassId { get; set; }

    /// <summary>Authenticated subject of the learner who owns the session; never client-supplied.</summary>
    public string LearnerSubject { get; set; } = string.Empty;

    /// <summary>Optional pseudonymous display alias (sanitized before persistence).</summary>
    public string? Alias { get; set; }

    public string ScenarioId { get; set; } = string.Empty;

    /// <summary>Scenario document version the run was produced against.</summary>
    public string ScenarioVersion { get; set; } = TrainingSchema.Version;

    /// <summary>Optional reference to the orchestration simulation session backing this run.</summary>
    [BsonRepresentation(BsonType.ObjectId)]
    public string? SimulationSessionId { get; set; }

    /// <summary>Optional simulator instance/device that reported the evidence.</summary>
    public string? SimulatorId { get; set; }

    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? EndedAtUtc { get; set; }

    [BsonRepresentation(BsonType.String)]
    public TrainingSessionStatus Status { get; set; } = TrainingSessionStatus.Running;

    /// <summary>True when the simulator reported the scenario as completed.</summary>
    public bool Completed { get; set; }

    /// <summary>Scenario completion percent 0..100 reported by the simulator (advisory).</summary>
    public int CompletionPercent { get; set; }

    /// <summary>Expected actions declared by the simulator at start (bounded, ordinal-compared).</summary>
    public List<string> ExpectedActions { get; set; } = [];

    /// <summary>Number of recorded observed/expected action records for this session.</summary>
    public int ActionCount { get; set; }

    public int FaultCount { get; set; }

    public int HintCount { get; set; }

    public int SafetyViolationCount { get; set; }

    public int RecoveryActionCount { get; set; }

    /// <summary>Authoritative server score (effective score after any audited correction).</summary>
    public int Score { get; set; }

    public int PossibleScore { get; set; }

    public string AssessmentSchemaVersion { get; set; } = TrainingSchema.Version;

    public string ScoringRuleVersion { get; set; } = TrainingSchema.ScoringRuleVersion;

    public string SoftwareVersion { get; set; } = TrainingSchema.SoftwareVersion;

    [BsonRepresentation(BsonType.String)]
    public TrainingAssessmentStatus AssessmentStatus { get; set; } = TrainingAssessmentStatus.Pending;

    /// <summary>Diagnostic when the assessment could not be computed; no score is fabricated then.</summary>
    public string? AssessmentDiagnostic { get; set; }

    public TrainingAssessmentRecord? Assessment { get; set; }

    /// <summary>Append-only audit trail of session lifecycle and correction events.</summary>
    public List<TrainingAuditEntry> Audit { get; set; } = [];

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>Optimistic concurrency guard; bumped on every update.</summary>
    public int Version { get; set; }
}

/// <summary>
/// A typed, reported action or event (S44). Expected and observed records share one shape so the
/// deterministic engine and the report can compare them directly. Faults, hints, safety violations
/// and recoveries are typed sub-records, never free-text blobs.
/// </summary>
public class TrainingActionRecord
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    public string? OrganizationId { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    public string SessionId { get; set; } = null!;

    /// <summary>
    /// Client-supplied idempotency key, unique within a session. Re-reporting the same key is a
    /// no-op, which makes a reconnecting simulator's retry safe.
    /// </summary>
    public string ActionId { get; set; } = string.Empty;

    public string? CorrelationId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public TrainingActionRole Role { get; set; } = TrainingActionRole.Observed;

    /// <summary>Stable action/event type (for example <c>PICK_PART</c> or <c>scenario.ready</c>).</summary>
    public string Type { get; set; } = string.Empty;

    public string? Target { get; set; }

    /// <summary>Optional link to the expected action this observation satisfies.</summary>
    public string? ExpectedActionId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public TrainingActionCorrectness Correctness { get; set; } = TrainingActionCorrectness.Unknown;

    [BsonRepresentation(BsonType.String)]
    public TrainingActionSeverity Severity { get; set; } = TrainingActionSeverity.Info;

    /// <summary>Simulator-reported timestamp of the action.</summary>
    public DateTime TimestampUtc { get; set; }

    /// <summary>Monotonic sequence for deterministic ordering independent of timestamp resolution.</summary>
    public long Sequence { get; set; }

    public bool IsFault { get; set; }

    public bool IsHint { get; set; }

    public bool IsRecovery { get; set; }

    public bool IsSafetyViolation { get; set; }

    public HintUsage? Hint { get; set; }

    public SafetyViolation? SafetyViolation { get; set; }

    public RecoveryAction? Recovery { get; set; }

    public string SchemaVersion { get; set; } = TrainingSchema.Version;

    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Typed record of one hint revealed to the learner during a session.</summary>
public class HintUsage
{
    public string HintId { get; set; } = string.Empty;

    /// <summary>Optional hint level (1 = nudge, higher = more explicit).</summary>
    public int Level { get; set; }

    public DateTime RevealedAtUtc { get; set; }
}

/// <summary>Typed record of one safety-rule violation observed (simulated training data only).</summary>
public class SafetyViolation
{
    public string RuleId { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    public TrainingActionSeverity Severity { get; set; } = TrainingActionSeverity.Error;
}

/// <summary>Typed record of a recovery action taken after a simulated fault or incorrect action.</summary>
public class RecoveryAction
{
    /// <summary>Optional reference to the fault/action being recovered from.</summary>
    public string? FaultId { get; set; }

    /// <summary>Optional reference to the incorrect action being recovered from.</summary>
    public string? RecoveredActionId { get; set; }

    public bool Successful { get; set; }

    public string? Target { get; set; }
}

/// <summary>
/// The deterministic assessment output persisted with a session (S44). <see cref="ComputedScore"/>
/// is never mutated after computation; audited corrections append to <see cref="Corrections"/> and
/// update <see cref="EffectiveScore"/> only.
/// </summary>
public class TrainingAssessmentRecord
{
    public string ScoringRuleVersion { get; set; } = TrainingSchema.ScoringRuleVersion;

    public string AssessmentSchemaVersion { get; set; } = TrainingSchema.Version;

    public string SoftwareVersion { get; set; } = TrainingSchema.SoftwareVersion;

    public int ComputedScore { get; set; }

    public int ComputedPossibleScore { get; set; }

    /// <summary>Score used by reports; equals <see cref="ComputedScore"/> until a correction exists.</summary>
    public int EffectiveScore { get; set; }

    public int EffectivePossibleScore { get; set; }

    public bool Complete { get; set; }

    [BsonRepresentation(BsonType.String)]
    public TrainingAssessmentStatus Status { get; set; } = TrainingAssessmentStatus.Pending;

    public string? Diagnostic { get; set; }

    public string Disclaimer { get; set; } = TrainingSchema.EducationalScopeDisclaimer;

    public List<TrainingCriterionResult> Criteria { get; set; } = [];

    /// <summary>Incremented once per audited correction; starts at 1 for the computed assessment.</summary>
    public int AssessmentVersion { get; set; } = 1;

    public List<TrainingCorrectionEntry> Corrections { get; set; } = [];

    public DateTime ComputedAtUtc { get; set; }
}

/// <summary>One scored criterion with its deterministic explanation and evidence references.</summary>
public class TrainingCriterionResult
{
    public string Id { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public string Explanation { get; set; } = string.Empty;

    public int Points { get; set; }

    public int Earned { get; set; }

    public bool Passed { get; set; }

    /// <summary>Evidence references (action ids) supporting the outcome.</summary>
    public List<string> Evidence { get; set; } = [];
}

/// <summary>One audited assessment correction. The computed assessment is never overwritten.</summary>
public class TrainingCorrectionEntry
{
    public int FromVersion { get; set; }

    public int ToVersion { get; set; }

    public int PreviousEffectiveScore { get; set; }

    public int NewEffectiveScore { get; set; }

    public string Reason { get; set; } = string.Empty;

    public string CorrectedBySubject { get; set; } = string.Empty;

    public DateTime CorrectedAtUtc { get; set; }
}

/// <summary>Append-only audit entry for a training session.</summary>
public class TrainingAuditEntry
{
    public string Action { get; set; } = string.Empty;

    public string Subject { get; set; } = string.Empty;

    public string? Detail { get; set; }

    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
}
