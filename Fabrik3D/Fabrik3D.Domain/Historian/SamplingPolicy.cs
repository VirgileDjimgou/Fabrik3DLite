using Fabrik3D.Domain.Signals;

namespace Fabrik3D.Domain.Historian;

/// <summary>How a signal is selected for historization.</summary>
public enum SamplingMode
{
    /// <summary>Emit only when the value or quality changes (optionally beyond a deadband).</summary>
    OnChange,

    /// <summary>Emit at a fixed interval regardless of change.</summary>
    Periodic,

    /// <summary>Emit on change or when the periodic interval elapses, whichever comes first.</summary>
    OnChangeOrPeriodic,
}

/// <summary>
/// Per-signal sampling policy. Defaults are conservative: no signal is historized at full rate
/// unless a policy explicitly requests it.
/// </summary>
/// <param name="Mode">Change and/or periodic selection.</param>
/// <param name="IntervalMilliseconds">Minimum/forced emission interval in milliseconds.</param>
/// <param name="Deadband">Absolute deadband applied to numeric values (0 = any change counts).</param>
public sealed record SamplingPolicy(
    SamplingMode Mode = SamplingMode.OnChange,
    int IntervalMilliseconds = 1000,
    double Deadband = 0)
{
    public static SamplingPolicy Default { get; } = new();

    /// <summary>A policy that never emits. Used to exclude a signal entirely.</summary>
    public static SamplingPolicy Disabled { get; } = new(SamplingMode.Periodic, int.MaxValue, 0);

    public bool IsDisabled => Mode == SamplingMode.Periodic && IntervalMilliseconds == int.MaxValue;

    public SamplingPolicy Normalized() => this with
    {
        IntervalMilliseconds = Math.Max(1, IntervalMilliseconds),
        Deadband = Math.Max(0, Deadband),
    };
}

/// <summary>Canonical wire parsing for sampling configuration.</summary>
public static class SamplingVocabulary
{
    public static bool TryParseMode(string? value, out SamplingMode mode)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "on-change":
            case "onchange":
                mode = SamplingMode.OnChange;
                return true;
            case "periodic":
                mode = SamplingMode.Periodic;
                return true;
            case "on-change-or-periodic":
            case "onchangeorperiodic":
                mode = SamplingMode.OnChangeOrPeriodic;
                return true;
            default:
                mode = SamplingMode.OnChange;
                return false;
        }
    }

    public static string ToWire(SamplingMode mode) => mode switch
    {
        SamplingMode.Periodic => "periodic",
        SamplingMode.OnChangeOrPeriodic => "on-change-or-periodic",
        _ => "on-change",
    };
}

/// <summary>Last emitted state for one signal, owned by the ingestion path.</summary>
/// <param name="HasValue">True once at least one sample was emitted.</param>
/// <param name="LastEmittedUtc">Timestamp of the last emitted sample.</param>
/// <param name="LastValue">Last emitted value, used for change/deadband detection.</param>
/// <param name="LastQuality">Last emitted quality.</param>
public sealed record SamplingState(
    bool HasValue = false,
    DateTimeOffset? LastEmittedUtc = null,
    object? LastValue = null,
    SignalQuality? LastQuality = null)
{
    public static SamplingState Empty { get; } = new();
}

/// <summary>Outcome of one sampling decision.</summary>
public sealed record SamplingDecision(bool Emit, SamplingState NextState, string? Reason);

/// <summary>
/// Pure, deterministic sampling/deadband logic. No clock, no IO: callers supply the timestamp so the
/// behaviour is fully unit-testable and reproducible.
/// </summary>
public static class SamplingDecisionEngine
{
    public static SamplingDecision Evaluate(
        SamplingPolicy policy,
        SamplingState state,
        object? value,
        SignalQuality quality,
        DateTimeOffset nowUtc)
    {
        var normalized = policy.Normalized();

        if (normalized.IsDisabled)
        {
            return new SamplingDecision(false, state, "policy-disabled");
        }

        var valueChanged = HasValueChanged(normalized, state, value, quality);
        var periodicDue = state.LastEmittedUtc is null
            || nowUtc - state.LastEmittedUtc.Value >= TimeSpan.FromMilliseconds(normalized.IntervalMilliseconds);

        var emit = normalized.Mode switch
        {
            SamplingMode.Periodic => periodicDue,
            SamplingMode.OnChange => valueChanged,
            SamplingMode.OnChangeOrPeriodic => valueChanged || periodicDue,
            _ => valueChanged,
        };

        if (!emit)
        {
            return new SamplingDecision(false, state, valueChanged ? "rate-limited" : "unchanged");
        }

        var reason = !state.HasValue
            ? "first-sample"
            : valueChanged
                ? "changed"
                : "periodic";

        return new SamplingDecision(
            true,
            state with
            {
                HasValue = true,
                LastEmittedUtc = nowUtc,
                LastValue = value,
                LastQuality = quality,
            },
            reason);
    }

    private static bool HasValueChanged(
        SamplingPolicy policy,
        SamplingState state,
        object? value,
        SignalQuality quality)
    {
        if (!state.HasValue) return true;
        if (state.LastQuality != quality) return true;

        if (policy.Deadband > 0
            && TryToDouble(value, out var current)
            && TryToDouble(state.LastValue, out var previous))
        {
            return Math.Abs(current - previous) > policy.Deadband;
        }

        return !Equals(state.LastValue, value);
    }

    public static bool TryToDouble(object? value, out double result)
    {
        switch (value)
        {
            case null:
                result = 0;
                return false;
            case double d:
                result = d;
                return true;
            case float f:
                result = f;
                return true;
            case int i:
                result = i;
                return true;
            case long l:
                result = l;
                return true;
            case short s:
                result = s;
                return true;
            case byte b:
                result = b;
                return true;
            case decimal m:
                result = (double)m;
                return true;
            default:
                result = 0;
                return false;
        }
    }
}
