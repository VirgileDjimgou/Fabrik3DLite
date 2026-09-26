using System.Globalization;
using Fabrik3D.Domain.Training;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Deterministic assessment fixtures (S44). Identical evidence and the same scoring-rule version must
/// always produce an identical result, independent of wall-clock, locale or call order.
/// </summary>
public class TrainingAssessmentEngineTests
{
    // ── Fixtures ────────────────────────────────────────────────────

    private static TrainingSession Session(params string[] expectedActions) => Session(true, expectedActions);

    private static TrainingSession Session(bool completed, params string[] expectedActions) => new()
    {
        Id = "session-1",
        LearnerSubject = "learner-1",
        ScenarioId = "pick-and-place",
        Completed = completed,
        ExpectedActions = expectedActions.ToList(),
    };

    private static TrainingActionRecord Observed(
        string actionId,
        string type,
        long sequence,
        bool fault = false,
        bool hint = false,
        bool recovery = false,
        bool violation = false,
        string? recoveredFaultId = null,
        string? expectedActionId = null) => new()
    {
        Id = $"id-{actionId}",
        ActionId = actionId,
        SessionId = "session-1",
        Role = TrainingActionRole.Observed,
        Type = type,
        Sequence = sequence,
        ExpectedActionId = expectedActionId,
        IsFault = fault,
        IsHint = hint,
        IsRecovery = recovery,
        IsSafetyViolation = violation,
        Hint = hint ? new HintUsage { HintId = actionId } : null,
        SafetyViolation = violation ? new SafetyViolation { RuleId = actionId } : null,
        Recovery = recovery ? new RecoveryAction { FaultId = recoveredFaultId, Successful = true } : null,
    };

    private static TrainingAssessmentResult Assess(TrainingSession session, params TrainingActionRecord[] actions) =>
        TrainingAssessmentEngine.Assess(new TrainingEvidence(session, actions));

    // ── Fixture outcomes ────────────────────────────────────────────

    [Fact]
    public void Perfect_run_scores_full_marks()
    {
        var session = Session("PICK_PART", "COMPLETE");
        var result = Assess(session,
            Observed("a1", "PICK_PART", 1),
            Observed("a2", "COMPLETE", 2));

        Assert.Equal(100, result.Score);
        Assert.Equal(100, result.PossibleScore);
        Assert.True(result.Criteria.All(c => c.Passed));
    }

    [Fact]
    public void Partial_run_loses_only_the_missing_expected_actions()
    {
        var session = Session("PICK_PART", "MOVE_TO_CNC_APPROACH");
        var result = Assess(session, Observed("a1", "PICK_PART", 1));

        Assert.Equal(75, result.Score);
        var criterion = result.Criteria.Single(c => c.Id == "expected-actions");
        Assert.False(criterion.Passed);
        Assert.Equal(0, criterion.Earned);
    }

    [Fact]
    public void Failed_run_scores_zero_when_nothing_passed()
    {
        var session = Session(false, "PICK_PART", "COMPLETE");
        var result = Assess(session,
            Observed("f1", "fault", 1, fault: true),
            Observed("h1", "hint-1", 2, hint: true),
            Observed("h2", "hint-2", 3, hint: true),
            Observed("h3", "hint-3", 4, hint: true),
            Observed("h4", "hint-4", 5, hint: true),
            Observed("v1", "violation", 6, violation: true));

        Assert.Equal(0, result.Score);
        Assert.False(result.Complete);
    }

    [Fact]
    public void Safety_violation_costs_the_safety_criterion()
    {
        var session = Session("PICK_PART");
        var result = Assess(session,
            Observed("a1", "PICK_PART", 1),
            Observed("v1", "violation", 2, violation: true));

        Assert.Equal(90, result.Score);
        Assert.False(result.Criteria.Single(c => c.Id == "safety-compliance").Passed);
    }

    [Fact]
    public void Hint_heavy_run_costs_the_hint_criterion()
    {
        var session = Session("PICK_PART");
        var result = Assess(session,
            Observed("a1", "PICK_PART", 1),
            Observed("h1", "hint-1", 2, hint: true),
            Observed("h2", "hint-2", 3, hint: true),
            Observed("h3", "hint-3", 4, hint: true),
            Observed("h4", "hint-4", 5, hint: true));

        Assert.Equal(90, result.Score);
        Assert.False(result.Criteria.Single(c => c.Id == "hint-discipline").Passed);
    }

    [Fact]
    public void Incorrect_then_recovered_run_scores_the_full_recovery_criterion()
    {
        var session = Session("PICK_PART");
        var result = Assess(session,
            Observed("a1", "PICK_PART", 1),
            Observed("f1", "fault", 2, fault: true),
            Observed("r1", "recovery", 3, recovery: true, recoveredFaultId: "f1"));

        Assert.Equal(100, result.Score);
        var criterion = result.Criteria.Single(c => c.Id == "fault-recovery");
        Assert.True(criterion.Passed);
        Assert.Contains("f1", criterion.Evidence);
    }

