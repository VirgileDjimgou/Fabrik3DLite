using System.Globalization;

namespace Fabrik3D.Domain.Training;

/// <summary>The recorded evidence a deterministic assessment is computed from.</summary>
/// <param name="Session">Session metadata (completion flag, expected actions, scenario).</param>
/// <param name="Actions">Recorded expected/observed actions, in any order.</param>
public sealed record TrainingEvidence(TrainingSession Session, IReadOnlyList<TrainingActionRecord> Actions);

/// <summary>Deterministic outcome of one scoring criterion.</summary>
public sealed record TrainingCriterionOutcome(bool Passed, string Explanation, IReadOnlyList<string> Evidence);

/// <summary>A named, point-valued scoring rule evaluated purely from recorded evidence.</summary>
public sealed class TrainingScoringCriterion
{
    public required string Id { get; init; }

    public required string Label { get; init; }

    public required int Points { get; init; }

    public required Func<TrainingEvidence, TrainingCriterionOutcome> Evaluate { get; init; }
}

/// <summary>A versioned set of scoring criteria for one or more scenarios.</summary>
public sealed class TrainingScoringScheme
{
    public required string Id { get; init; }

    public required string RuleVersion { get; init; }

    public required IReadOnlyList<TrainingScoringCriterion> Criteria { get; init; }

    public int PossibleScore => Criteria.Sum(criterion => criterion.Points);
}

/// <summary>The immutable, deterministic output of one assessment.</summary>
public sealed record TrainingAssessmentResult(
    string SchemeId,
    string ScoringRuleVersion,
    IReadOnlyList<TrainingCriterionResult> Criteria,
    int Score,
    int PossibleScore,
    bool Complete,
    string Disclaimer);

/// <summary>
/// Versioned scoring-rule registry (S44). The scheme is selected deterministically from the
/// scenario id; unknown scenarios fall back to the documented default scheme. Rule changes must bump
/// <see cref="TrainingSchema.ScoringRuleVersion"/> so stored scores remain interpretable.
/// </summary>
public static class TrainingScoringRegistry
{
    public const string DefaultSchemeId = "default";

    /// <summary>Safety-recovery scenarios weight the safety criterion higher.</summary>
    public const string SafetyEmphasisSchemeId = "safety-emphasis";

    public static TrainingScoringScheme Default { get; } = BuildDefault();

    public static TrainingScoringScheme SafetyEmphasis { get; } = BuildSafetyEmphasis();

    private static readonly Dictionary<string, TrainingScoringScheme> ScenarioSchemes =
        new(StringComparer.Ordinal)
        {
            ["safety-door-recovery"] = SafetyEmphasis,
        };

    /// <summary>Resolves the scheme for a scenario id. Deterministic and side-effect free.</summary>
    public static TrainingScoringScheme Resolve(string? scenarioId)
    {
        if (!string.IsNullOrWhiteSpace(scenarioId)
            && ScenarioSchemes.TryGetValue(scenarioId.Trim(), out var scheme))
        {
            return scheme;
        }

        return Default;
    }

    private static TrainingScoringScheme BuildDefault() => new()
    {
        Id = DefaultSchemeId,
        RuleVersion = TrainingSchema.ScoringRuleVersion,
        Criteria =
        [
            new TrainingScoringCriterion
            {
                Id = "completion",
                Label = "Scenario completion",
                Points = 40,
                Evaluate = Completion,
            },
            new TrainingScoringCriterion
            {
                Id = "expected-actions",
                Label = "Expected actions observed",
                Points = 25,
                Evaluate = ExpectedActions,
            },
            new TrainingScoringCriterion
            {
                Id = "fault-recovery",
                Label = "Simulated fault recovery",
                Points = 15,
                Evaluate = FaultRecovery,
            },
            new TrainingScoringCriterion
            {
                Id = "safety-compliance",
                Label = "Safety compliance",
                Points = 10,
                Evaluate = SafetyCompliance,
            },
            new TrainingScoringCriterion
            {
                Id = "hint-discipline",
                Label = "Hint discipline",
                Points = 10,
                Evaluate = HintDiscipline,
            },
        ],
    };

