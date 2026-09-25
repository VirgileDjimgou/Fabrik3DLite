using Fabrik3D.Domain.Signals;

namespace Fabrik3D.Infrastructure.Signals;

/// <summary>
/// In-memory, thread-safe server-side signal mirror. It is the transport-neutral
/// landing zone shared by protocol adapters (OPC UA first, S33). It reuses the same
/// id convention and quality/source semantics as the simulator signal core
/// (docs/architecture/INDUSTRIAL_SIGNAL_CORE.md, schema 1.0).
///
/// Deliberate representational differences from the TypeScript core:
/// - definitions are supplied by the transport node map rather than the equipment SDK;
/// - values are stored as CLR objects instead of the JSON primitives of the browser core;
/// - update arbitration implements the same rules (unknown signal, invalid/stale timestamp,
///   lower-priority source, non-writable signal, type/range/enum validation) with the same
///   canonical reason codes.
/// </summary>
public sealed class SignalMirrorStore
{
    public const int DefaultStaleAfterMilliseconds = 10_000;

    private readonly TimeProvider _timeProvider;
    private readonly int _defaultStaleAfterMs;
    private readonly object _gate = new();
    private readonly Dictionary<string, IndustrialSignalDefinition> _definitions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, IndustrialSignalSample> _samples = new(StringComparer.Ordinal);

    public SignalMirrorStore()
        : this(TimeProvider.System, DefaultStaleAfterMilliseconds)
    {
    }

    public SignalMirrorStore(TimeProvider timeProvider)
        : this(timeProvider, DefaultStaleAfterMilliseconds)
    {
    }

    public SignalMirrorStore(TimeProvider timeProvider, int defaultStaleAfterMs)
    {
        _timeProvider = timeProvider ?? TimeProvider.System;
        _defaultStaleAfterMs = defaultStaleAfterMs > 0 ? defaultStaleAfterMs : DefaultStaleAfterMilliseconds;
    }

    public int DefinitionCount
    {
        get { lock (_gate) return _definitions.Count; }
    }

    public int SampleCount
    {
        get { lock (_gate) return _samples.Count; }
    }

    public bool TryRegister(IndustrialSignalDefinition definition, out string? error)
    {
        ArgumentNullException.ThrowIfNull(definition);
        if (string.IsNullOrWhiteSpace(definition.SignalId) || string.IsNullOrWhiteSpace(definition.EquipmentId) ||
            string.IsNullOrWhiteSpace(definition.Name))
        {
            error = "invalid-definition";
            return false;
        }

        lock (_gate)
        {
            if (_definitions.ContainsKey(definition.SignalId))
            {
                error = "duplicate-signal";
                return false;
            }

            _definitions[definition.SignalId] = definition;
            error = null;
            return true;
        }
    }

    public IReadOnlyList<IndustrialSignalDefinition> Definitions()
    {
        lock (_gate)
        {
            return _definitions.Values.OrderBy(d => d.SignalId, StringComparer.Ordinal).ToList();
        }
    }

    /// <summary>
    /// Applies an update using the shared arbitration rules. Rejected updates never mutate stored state.
    /// </summary>
    public SignalMirrorWriteResult Apply(IndustrialSignalUpdate update)
    {
        ArgumentNullException.ThrowIfNull(update);

        lock (_gate)
        {
            if (!_definitions.TryGetValue(update.SignalId, out var definition))
            {
                return Reject("unknown-signal");
            }

            if (update.Timestamp == default)
            {
                return Reject("invalid-timestamp");
            }

            if (_samples.TryGetValue(update.SignalId, out var stored))
            {
                if (update.Timestamp < stored.Timestamp)
                {
                    return Reject("stale-timestamp");
                }

                if (update.Timestamp == stored.Timestamp && SourcePriority(update.Source) < SourcePriority(stored.Source))
                {
                    return Reject("lower-priority-source");
                }
            }

            if (!definition.Writable && update.Source == SignalSource.Commanded)
            {
                return Reject("not-writable");
            }

            var validation = ValidateValue(definition, update.Value);
            if (validation is not null)
            {
                return Reject(validation);
            }

            var sample = new IndustrialSignalSample(
                update.SignalId,
                Normalize(update.Value),
                update.Quality,
                update.Source,
                update.Origin,
                update.Timestamp);

            _samples[update.SignalId] = sample;
            return new SignalMirrorWriteResult(true, null, sample);
        }
    }

    public bool TryGetSample(string signalId, out IndustrialSignalSample? sample)
        => TryGetSample(signalId, _timeProvider.GetUtcNow(), out sample);