    [Fact]
    public void Unrecovered_fault_costs_the_recovery_criterion()
    {
        var session = Session("PICK_PART");
        var result = Assess(session,
            Observed("a1", "PICK_PART", 1),
            Observed("f1", "fault", 2, fault: true));

        Assert.Equal(85, result.Score);
        Assert.False(result.Criteria.Single(c => c.Id == "fault-recovery").Passed);
    }

    // ── Determinism ─────────────────────────────────────────────────

    [Fact]
    public void Identical_evidence_produces_identical_results()
    {
        var session = Session("PICK_PART", "COMPLETE");
        var actions = new[]
        {
            Observed("a1", "PICK_PART", 1),
            Observed("f1", "fault", 2, fault: true),
            Observed("r1", "recovery", 3, recovery: true, recoveredFaultId: "f1"),
            Observed("a2", "COMPLETE", 4),
        };

        var first = Assess(session, actions);
        var second = Assess(session, actions);

        Assert.Equal(first.Score, second.Score);
        Assert.Equal(first.PossibleScore, second.PossibleScore);
        Assert.Equal(first.ScoringRuleVersion, second.ScoringRuleVersion);
        Assert.Equal(
            first.Criteria.Select(c => (c.Id, c.Earned, c.Passed, c.Explanation)),
            second.Criteria.Select(c => (c.Id, c.Earned, c.Passed, c.Explanation)));
    }

    [Fact]
    public void Evidence_order_does_not_change_the_result()
    {
        var session = Session("PICK_PART", "COMPLETE");
        var ordered = new[]
        {
            Observed("a1", "PICK_PART", 1),
            Observed("a2", "COMPLETE", 2),
        };
        var shuffled = new[] { ordered[1], ordered[0] };

        Assert.Equal(Assess(session, ordered).Score, Assess(session, shuffled).Score);
    }

    [Fact]
    public void Result_is_independent_of_current_culture()
    {
        var session = Session(false, "PICK_PART");
        var actions = new[]
        {
            Observed("f1", "fault", 1, fault: true),
            Observed("h1", "hint", 2, hint: true),
        };

        var previous = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("ar-SA");
            var arabic = Assess(session, actions);
            CultureInfo.CurrentCulture = new CultureInfo("fr-FR");
            var french = Assess(session, actions);

            Assert.Equal(arabic.Score, french.Score);
            Assert.Equal(
                arabic.Criteria.Select(c => c.Explanation),
                french.Criteria.Select(c => c.Explanation));
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    // ── Versioning and scheme resolution ────────────────────────────

    [Fact]
    public void Every_criteria_result_carries_the_rule_version()
    {
        var result = Assess(Session());

        Assert.Equal(TrainingSchema.ScoringRuleVersion, result.ScoringRuleVersion);
        Assert.Equal(TrainingSchema.EducationalScopeDisclaimer, result.Disclaimer);
    }

    [Fact]
    public void Safety_recovery_scenarios_use_the_safety_emphasis_scheme()
    {
        var scheme = TrainingScoringRegistry.Resolve("safety-door-recovery");
        Assert.Equal(TrainingScoringRegistry.SafetyEmphasisSchemeId, scheme.Id);
        Assert.Equal(25, scheme.Criteria.Single(c => c.Id == "safety-compliance").Points);

        // Unknown scenarios fall back to the documented default scheme deterministically.
        Assert.Equal(TrainingScoringRegistry.DefaultSchemeId, TrainingScoringRegistry.Resolve("unknown").Id);
        Assert.Equal(TrainingScoringRegistry.DefaultSchemeId, TrainingScoringRegistry.Resolve(null).Id);
    }

    [Fact]
    public void Educational_scope_disclaimer_never_claims_certification()
    {
        Assert.False(string.IsNullOrWhiteSpace(TrainingSchema.EducationalScopeDisclaimer));
        Assert.Contains("does not certify", TrainingSchema.EducationalScopeDisclaimer, StringComparison.Ordinal);
    }

    [Fact]
    public void ToRecord_preserves_the_computed_score_and_defaults_to_version_one()
    {
        var result = Assess(Session("PICK_PART"), Observed("a1", "PICK_PART", 1));
        var record = TrainingAssessmentEngine.ToRecord(result, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        Assert.Equal(result.Score, record.ComputedScore);
        Assert.Equal(result.Score, record.EffectiveScore);
        Assert.Equal(1, record.AssessmentVersion);
        Assert.Empty(record.Corrections);
        Assert.Equal(TrainingAssessmentStatus.Computed, record.Status);
    }
}