    private static TrainingScoringScheme BuildSafetyEmphasis() => new()
    {
        Id = SafetyEmphasisSchemeId,
        RuleVersion = TrainingSchema.ScoringRuleVersion,
        Criteria =
        [
            new TrainingScoringCriterion
            {
                Id = "completion",
                Label = "Scenario completion",
                Points = 30,
                Evaluate = Completion,
            },
            new TrainingScoringCriterion
            {
                Id = "expected-actions",
                Label = "Expected actions observed",
                Points = 20,
                Evaluate = ExpectedActions,
            },
            new TrainingScoringCriterion
            {
                Id = "fault-recovery",
                Label = "Simulated fault recovery",
                Points = 15,
                Evaluate = FaultRecovery,
            },
            new TrainingScoringCriterion
            {
                Id = "safety-compliance",
                Label = "Safety compliance",
                Points = 25,
                Evaluate = SafetyCompliance,
            },
            new TrainingScoringCriterion
            {
                Id = "hint-discipline",
                Label = "Hint discipline",
                Points = 10,
                Evaluate = HintDiscipline,
            },
        ],
    };

    // ── Criteria ────────────────────────────────────────────────────

    private static TrainingCriterionOutcome Completion(TrainingEvidence evidence)
    {
        var passed = evidence.Session.Completed;
        var completionEvidence = Observed(evidence)
            .Where(action => IsCompletionMarker(action.Type))
            .Select(action => action.ActionId)
            .ToList();

        return new TrainingCriterionOutcome(
            passed,
            passed
                ? "The simulator reported the scenario as completed."
                : "The simulator did not report the scenario as completed.",
            completionEvidence);
    }

    private static TrainingCriterionOutcome ExpectedActions(TrainingEvidence evidence)
    {
        var observer = Observed(evidence).ToList();
        var expected = evidence.Session.ExpectedActions
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (expected.Count == 0)
        {
            return new TrainingCriterionOutcome(
                true, "No expected actions were declared for this scenario.", []);
        }

        var matched = new List<string>();
        var evidenceIds = new List<string>();
        foreach (var expectation in expected)
        {
            var match = observer.FirstOrDefault(action => MatchesExpectation(action, expectation));
            if (match is null) continue;

            matched.Add(expectation);
            evidenceIds.Add(match.ActionId);
        }

        var passed = matched.Count == expected.Count;
        return new TrainingCriterionOutcome(
            passed,
            $"{Invariant(matched.Count)}/{Invariant(expected.Count)} expected actions were observed.",
            evidenceIds);
    }

    private static TrainingCriterionOutcome FaultRecovery(TrainingEvidence evidence)
    {
        var observed = Observed(evidence).ToList();
        var faults = observed.Where(action => action.IsFault).ToList();
        if (faults.Count == 0)
        {
            return new TrainingCriterionOutcome(
                true, "No simulated faults were encountered.", []);
        }

        var successfulRecoveries = observed
            .Where(action => action.IsRecovery && action.Recovery?.Successful == true)
            .ToList();

        bool Recovered(TrainingActionRecord fault) => successfulRecoveries.Any(recovery =>
            string.Equals(recovery.Recovery?.FaultId, fault.ActionId, StringComparison.Ordinal)
            || string.Equals(recovery.Recovery?.RecoveredActionId, fault.ActionId, StringComparison.Ordinal));

        var recovered = faults.Where(Recovered).ToList();
        var pending = faults.Where(fault => !Recovered(fault)).ToList();
        return new TrainingCriterionOutcome(
            pending.Count == 0,
            $"{Invariant(recovered.Count)}/{Invariant(faults.Count)} simulated faults were recovered.",
            faults.Select(fault => fault.ActionId).ToList());
    }

    private static TrainingCriterionOutcome SafetyCompliance(TrainingEvidence evidence)
    {
        var violations = Observed(evidence)
            .Where(action => action.IsSafetyViolation || action.SafetyViolation is not null)
            .ToList();

        var passed = violations.Count == 0;
        return new TrainingCriterionOutcome(
            passed,
            passed
                ? "No safety violations were recorded."
                : $"{Invariant(violations.Count)} safety violation(s) were recorded.",
            violations.Select(violation => violation.ActionId).ToList());
    }