    public bool TryGetSample(string signalId, DateTimeOffset now, out IndustrialSignalSample? sample)
    {
        lock (_gate)
        {
            if (!_samples.TryGetValue(signalId, out var stored))
            {
                sample = null;
                return false;
            }

            _definitions.TryGetValue(signalId, out var definition);
            sample = ApplyReadTimeStaleness(stored, definition, now);
            return true;
        }
    }

    public IndustrialSignalSnapshot Snapshot()
        => Snapshot(_timeProvider.GetUtcNow());

    public IndustrialSignalSnapshot Snapshot(DateTimeOffset now)
    {
        lock (_gate)
        {
            var signals = _samples.Values
                .OrderBy(s => s.SignalId, StringComparer.Ordinal)
                .Select(sample =>
                {
                    _definitions.TryGetValue(sample.SignalId, out var definition);
                    return ApplyReadTimeStaleness(sample, definition, now);
                })
                .ToList();

            return new IndustrialSignalSnapshot(IndustrialSignalSchema.Version, now, signals);
        }
    }

    private static IndustrialSignalSample ApplyReadTimeStaleness(
        IndustrialSignalSample sample, IndustrialSignalDefinition? definition, DateTimeOffset now)
    {
        if (sample.Quality != SignalQuality.Good)
        {
            return sample;
        }

        var threshold = definition?.StaleAfterMs ?? DefaultStaleAfterMilliseconds;
        if (threshold <= 0)
        {
            threshold = DefaultStaleAfterMilliseconds;
        }

        var age = now - sample.Timestamp;
        if (age.TotalMilliseconds > threshold)
        {
            return sample with { Quality = SignalQuality.Stale };
        }

        return sample;
    }

    private static int SourcePriority(SignalSource source) => source switch
    {
        SignalSource.Commanded => 0,
        SignalSource.Replay => 1,
        SignalSource.Simulated => 2,
        SignalSource.Observed => 3,
        _ => 0,
    };

    private static SignalMirrorWriteResult Reject(string reason) => new(false, reason, null);

    private static string? ValidateValue(IndustrialSignalDefinition definition, object? value)
    {
        if (value is null)
        {
            return "type-mismatch";
        }

        switch (definition.DataType)
        {
            case SignalDataType.Bool:
                return value is bool ? null : "type-mismatch";

            case SignalDataType.Int:
                if (!TryToInt64(value, out var signed) || signed < int.MinValue || signed > int.MaxValue)
                {
                    return "type-mismatch";
                }
                return CheckRange(definition, signed);

            case SignalDataType.UInt:
                if (!TryToInt64(value, out var unsigned) || unsigned < 0 || unsigned > uint.MaxValue)
                {
                    return "type-mismatch";
                }
                return CheckRange(definition, unsigned);

            case SignalDataType.Float:
                if (!TryToDouble(value, out var floating) || double.IsNaN(floating) || double.IsInfinity(floating))
                {
                    return "type-mismatch";
                }
                return CheckRange(definition, floating);

            case SignalDataType.Enum:
                if (value is not string enumValue)
                {
                    return "type-mismatch";
                }
                if (definition.EnumValues is null || !definition.EnumValues.Contains(enumValue, StringComparer.Ordinal))
                {
                    return "invalid-enum";
                }
                return null;

            case SignalDataType.String:
                return value is string ? null : "type-mismatch";

            default:
                return "type-mismatch";
        }
    }

    private static string? CheckRange(IndustrialSignalDefinition definition, double value)
    {
        if (definition.Min is { } min && value < min)
        {
            return "out-of-range";
        }
        if (definition.Max is { } max && value > max)
        {
            return "out-of-range";
        }
        return null;
    }

    private static object? Normalize(object? value) => value switch
    {
        bool b => b,
        sbyte or byte or short or ushort or int => Convert.ToInt64(value),
        uint u => (long)u,
        long l => l,
        float f => (double)f,
        double d => d,
        decimal m => (double)m,
        _ => value,
    };

    private static bool TryToInt64(object value, out long result)
    {
        switch (value)
        {
            case sbyte or byte or short or ushort or int or long or uint:
                result = Convert.ToInt64(value);
                return true;
            case float f when !float.IsNaN(f) && !float.IsInfinity(f) && Math.Abs(f % 1) < double.Epsilon:
                result = (long)f;
                return true;
            case double d when !double.IsNaN(d) && !double.IsInfinity(d) && Math.Abs(d % 1) < double.Epsilon:
                result = (long)d;
                return true;
            default:
                result = 0;
                return false;
        }
    }

    private static bool TryToDouble(object value, out double result)
    {
        switch (value)
        {
            case bool:
                result = 0;
                return false;
            case sbyte or byte or short or ushort or int or uint or long or ulong or float or double or decimal:
                result = Convert.ToDouble(value);
                return true;
            default:
                result = 0;
                return false;
        }
    }
}
