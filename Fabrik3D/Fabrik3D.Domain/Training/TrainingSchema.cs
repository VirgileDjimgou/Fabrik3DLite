namespace Fabrik3D.Domain.Training;

/// <summary>
/// Versioned training/session vocabulary (S44). Training sessions and their typed evidence are
/// persisted server-side so instructors get durable, comparable records; the authoritative score is
/// always computed by the deterministic server-side assessment engine and never by the client.
/// </summary>
public static class TrainingSchema
{
    /// <summary>Document schema version written to every training session/action document.</summary>
    public const string Version = "1.0";

    /// <summary>
    /// Version of the deterministic scoring rules. Bump this whenever a rule changes so identical
    /// evidence assessed under different rule versions is explicitly comparable via the stored value.
    /// </summary>
    public const string ScoringRuleVersion = "1.0";

    public const string TrainingSessionCollection = "trainingSessions";

    public const string TrainingActionCollection = "trainingActions";

    /// <summary>Upper bound on a single ingestion batch; larger batches are rejected server-side.</summary>
    public const int DefaultMaxBatchSize = 500;

    /// <summary>Upper bound on recorded actions per session; further ingestion is rejected.</summary>
    public const int MaxActionsPerSession = 5000;

    /// <summary>Maximum length accepted for free-form identifiers/labels reported by a client.</summary>
    public const int MaxTextLength = 512;

    /// <summary>
    /// Hints tolerated before the hint-discipline criterion is lost. Documented and versioned with
    /// the scoring rules.
    /// </summary>
    public const int MaxHintsForDiscipline = 3;

    /// <summary>
    /// Educational-scope statement attached to every server report. It deliberately never claims
    /// professional certification or industrial qualification.
    /// </summary>
    public const string EducationalScopeDisclaimer =
        "Educational training record. This assessment describes a simulated exercise and does not " +
        "certify professional competence, safety qualification or industrial readiness.";

    /// <summary>Software/schema version recorded on every session for comparability of stored reports.</summary>
    public static string SoftwareVersion { get; } =
        typeof(TrainingSchema).Assembly.GetName().Version?.ToString() ?? "1.0.0";
}

/// <summary>Lifecycle of a persisted training session.</summary>
public enum TrainingSessionStatus
{
    Running,
    Completed,
    Failed,
    Abandoned,
}

/// <summary>Whether a session carries a computed assessment, is awaiting one, or failed to assess.</summary>
public enum TrainingAssessmentStatus
{
    Pending,
    Computed,
    Failed,
}

/// <summary>Whether a recorded action is an expectation or an observation.</summary>
public enum TrainingActionRole
{
    Expected,
    Observed,
}

/// <summary>Server-validated correctness of an observed action against its expectation.</summary>
public enum TrainingActionCorrectness
{
    Unknown,
    Correct,
    Incorrect,
}

/// <summary>Severity attached to an observed action or safety violation.</summary>
public enum TrainingActionSeverity
{
    Info,
    Warning,
    Error,
    Critical,
}

/// <summary>Stable wire vocabulary for training enums (never localized on the wire).</summary>
public static class TrainingVocabulary
{
    public static string ToWire(TrainingSessionStatus value) => value switch
    {
        TrainingSessionStatus.Running => "running",
        TrainingSessionStatus.Completed => "completed",
        TrainingSessionStatus.Failed => "failed",
        TrainingSessionStatus.Abandoned => "abandoned",
        _ => "running",
    };

    public static bool TryParseStatus(string? value, out TrainingSessionStatus status)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "running": status = TrainingSessionStatus.Running; return true;
            case "completed":
            case "complete": status = TrainingSessionStatus.Completed; return true;
            case "failed": status = TrainingSessionStatus.Failed; return true;
            case "abandoned": status = TrainingSessionStatus.Abandoned; return true;
            default: status = TrainingSessionStatus.Running; return false;
        }
    }

    public static string ToWire(TrainingActionRole value) =>
        value == TrainingActionRole.Expected ? "expected" : "observed";

    public static bool TryParseRole(string? value, out TrainingActionRole role)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "expected": role = TrainingActionRole.Expected; return true;
            case "observed": role = TrainingActionRole.Observed; return true;
            default: role = TrainingActionRole.Observed; return false;
        }
    }

    public static string ToWire(TrainingActionCorrectness value) => value switch
    {
        TrainingActionCorrectness.Correct => "correct",
        TrainingActionCorrectness.Incorrect => "incorrect",
        _ => "unknown",
    };

    public static string ToWire(TrainingActionSeverity value) => value switch
    {
        TrainingActionSeverity.Warning => "warning",
        TrainingActionSeverity.Error => "error",
        TrainingActionSeverity.Critical => "critical",
        _ => "info",
    };

    public static bool TryParseSeverity(string? value, out TrainingActionSeverity severity)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "info": severity = TrainingActionSeverity.Info; return true;
            case "warning": severity = TrainingActionSeverity.Warning; return true;
            case "error": severity = TrainingActionSeverity.Error; return true;
            case "critical": severity = TrainingActionSeverity.Critical; return true;
            default: severity = TrainingActionSeverity.Info; return false;
        }
    }

    public static bool TryParseCorrectness(string? value, out TrainingActionCorrectness correctness)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "correct": correctness = TrainingActionCorrectness.Correct; return true;
            case "incorrect": correctness = TrainingActionCorrectness.Incorrect; return true;
            case "unknown": correctness = TrainingActionCorrectness.Unknown; return true;
            default: correctness = TrainingActionCorrectness.Unknown; return false;
        }
    }
}
