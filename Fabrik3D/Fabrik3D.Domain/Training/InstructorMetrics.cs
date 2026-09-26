namespace Fabrik3D.Domain.Training;

/// <summary>
/// Normalized, server-side scope for an instructor aggregate query (S45). The class/scenario/date
/// filters are applied by the tenant-scoped repository; the metrics calculator is pure so identical
/// evidence always produces identical numbers.
/// </summary>
public sealed record TrainingMetricsScope(
    string? ClassId = null,
    string? ScenarioId = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    int MaxSessions = 500);

/// <summary>One ranked aggregate entry (an action/fault/rule key and how often it occurred).</summary>
public sealed record TrainingMetricCount(string Key, int Count);

/// <summary>
/// Deterministic instructor aggregate (S45). Metrics are computed on demand from the stored,
/// tenant-scoped sessions and their typed evidence; nothing is persisted, so there is no staleness
/// beyond the query window. Every definition is documented in
/// <c>docs/architecture/INSTRUCTOR_DASHBOARD.md</c> and versioned by <see cref="DefinitionsVersion"/>.
/// </summary>
public sealed record InstructorMetricsResult(
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
    IReadOnlyList<TrainingMetricCount> CommonIncorrectActions,
    IReadOnlyList<TrainingMetricCount> RepeatedFaultTypes,
    IReadOnlyList<TrainingMetricCount> SafetyMistakeRules,
    bool Truncated,
    string EducationalNote);

/// <summary>
/// Pure, deterministic aggregation of training evidence for instructors (S45). It never touches the
/// database or the network: the service hands it the tenant-scoped sessions and actions it already
/// fetched. Scores are deliberately not aggregated as a "grade"; the documented teaching metrics are
/// completion, timing, incorrect actions, hints, faults, recovery and safety mistakes.
/// </summary>
public static class TrainingMetricsCalculator
{
    /// <summary>Version of the metric definitions; bump when a documented definition changes.</summary>
    public const string DefinitionsVersion = "1.0";

    /// <summary>Number of ranked entries kept for each "common/repeated" metric.</summary>
    public const int TopCount = 5;

    public const string EducationalNote =
        "Teaching aid computed from simulated training evidence. It is not a professional " +
        "certification, qualification or industrial readiness statement.";

    public static InstructorMetricsResult Compute(
        TrainingMetricsScope scope,
        IReadOnlyList<TrainingSession> sessions,
        IReadOnlyList<TrainingActionRecord> actions,
        bool truncated,
        DateTime generatedAtUtc)
    {
        ArgumentNullException.ThrowIfNull(scope);
        ArgumentNullException.ThrowIfNull(sessions);
        ArgumentNullException.ThrowIfNull(actions);

        var sessionIds = sessions.Select(s => s.Id).ToHashSet(StringComparer.Ordinal);
        // Only evidence that belongs to an in-scope session participates; tenant filtering already
        // happened at the repository, this guards against a mismatched caller.
        var inScopeActions = actions.Where(a => sessionIds.Contains(a.SessionId)).ToList();
        var observed = inScopeActions.Where(a => a.Role == TrainingActionRole.Observed).ToList();

        var completed = sessions.Count(s => s.Status == TrainingSessionStatus.Completed);
        var failed = sessions.Count(s => s.Status == TrainingSessionStatus.Failed);
        var abandoned = sessions.Count(s => s.Status == TrainingSessionStatus.Abandoned);
        var running = sessions.Count(s => s.Status == TrainingSessionStatus.Running);
        var terminal = completed + failed + abandoned;

        var durations = sessions
            .Where(s => s.EndedAtUtc is { } ended && ended >= s.StartedAtUtc)
            .Select(s => (s.Id, Seconds: (int)Math.Round((s.EndedAtUtc!.Value - s.StartedAtUtc).TotalSeconds)))
            .ToList();

        var faultedSessionIds = observed
            .Where(a => a.IsFault)
            .Select(a => a.SessionId)
            .ToHashSet(StringComparer.Ordinal);

        // "Diagnosis time": mean elapsed time of sessions where at least one fault was reported, i.e.
        // the time a learner spent working through faults before the session ended. Documented.
        var diagnosisDurations = durations
            .Where(d => faultedSessionIds.Contains(d.Id))
            .Select(d => d.Seconds)
            .ToList();

        var hintSessions = sessions.Count(s => s.HintCount > 0 || observed.Any(a => a.SessionId == s.Id && (a.IsHint || a.Hint is not null)));
        var safetySessions = sessions.Count(s => s.SafetyViolationCount > 0);

        return new InstructorMetricsResult(
            TrainingSchema.Version,
            DefinitionsVersion,
            TrainingSchema.ScoringRuleVersion,
            generatedAtUtc,
            scope.ClassId,
            scope.ScenarioId,
            scope.FromUtc,
            scope.ToUtc,
            sessions.Count,
            completed,
            failed,
            running,
            terminal,
            terminal == 0 ? 0d : Math.Round((double)completed / terminal, 4),
            durations.Count == 0 ? 0 : (int)Math.Round(durations.Average(d => d.Seconds)),
            diagnosisDurations.Count == 0 ? 0 : (int)Math.Round(diagnosisDurations.Average()),
            observed.Count,
            observed.Count(a => a.Correctness == TrainingActionCorrectness.Incorrect),
            observed.Count(a => a.IsHint || a.Hint is not null),
            hintSessions,
            sessions.Count == 0 ? 0d : Math.Round((double)observed.Count(a => a.IsHint || a.Hint is not null) / sessions.Count, 4),
            observed.Count(a => a.IsFault),
            observed.Count(a => a.IsRecovery || a.Recovery is not null),
            observed.Count(a => a.IsSafetyViolation || a.SafetyViolation is not null),
            safetySessions,
            Rank(observed.Where(a => a.Correctness == TrainingActionCorrectness.Incorrect).Select(a => a.Type)),
            Rank(observed.Where(a => a.IsFault).Select(a => a.Type)),
            Rank(observed.Where(a => a.IsSafetyViolation || a.SafetyViolation is not null)
                .Select(a => string.IsNullOrWhiteSpace(a.SafetyViolation?.RuleId) ? a.Type : a.SafetyViolation!.RuleId)),
            truncated,
            EducationalNote);
    }

    /// <summary>Ranks keys by descending count then ordinal key so ties are deterministic across runs.</summary>
    private static IReadOnlyList<TrainingMetricCount> Rank(IEnumerable<string> keys) =>
        keys
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .GroupBy(key => key.Trim(), StringComparer.Ordinal)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key, StringComparer.Ordinal)
            .Take(TopCount)
            .Select(group => new TrainingMetricCount(group.Key, group.Count()))
            .ToList();
}
