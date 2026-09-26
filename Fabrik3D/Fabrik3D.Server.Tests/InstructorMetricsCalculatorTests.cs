using Fabrik3D.Domain.Training;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Deterministic unit coverage for the pure instructor aggregation (S45). The calculator must depend
/// only on the session/action evidence it is given, rank ties deterministically and never fabricate a
/// number when the window is empty.
/// </summary>
public class InstructorMetricsCalculatorTests
{
    private static readonly DateTime Now = new(2026, 9, 26, 12, 0, 0, DateTimeKind.Utc);

    private static TrainingSession Session(
        string id,
        TrainingSessionStatus status,
        DateTime started,
        DateTime? ended = null,
        int safetyViolations = 0) => new()
    {
        Id = id,
        ScenarioId = "pick-and-place",
        ClassId = "class-1",
        LearnerSubject = "learner-1",
        StartedAtUtc = started,
        EndedAtUtc = ended,
        Status = status,
        Completed = status == TrainingSessionStatus.Completed,
        SafetyViolationCount = safetyViolations,
    };

    private static TrainingActionRecord Observed(
        string sessionId,
        string type,
        long sequence,
        bool fault = false,
        bool hint = false,
        bool recovery = false,
        string? safetyRule = null,
        TrainingActionCorrectness correctness = TrainingActionCorrectness.Unknown) => new()
    {
        Id = $"{sessionId}-{sequence}",
        SessionId = sessionId,
        ActionId = $"a-{sequence}",
        Role = TrainingActionRole.Observed,
        Type = type,
        Sequence = sequence,
        IsFault = fault,
        IsHint = hint,
        Hint = hint ? new HintUsage { HintId = $"hint-{sequence}" } : null,
        IsRecovery = recovery,
        Recovery = recovery ? new RecoveryAction { Successful = true } : null,
        IsSafetyViolation = safetyRule is not null,
        SafetyViolation = safetyRule is null ? null : new SafetyViolation { RuleId = safetyRule },
        Correctness = correctness,
    };

    [Fact]
    public void Empty_window_reports_zeros_and_never_divides_by_zero()
    {
        var result = TrainingMetricsCalculator.Compute(
            new TrainingMetricsScope(), [], [], truncated: false, generatedAtUtc: Now);

        Assert.Equal(0, result.SessionCount);
        Assert.Equal(0, result.TerminalCount);
        Assert.Equal(0d, result.CompletionRate);
        Assert.Equal(0, result.MeanSessionSeconds);
        Assert.Equal(0d, result.MeanHintsPerSession);
        Assert.Empty(result.CommonIncorrectActions);
        Assert.Contains("not a professional", result.EducationalNote, StringComparison.Ordinal);
        Assert.Equal(TrainingMetricsCalculator.DefinitionsVersion, result.DefinitionsVersion);
    }

    [Fact]
    public void Aggregates_completion_timing_steps_and_ranked_evidence()
    {
        var sessions = new List<TrainingSession>
        {
            Session("s1", TrainingSessionStatus.Completed, Now.AddMinutes(-30), Now.AddMinutes(-20)),
            Session("s2", TrainingSessionStatus.Completed, Now.AddMinutes(-30), Now.AddMinutes(-25)),
            Session("s3", TrainingSessionStatus.Failed, Now.AddMinutes(-40), Now.AddMinutes(-38)),
            Session("s4", TrainingSessionStatus.Running, Now.AddMinutes(-5)),
        };

        var actions = new List<TrainingActionRecord>
        {
            Observed("s1", "PICK_PART", 1, correctness: TrainingActionCorrectness.Correct),
            Observed("s1", "WRONG_GRIP", 2, correctness: TrainingActionCorrectness.Incorrect),
            Observed("s1", "WRONG_GRIP", 3, correctness: TrainingActionCorrectness.Incorrect),
            Observed("s2", "PICK_PART", 1, correctness: TrainingActionCorrectness.Correct),
            Observed("s2", "OPS", 2, fault: true),
            Observed("s2", "hint", 3, hint: true),
            Observed("s2", "recover", 4, recovery: true),
            Observed("s3", "DROP", 1, correctness: TrainingActionCorrectness.Incorrect),
            Observed("s3", "GUARD", 2, safetyRule: "guard-door-open"),
        };

        var result = TrainingMetricsCalculator.Compute(
            new TrainingMetricsScope(ClassId: "class-1", ScenarioId: "pick-and-place"),
            sessions, actions, truncated: false, generatedAtUtc: Now);

        Assert.Equal(4, result.SessionCount);
        Assert.Equal(2, result.CompletedCount);
        Assert.Equal(1, result.FailedCount);
        Assert.Equal(1, result.RunningCount);
        Assert.Equal(3, result.TerminalCount);
        Assert.Equal(Math.Round(2d / 3d, 4), result.CompletionRate);

        // Mean session duration over the three ended sessions: (600 + 300 + 120) / 3 = 340.
        Assert.Equal(340, result.MeanSessionSeconds);
        // Only the faulted session (s2, 300 s) contributes to mean diagnosis time.
        Assert.Equal(300, result.MeanDiagnosisSeconds);

        Assert.Equal(9, result.TotalActions);
        Assert.Equal(3, result.IncorrectActionCount);
        Assert.Equal(1, result.HintCount);
        Assert.Equal(1, result.SessionsWithHints);
        Assert.Equal(Math.Round(1d / 4d, 4), result.MeanHintsPerSession);
        Assert.Equal(1, result.FaultCount);
        Assert.Equal(1, result.RecoveryActionCount);
        Assert.Equal(1, result.SafetyViolationCount);
        Assert.Equal(0, result.SessionsWithSafetyViolations); // safety count is stored on the session

        Assert.Equal(new TrainingMetricCount("WRONG_GRIP", 2), result.CommonIncorrectActions[0]);
        Assert.Contains(result.CommonIncorrectActions, c => c is { Key: "DROP", Count: 1 });
        Assert.Single(result.RepeatedFaultTypes);
        Assert.Equal("OPS", result.RepeatedFaultTypes[0].Key);
        Assert.Single(result.SafetyMistakeRules);
        Assert.Equal("guard-door-open", result.SafetyMistakeRules[0].Key);
    }