    private static TrainingCriterionOutcome HintDiscipline(TrainingEvidence evidence)
    {
        var hints = Observed(evidence)
            .Where(action => action.IsHint || action.Hint is not null)
            .ToList();

        var passed = hints.Count <= TrainingSchema.MaxHintsForDiscipline;
        return new TrainingCriterionOutcome(
            passed,
            passed
                ? $"Hints used ({Invariant(hints.Count)}) stayed within the tolerated maximum ({Invariant(TrainingSchema.MaxHintsForDiscipline)})."
                : $"Hints used ({Invariant(hints.Count)}) exceeded the tolerated maximum ({Invariant(TrainingSchema.MaxHintsForDiscipline)}).",
            hints.Select(hint => hint.ActionId).ToList());
    }

    // ── Helpers ─────────────────────────────────────────────────────

    internal static IEnumerable<TrainingActionRecord> Ordered(TrainingEvidence evidence) =>
        evidence.Actions
            .OrderBy(action => action.Sequence)
            .ThenBy(action => action.ActionId, StringComparer.Ordinal);

    private static IEnumerable<TrainingActionRecord> Observed(TrainingEvidence evidence) =>
        Ordered(evidence).Where(action => action.Role == TrainingActionRole.Observed);

    private static bool MatchesExpectation(TrainingActionRecord action, string expectation) =>
        string.Equals(action.Type, expectation, StringComparison.Ordinal)
        || string.Equals(action.ExpectedActionId, expectation, StringComparison.Ordinal)
        || string.Equals(action.Target, expectation, StringComparison.Ordinal);

    private static bool IsCompletionMarker(string type) =>
        string.Equals(type, "complete", StringComparison.Ordinal)
        || string.Equals(type, "scenario.completed", StringComparison.Ordinal)
        || string.Equals(type, "COMPLETE", StringComparison.Ordinal)
        || string.Equals(type, "run.complete", StringComparison.Ordinal);

    internal static string Invariant(int value) => value.ToString(CultureInfo.InvariantCulture);
}

/// <summary>
/// Pure, deterministic assessment engine (S44). Identical evidence and the same scoring-rule
/// version always produce an identical result: no wall-clock, locale, random or UI dependence.
/// </summary>
public static class TrainingAssessmentEngine
{
    public static TrainingAssessmentResult Assess(
        TrainingEvidence evidence,
        TrainingScoringScheme? scheme = null)
    {
        var resolved = scheme ?? TrainingScoringRegistry.Resolve(evidence.Session.ScenarioId);

        var criteria = resolved.Criteria
            .Select(criterion =>
            {
                var outcome = criterion.Evaluate(evidence);
                return new TrainingCriterionResult
                {
                    Id = criterion.Id,
                    Label = criterion.Label,
                    Explanation = outcome.Explanation,
                    Points = criterion.Points,
                    Earned = outcome.Passed ? criterion.Points : 0,
                    Passed = outcome.Passed,
                    Evidence = outcome.Evidence.ToList(),
                };
            })
            .ToList();

        return new TrainingAssessmentResult(
            resolved.Id,
            resolved.RuleVersion,
            criteria,
            criteria.Sum(criterion => criterion.Earned),
            criteria.Sum(criterion => criterion.Points),
            evidence.Session.Completed,
            TrainingSchema.EducationalScopeDisclaimer);
    }

    /// <summary>Maps a computed result to the persisted record, stamping the supplied clock.</summary>
    public static TrainingAssessmentRecord ToRecord(
        TrainingAssessmentResult result, DateTime computedAtUtc) => new()
    {
        ScoringRuleVersion = result.ScoringRuleVersion,
        AssessmentSchemaVersion = TrainingSchema.Version,
        SoftwareVersion = TrainingSchema.SoftwareVersion,
        ComputedScore = result.Score,
        ComputedPossibleScore = result.PossibleScore,
        EffectiveScore = result.Score,
        EffectivePossibleScore = result.PossibleScore,
        Complete = result.Complete,
        Status = TrainingAssessmentStatus.Computed,
        Disclaimer = result.Disclaimer,
        Criteria = result.Criteria.ToList(),
        AssessmentVersion = 1,
        ComputedAtUtc = computedAtUtc,
    };
}
