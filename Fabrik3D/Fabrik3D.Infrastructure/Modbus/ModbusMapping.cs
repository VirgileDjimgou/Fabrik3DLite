using Fabrik3D.Domain.Signals;

namespace Fabrik3D.Infrastructure.Modbus;

/// <summary>
/// Versioned Modbus mapping validation and domain projection. Validation is pure and returns
/// actionable, stable diagnostic codes so configuration problems are caught before any network
/// traffic. The mapping is data only: it never executes code and no Modbus address leaves this
/// adapter.
/// </summary>
public static class ModbusMapping
{
    public const string SchemaVersion = "1.0";

    public static readonly IReadOnlyList<int> SupportedIntegerWidths = [16, 32];
    public static readonly IReadOnlyList<int> SupportedFloatWidths = [32, 64];

    /// <summary>The point is a boolean carried by a single coil/discrete-input bit.</summary>
    public static bool IsBitAreaPoint(ModbusPointMapping point)
        => ModbusCodec.TryParseArea(point.Area, out var area) && !ModbusCodec.IsRegisterArea(area);

    /// <summary>The point is a boolean mapped onto one bit of a 16-bit register.</summary>
    public static bool IsRegisterBitPoint(ModbusPointMapping point)
        => ModbusCodec.TryParseArea(point.Area, out var area) && ModbusCodec.IsRegisterArea(area) &&
           string.Equals(point.DataType?.Trim(), "bool", StringComparison.OrdinalIgnoreCase);

    public static int EffectiveUnitId(ModbusOptions options, ModbusPointMapping point)
        => point.UnitId ?? options.UnitId;

    public static string EffectiveAddressConvention(ModbusOptions options, ModbusPointMapping point)
        => point.AddressConvention ?? options.AddressConvention;

    public static int EffectiveZeroBasedAddress(ModbusOptions options, ModbusPointMapping point)
        => ModbusCodec.NormalizeAddress(point.Address, EffectiveAddressConvention(options, point));

    public static ModbusPointDirection EffectiveDirection(ModbusPointMapping point)
        => ModbusCodec.TryParseDirection(point.Direction, out var direction) ? direction : ModbusPointDirection.Read;

    public static int EffectiveStaleAfterMs(ModbusOptions options, ModbusPointMapping point)
        => point.StaleAfterMilliseconds ?? options.StaleAfterMilliseconds;

    public static int EffectivePollIntervalMs(ModbusOptions options, ModbusPointMapping point)
        => point.PollIntervalMilliseconds ?? options.PollIntervalMilliseconds;

    public static ModbusPointMapping? FindPoint(ModbusOptions options, string signalId)
    {
        ArgumentNullException.ThrowIfNull(options);
        foreach (var point in options.Points)
        {
            if (string.Equals(point.SignalId, signalId, StringComparison.Ordinal))
            {
                return point;
            }
        }

        return null;
    }

    /// <summary>Projects a validated mapping into an immutable, protocol-free domain signal definition.</summary>
    public static IndustrialSignalDefinition ToDefinition(ModbusOptions options, ModbusPointMapping point)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(point);

        var direction = EffectiveDirection(point);
        var signalDirection = direction switch
        {
            ModbusPointDirection.Write => SignalDirection.OutputFromController,
            ModbusPointDirection.ReadWrite => SignalDirection.Internal,
            _ => SignalDirection.InputToController,
        };

        var dataType = SignalVocabulary.TryParseDataType(point.DataType, out var parsed)
            ? parsed
            : SignalDataType.Float;

        var (equipmentId, name) = SplitSignalId(point.SignalId);