    [Fact]
    public void Ranked_entries_are_tie_broken_by_ordinal_key_and_capped()
    {
        var actions = Enumerable.Range(0, 8)
            .Select(index => Observed("s1", $"TYPE_{index}", index, correctness: TrainingActionCorrectness.Incorrect))
            .ToList();

        var result = TrainingMetricsCalculator.Compute(
            new TrainingMetricsScope(), [Session("s1", TrainingSessionStatus.Failed, Now, Now.AddMinutes(-1))],
            actions, truncated: false, generatedAtUtc: Now);

        Assert.Equal(TrainingMetricsCalculator.TopCount, result.CommonIncorrectActions.Count);
        // All counts are 1, so the deterministic secondary ordinal sort wins.
        Assert.Equal(
            result.CommonIncorrectActions.Select(c => c.Key).OrderBy(key => key, StringComparer.Ordinal),
            result.CommonIncorrectActions.Select(c => c.Key));
    }

    [Fact]
    public void Identical_evidence_produces_identical_metrics()
    {
        var sessions = new List<TrainingSession>
        {
            Session("s1", TrainingSessionStatus.Completed, Now.AddMinutes(-10), Now.AddMinutes(-5)),
        };
        var actions = new List<TrainingActionRecord>
        {
            Observed("s1", "B", 1, correctness: TrainingActionCorrectness.Incorrect),
            Observed("s1", "A", 2, correctness: TrainingActionCorrectness.Incorrect),
        };

        var first = TrainingMetricsCalculator.Compute(new TrainingMetricsScope(), sessions, actions, false, Now);
        var second = TrainingMetricsCalculator.Compute(new TrainingMetricsScope(), sessions, actions, false, Now);

        Assert.Equal(first.SessionCount, second.SessionCount);
        Assert.Equal(first.CompletionRate, second.CompletionRate);
        Assert.Equal(first.MeanSessionSeconds, second.MeanSessionSeconds);
        Assert.Equal(first.CommonIncorrectActions, second.CommonIncorrectActions);
        Assert.Equal(first.Truncated, second.Truncated);
    }

    [Fact]
    public void Evidence_outside_the_session_window_is_ignored()
    {
        var result = TrainingMetricsCalculator.Compute(
            new TrainingMetricsScope(),
            [Session("s1", TrainingSessionStatus.Completed, Now.AddMinutes(-10), Now.AddMinutes(-5))],
            [
                Observed("s1", "KEEP", 1, correctness: TrainingActionCorrectness.Incorrect),
                Observed("other", "DROP", 2, correctness: TrainingActionCorrectness.Incorrect),
            ],
            truncated: true,
            generatedAtUtc: Now);

        Assert.Equal(1, result.TotalActions);
        Assert.Equal("KEEP", Assert.Single(result.CommonIncorrectActions).Key);
        Assert.True(result.Truncated);
    }

    [Fact]
    public void Safety_violations_are_counted_from_the_typed_action_and_the_session_rollup()
    {
        var sessions = new List<TrainingSession>
        {
            Session("s1", TrainingSessionStatus.Completed, Now.AddMinutes(-10), Now.AddMinutes(-5), safetyViolations: 2),
        };
        var actions = new List<TrainingActionRecord>
        {
            Observed("s1", "GUARD", 1, safetyRule: "guard-door-open"),
            Observed("s1", "ESTOP", 2, safetyRule: "estop-bypass"),
        };

        var result = TrainingMetricsCalculator.Compute(new TrainingMetricsScope(), sessions, actions, false, Now);

        Assert.Equal(2, result.SafetyViolationCount);
        Assert.Equal(1, result.SessionsWithSafetyViolations);
        Assert.Equal(2, result.SafetyMistakeRules.Count);
    }
}
