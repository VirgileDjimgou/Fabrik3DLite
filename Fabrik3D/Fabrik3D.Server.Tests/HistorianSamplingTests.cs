using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for the pure historian selection/retention logic (S40): sampling modes, deadband,
/// quality changes, retention cutoffs and documented growth math.
/// </summary>
public class HistorianSamplingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 2, 3, 4, 5, TimeSpan.Zero);

    [Fact]
    public void First_sample_is_always_emitted_and_advances_state()
    {
        var decision = SamplingDecisionEngine.Evaluate(
            SamplingPolicy.Default, SamplingState.Empty, 42.0, SignalQuality.Good, T0);

        Assert.True(decision.Emit);
        Assert.Equal("first-sample", decision.Reason);
        Assert.True(decision.NextState.HasValue);
        Assert.Equal(T0, decision.NextState.LastEmittedUtc);
    }

    [Fact]
    public void On_change_suppresses_an_unchanged_value()
    {
        var state = new SamplingState(true, T0, 1.0, SignalQuality.Good);

        var decision = SamplingDecisionEngine.Evaluate(
            SamplingPolicy.Default, state, 1.0, SignalQuality.Good, T0.AddMilliseconds(10));

        Assert.False(decision.Emit);
        Assert.Equal("unchanged", decision.Reason);
        Assert.Same(state, decision.NextState);
    }

    [Fact]
    public void On_change_emits_when_the_value_changes()
    {
        var state = new SamplingState(true, T0, 1.0, SignalQuality.Good);

        var decision = SamplingDecisionEngine.Evaluate(
            SamplingPolicy.Default, state, 2.0, SignalQuality.Good, T0.AddMilliseconds(10));

        Assert.True(decision.Emit);
        Assert.Equal("changed", decision.Reason);
        Assert.Equal(2.0, decision.NextState.LastValue);
    }

    [Fact]
    public void Deadband_suppresses_small_analog_changes_and_emits_large_ones()
    {
        var policy = new SamplingPolicy(SamplingMode.OnChange, 1000, Deadband: 0.5);
        var state = new SamplingState(true, T0, 10.0, SignalQuality.Good);

        var small = SamplingDecisionEngine.Evaluate(policy, state, 10.4, SignalQuality.Good, T0.AddSeconds(1));
        var large = SamplingDecisionEngine.Evaluate(policy, state, 10.6, SignalQuality.Good, T0.AddSeconds(1));

        Assert.False(small.Emit);
        Assert.True(large.Emit);
    }

    [Fact]
    public void Deadband_does_not_break_boolean_change_detection()
    {
        var policy = new SamplingPolicy(SamplingMode.OnChange, 1000, Deadband: 5);
        var state = new SamplingState(true, T0, true, SignalQuality.Good);

        var same = SamplingDecisionEngine.Evaluate(policy, state, true, SignalQuality.Good, T0.AddSeconds(1));
        var changed = SamplingDecisionEngine.Evaluate(policy, state, false, SignalQuality.Good, T0.AddSeconds(1));

        Assert.False(same.Emit);
        Assert.True(changed.Emit);
    }

    [Fact]
    public void Periodic_emits_only_when_the_interval_has_elapsed()
    {
        var policy = new SamplingPolicy(SamplingMode.Periodic, 1000);
        var state = new SamplingState(true, T0, 1.0, SignalQuality.Good);

        var early = SamplingDecisionEngine.Evaluate(policy, state, 1.0, SignalQuality.Good, T0.AddMilliseconds(999));
        var due = SamplingDecisionEngine.Evaluate(policy, state, 1.0, SignalQuality.Good, T0.AddSeconds(1));

        Assert.False(early.Emit);
        Assert.True(due.Emit);
        Assert.Equal("periodic", due.Reason);
    }

    [Fact]
    public void On_change_or_periodic_emits_on_change_before_the_interval()
    {
        var policy = new SamplingPolicy(SamplingMode.OnChangeOrPeriodic, 1000);
        var state = new SamplingState(true, T0, 1.0, SignalQuality.Good);

        var decision = SamplingDecisionEngine.Evaluate(
            policy, state, 9.0, SignalQuality.Good, T0.AddMilliseconds(100));

        Assert.True(decision.Emit);
    }

    [Fact]
    public void Quality_change_is_always_emitted()
    {
        var policy = new SamplingPolicy(SamplingMode.OnChange, 5000);
        var state = new SamplingState(true, T0, 1.0, SignalQuality.Good);

        var decision = SamplingDecisionEngine.Evaluate(
            policy, state, 1.0, SignalQuality.Bad, T0.AddMilliseconds(5));

        Assert.True(decision.Emit);
        Assert.Equal(SignalQuality.Bad, decision.NextState.LastQuality);
    }

    [Fact]
    public void Disabled_policy_never_emits()
    {
        var decision = SamplingDecisionEngine.Evaluate(
            SamplingPolicy.Disabled, SamplingState.Empty, 1.0, SignalQuality.Good, T0);

        Assert.False(decision.Emit);
        Assert.Equal("policy-disabled", decision.Reason);
    }

    [Fact]
    public void Retention_cutoff_and_overflow_follow_the_documented_policy()
    {
        var now = new DateTime(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);

        Assert.Equal(now.AddDays(-7), RetentionMath.ComputeCutoffUtc(now, 7));
        Assert.Equal(DateTime.MinValue, RetentionMath.ComputeCutoffUtc(now, 0));
        Assert.Equal(5, RetentionMath.Overflow(105, 100));
        Assert.Equal(0, RetentionMath.Overflow(95, 100));
        Assert.Equal(0, RetentionMath.Overflow(95, 0));
    }

    [Fact]
    public void Worst_case_growth_is_bounded_and_documented()
    {
        var periodic = new SamplingPolicy(SamplingMode.Periodic, 1000);
        var onChange = new SamplingPolicy(SamplingMode.OnChange, 1000);

        Assert.Equal(3600, RetentionMath.WorstCaseSamplesPerSignalPerHour(periodic, 60));
        Assert.Equal(60 * 60, RetentionMath.WorstCaseSamplesPerSignalPerHour(onChange, 60));
        Assert.Equal(0, RetentionMath.WorstCaseSamplesPerSignalPerHour(SamplingPolicy.Disabled, 60));
        Assert.Equal(
            3600 * 220,
            RetentionMath.EstimatedIngestBytesPerHour(1, periodic, 60));
    }

    [Fact]
    public void Sampling_vocabulary_round_trips_wire_names()
    {
        foreach (var mode in Enum.GetValues<SamplingMode>())
        {
            Assert.True(SamplingVocabulary.TryParseMode(SamplingVocabulary.ToWire(mode), out var parsed));
            Assert.Equal(mode, parsed);
        }
        Assert.False(SamplingVocabulary.TryParseMode("sometimes", out _));
    }
}