        return new IndustrialSignalDefinition(
            point.SignalId,
            equipmentId,
            name,
            name,
            signalDirection,
            dataType,
            point.EngineeringUnit,
            ModbusCodec.DirectionAllowsWrite(direction),
            point.Min,
            point.Max,
            null,
            null,
            EffectiveStaleAfterMs(options, point));
    }

    public static (string EquipmentId, string Name) SplitSignalId(string signalId)
    {
        var index = signalId.IndexOf('.', StringComparison.Ordinal);
        return index > 0 && index < signalId.Length - 1
            ? (signalId[..index], signalId[(index + 1)..])
            : (signalId, signalId);
    }

    /// <summary>
    /// Validates the connector configuration. Returns an empty list when the connector is disabled
    /// (an inert default is always valid) and otherwise one diagnostic per problem found.
    /// </summary>
    public static IReadOnlyList<string> Validate(ModbusOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var errors = new List<string>();
        if (!options.Enabled)
        {
            return errors;
        }

        if (string.IsNullOrWhiteSpace(options.Host))
        {
            errors.Add("invalid-host: Host is required when the connector is enabled.");
        }

        if (options.Port is < 1 or > 65535)
        {
            errors.Add($"invalid-port: Port '{options.Port}' must be between 1 and 65535.");
        }

        if (!IsValidUnitId(options.UnitId))
        {
            errors.Add($"invalid-unit-id: UnitId '{options.UnitId}' must be between 1 and 247.");
        }

        if (options.ConnectTimeoutMilliseconds <= 0)
        {
            errors.Add("invalid-connect-timeout: ConnectTimeoutMilliseconds must be positive.");
        }

        if (options.RequestTimeoutMilliseconds <= 0)
        {
            errors.Add("invalid-request-timeout: RequestTimeoutMilliseconds must be positive.");
        }

        if (options.PollIntervalMilliseconds <= 0)
        {
            errors.Add("invalid-poll-interval: PollIntervalMilliseconds must be positive.");
        }

        if (options.StaleAfterMilliseconds <= 0)
        {
            errors.Add("invalid-stale-after: StaleAfterMilliseconds must be positive.");
        }

        if (options.ReconnectDelaySeconds < 0 || options.MaxReconnectDelaySeconds < 1 ||
            options.MaxReconnectDelaySeconds < options.ReconnectDelaySeconds)
        {
            errors.Add("invalid-reconnect-policy: MaxReconnectDelaySeconds must be >= ReconnectDelaySeconds >= 0.");
        }

        if (!ModbusCodec.IsKnownAddressConvention(options.AddressConvention))
        {
            errors.Add($"invalid-address-convention: '{options.AddressConvention}' must be 'zero-based' or 'one-based'.");
        }

        var signalIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var point in options.Points)
        {
            ValidatePoint(options, point, signalIds, errors);
        }

        ValidateOverlaps(options, errors);
        return errors;
    }

    private static void ValidatePoint(
        ModbusOptions options, ModbusPointMapping point, HashSet<string> signalIds, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(point.SignalId))
        {
            errors.Add("invalid-point: every point requires a non-empty SignalId.");
            return;
        }

        if (!signalIds.Add(point.SignalId))
        {
            errors.Add($"duplicate-signal-id: '{point.SignalId}' appears more than once in the point map.");
        }

        if (!ModbusCodec.TryParseArea(point.Area, out var area))
        {
            errors.Add(
                $"invalid-area: '{point.Area}' for '{point.SignalId}' is not coil, discrete-input, input-register or holding-register.");
            return;
        }

        if (!ModbusCodec.IsKnownAddressConvention(point.AddressConvention ?? options.AddressConvention))
        {
            errors.Add(
                $"invalid-address-convention: '{point.AddressConvention}' for '{point.SignalId}' is not 'zero-based' or 'one-based'.");
        }

        if (point.UnitId is { } unitId && !IsValidUnitId(unitId))
        {
            errors.Add($"invalid-unit-id: UnitId '{unitId}' for '{point.SignalId}' must be between 1 and 247.");
        }

        if (point.PollIntervalMilliseconds is <= 0)
        {
            errors.Add($"invalid-poll-interval: PollIntervalMilliseconds for '{point.SignalId}' must be positive.");
        }

        if (point.StaleAfterMilliseconds is <= 0)
        {
            errors.Add($"invalid-stale-after: StaleAfterMilliseconds for '{point.SignalId}' must be positive.");
        }

        if (!ModbusCodec.TryParseDirection(point.Direction, out var direction))
        {
            errors.Add($"invalid-direction: '{point.Direction}' for '{point.SignalId}' is not read, write or read-write.");
        }
        else if (!ModbusCodec.AreaAllowsWrite(area) && ModbusCodec.DirectionAllowsWrite(direction))
        {
            errors.Add(
                $"read-only-area-write: area '{ModbusCodec.ToWire(area)}' for '{point.SignalId}' is read-only; direction '{point.Direction}' is not allowed.");
        }

        if (!double.IsFinite(point.Scale) || point.Scale == 0.0)
        {
            errors.Add($"invalid-scale: Scale for '{point.SignalId}' must be a finite, non-zero number.");
        }

        if (!double.IsFinite(point.Offset))
        {
            errors.Add($"invalid-offset: Offset for '{point.SignalId}' must be a finite number.");
        }

        if (point.Min is { } min && !double.IsFinite(min))
        {
            errors.Add($"invalid-range: Min for '{point.SignalId}' must be finite.");
        }

        if (point.Max is { } max && !double.IsFinite(max))
        {
            errors.Add($"invalid-range: Max for '{point.SignalId}' must be finite.");
        }

        if (point.Min is { } minimum && point.Max is { } maximum && minimum > maximum)
        {
            errors.Add($"invalid-range: Min for '{point.SignalId}' must be <= Max.");
        }

        ValidateDataTypeAndWidth(point, area, errors);
        ValidateAddress(options, point, area, errors);
    }

    private static void ValidateDataTypeAndWidth(ModbusPointMapping point, ModbusArea area, List<string> errors)
    {
        var dataType = point.DataType?.Trim().ToLowerInvariant() ?? string.Empty;
        switch (dataType)
        {
            case "bool":
                if (ModbusCodec.IsRegisterArea(area))
                {
                    if (point.Width != 16)
                    {
                        errors.Add(
                            $"invalid-width: a boolean register point '{point.SignalId}' must declare width 16 (got {point.Width}).");
                    }

                    if (point.BitIndex is not { } bit || bit is < 0 or > 15)
                    {
                        errors.Add(
                            $"invalid-bit-index: boolean register point '{point.SignalId}' requires BitIndex between 0 and 15.");
                    }
                }
                else
                {
                    if (point.Width != 1)
                    {
                        errors.Add(
                            $"invalid-width: a boolean {ModbusCodec.ToWire(area)} point '{point.SignalId}' must declare width 1 (got {point.Width}).");
                    }

                    if (point.BitIndex is not null)
                    {
                        errors.Add(
                            $"invalid-bit-index: '{point.SignalId}' is a {ModbusCodec.ToWire(area)} point and cannot carry a BitIndex.");
                    }
                }

                return;

            case "int":
            case "uint":
                if (!SupportedIntegerWidths.Contains(point.Width))
                {
                    errors.Add(
                        $"invalid-width: integer point '{point.SignalId}' must declare width 16 or 32 (got {point.Width}); 64-bit integers are not supported by the schema-1.0 mirror.");
                }

                break;

            case "float":
                if (!SupportedFloatWidths.Contains(point.Width))
                {
                    errors.Add(
                        $"invalid-width: float point '{point.SignalId}' must declare width 32 or 64 (got {point.Width}).");
                }

                break;

            default:
                errors.Add($"invalid-data-type: '{point.DataType}' for '{point.SignalId}' is not bool, int, uint or float.");
                return;
        }

        if (ModbusCodec.IsRegisterArea(area))
        {
            if (!ModbusCodec.TryParseByteOrder(point.ByteOrder, out _))
            {
                errors.Add(
                    $"missing-endianness: register point '{point.SignalId}' must declare ByteOrder 'big-endian' or 'little-endian' explicitly.");
            }

            if (point.Width > 16 && !ModbusCodec.TryParseWordOrder(point.WordOrder, out _))
            {
                errors.Add(
                    $"missing-word-order: point '{point.SignalId}' with width {point.Width} must declare WordOrder 'high-word-first' or 'low-word-first' explicitly.");
            }
        }
        else if (point.BitIndex is not null)
        {
            errors.Add($"invalid-bit-index: '{point.SignalId}' is a {ModbusCodec.ToWire(area)} point and cannot carry a BitIndex.");
        }
    }

    private static void ValidateAddress(
        ModbusOptions options, ModbusPointMapping point, ModbusArea area, List<string> errors)
    {
        var zeroBased = EffectiveZeroBasedAddress(options, point);
        if (zeroBased < 0)
        {
            errors.Add(
                $"invalid-address: address {point.Address} for '{point.SignalId}' is invalid under the '{(ModbusCodec.IsOneBased(EffectiveAddressConvention(options, point)) ? "one-based" : "zero-based")}' convention.");
            return;
        }

        var count = ModbusCodec.RegisterCount(point);
        var last = zeroBased + count - 1;
        if (last > 65535)
        {
            errors.Add(
                $"invalid-address: point '{point.SignalId}' spans zero-based addresses {zeroBased}..{last}, beyond the Modbus limit 65535.");
        }

        if (point.Width <= 1 && count != 1)
        {
            errors.Add($"invalid-width: bit point '{point.SignalId}' must occupy exactly one address.");
        }

        if (area == ModbusArea.HoldingRegister && zeroBased + count - 1 > 65535)
        {
            errors.Add($"invalid-address: holding-register point '{point.SignalId}' exceeds the address space.");
        }
    }

    private static void ValidateOverlaps(ModbusOptions options, List<string> errors)
    {
        var points = options.Points
            .Where(point => !string.IsNullOrWhiteSpace(point.SignalId) &&
                            ModbusCodec.TryParseArea(point.Area, out _))
            .ToList();

        for (var left = 0; left < points.Count; left++)
        {
            for (var right = left + 1; right < points.Count; right++)
            {
                var a = points[left];
                var b = points[right];
                if (!SameBucket(options, a, b))
                {
                    continue;
                }

                var aStart = EffectiveZeroBasedAddress(options, a);
                var bStart = EffectiveZeroBasedAddress(options, b);
                var aEnd = aStart + ModbusCodec.RegisterCount(a) - 1;
                var bEnd = bStart + ModbusCodec.RegisterCount(b) - 1;
                if (aEnd < bStart || bEnd < aStart)
                {
                    continue;
                }

                // Distinct bits of the same 16-bit register are a legitimate, non-overlapping map.
                if (IsRegisterBitPoint(a) && IsRegisterBitPoint(b) && a.BitIndex != b.BitIndex)
                {
                    continue;
                }

                errors.Add(
                    $"overlapping-point: '{a.SignalId}' and '{b.SignalId}' overlap in area '{ModbusCodec.ToWire(ModbusCodec.TryParseArea(a.Area, out var parsed) ? parsed : ModbusArea.HoldingRegister)}' unit {EffectiveUnitId(options, a)} at zero-based addresses {aStart}..{aEnd} and {bStart}..{bEnd}; ambiguous maps are unsafe.");
            }
        }
    }

    private static bool SameBucket(ModbusOptions options, ModbusPointMapping a, ModbusPointMapping b)
        => ModbusCodec.TryParseArea(a.Area, out var areaA) &&
           ModbusCodec.TryParseArea(b.Area, out var areaB) &&
           areaA == areaB &&
           EffectiveUnitId(options, a) == EffectiveUnitId(options, b);

    private static bool IsValidUnitId(int unitId) => unitId is >= 1 and <= 247;
}
