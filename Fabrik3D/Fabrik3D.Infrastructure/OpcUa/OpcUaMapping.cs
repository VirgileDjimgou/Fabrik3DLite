using Fabrik3D.Domain.Signals;
using Opc.Ua;

namespace Fabrik3D.Infrastructure.OpcUa;

/// <summary>A protocol-level node value captured from a transport.</summary>
public record OpcUaNodeValue(string NodeId, object? Value, DateTime TimestampUtc);

/// <summary>Transport-independent mapped equipment state (legacy mapping surface).</summary>
public record OpcUaMappedState(
    string EquipmentId,
    string Category,
    string ExecutionState,
    Dictionary<string, object?> Measurements,
    DateTime TimestampUtc,
    string Source = "observed");

/// <summary>
/// Sample namespace: ns=2;s=Fabrik3D/{Equipment}/{Field}. No vendor model is implied.
/// Node ids are mapping data; they are translated into domain signal ids before reaching the mirror.
/// </summary>
public static class OpcUaMapping
{
    /// <summary>Legacy in-memory mapping kept for backward compatibility with S32 behavior.</summary>
    public static OpcUaMappedState Map(string equipmentId, string category, IEnumerable<OpcUaNodeValue> values)
    {
        var nodes = values.ToList();
        var execution = nodes.FirstOrDefault(v => v.NodeId.EndsWith("/ExecutionState", StringComparison.Ordinal))?.Value?.ToString() ?? "Unknown";
        var measurements = nodes.Where(v => !v.NodeId.EndsWith("/ExecutionState", StringComparison.Ordinal)).ToDictionary(v => v.NodeId.Split('/').Last(), v => v.Value);
        return new(equipmentId, category, execution, measurements, nodes.Count == 0 ? DateTime.UtcNow : nodes.Max(v => v.TimestampUtc));
    }

    /// <summary>Exact-match node id write policy: enabled connector, AllowWrites, allow-listed node id.</summary>
    public static bool CanWrite(OpcUaOptions options, string nodeId)
        => options.Enabled && options.AllowWrites && options.WriteAllowList.Contains(nodeId, StringComparer.Ordinal);

    /// <summary>Write policy for a mapped signal: allow-listed node id and a declared-writable signal.</summary>
    public static bool CanWriteSignal(OpcUaOptions options, OpcUaNodeMapEntry entry)
    {
        if (!entry.Writable)
        {
            return false;
        }

        return CanWrite(options, entry.NodeId);
    }

    /// <summary>Projects a node-map entry into a canonical domain signal definition.</summary>
    public static IndustrialSignalDefinition ToDefinition(OpcUaNodeMapEntry entry)
    {
        var signalId = string.IsNullOrWhiteSpace(entry.SignalId)
            ? $"{entry.EquipmentId}.{entry.Name}"
            : entry.SignalId;

        var equipmentId = string.IsNullOrWhiteSpace(entry.EquipmentId)
            ? EquipmentFromSignalId(signalId)
            : entry.EquipmentId!;

        var name = string.IsNullOrWhiteSpace(entry.Name)
            ? NameFromSignalId(signalId)
            : entry.Name!;

        SignalVocabulary.TryParseDirection(entry.Direction, out var direction);
        SignalVocabulary.TryParseDataType(entry.DataType, out var dataType);

        return new IndustrialSignalDefinition(
            signalId,
            equipmentId,
            name,
            name,
            direction,
            dataType,
            entry.EngineeringUnit,
            entry.Writable,
            entry.Min,
            entry.Max,
            entry.EnumValues,
            null,
            entry.StaleAfterMilliseconds);
    }

    /// <summary>Maps an OPC UA status code to the shared quality vocabulary. Quality is never upgraded.</summary>
    public static SignalQuality MapQuality(StatusCode statusCode)
    {
        if (StatusCode.IsGood(statusCode))
        {
            return SignalQuality.Good;
        }

        if (StatusCode.IsUncertain(statusCode))
        {
            return SignalQuality.Uncertain;
        }

        if (StatusCode.IsBad(statusCode))
        {
            return SignalQuality.Bad;
        }

        return SignalQuality.Invalid;
    }

    /// <summary>
    /// Maps a monitored-item data value to a mirror update with explicit quality and timestamp.
    /// Observed transport values are recorded with source <c>observed</c>; the producer is the controller.
    /// </summary>
    public static IndustrialSignalUpdate ToMirrorUpdate(OpcUaNodeMapEntry entry, DataValue dataValue, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(dataValue);

        var timestamp = ResolveTimestamp(dataValue, now);
        return new IndustrialSignalUpdate(
            entry.SignalId,
            dataValue.Value,
            MapQuality(dataValue.StatusCode),
            SignalSource.Observed,
            SignalOrigin.Controller,
            timestamp);
    }

    private static DateTimeOffset ResolveTimestamp(DataValue dataValue, DateTimeOffset now)
    {
        var candidate = dataValue.SourceTimestamp != default
            ? dataValue.SourceTimestamp
            : dataValue.ServerTimestamp;

        if (candidate == default)
        {
            return now;
        }

        if (candidate.Kind == DateTimeKind.Unspecified)
        {
            candidate = DateTime.SpecifyKind(candidate, DateTimeKind.Utc);
        }

        return new DateTimeOffset(candidate.ToUniversalTime());
    }

    private static string EquipmentFromSignalId(string signalId)
    {
        var index = signalId.IndexOf('.', StringComparison.Ordinal);
        return index > 0 ? signalId[..index] : signalId;
    }

    private static string NameFromSignalId(string signalId)
    {
        var index = signalId.IndexOf('.', StringComparison.Ordinal);
        return index > 0 && index < signalId.Length - 1 ? signalId[(index + 1)..] : signalId;
    }
}

/// <summary>Validates connector configuration before any network work starts.</summary>
public static class OpcUaOptionsValidator
{
    public static IReadOnlyList<string> Validate(OpcUaOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var errors = new List<string>();

        if (!options.Enabled)
        {
            return errors;
        }

        if (!Uri.TryCreate(options.Endpoint, UriKind.Absolute, out var endpoint) ||
            !string.Equals(endpoint.Scheme, "opc.tcp", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add($"invalid-endpoint: '{options.Endpoint}' is not a valid opc.tcp:// endpoint.");
        }

        if (options.ReconnectDelaySeconds < 0 || options.MaxReconnectDelaySeconds < 1 ||
            options.MaxReconnectDelaySeconds < options.ReconnectDelaySeconds)
        {
            errors.Add("invalid-reconnect-policy: MaxReconnectDelaySeconds must be >= ReconnectDelaySeconds >= 0.");
        }

        if (options.SamplingIntervalMilliseconds <= 0)
        {
            errors.Add("invalid-sampling-interval: SamplingIntervalMilliseconds must be positive.");
        }

        if (options.PublishingIntervalMilliseconds <= 0)
        {
            errors.Add("invalid-publishing-interval: PublishingIntervalMilliseconds must be positive.");
        }

        var signalIds = new HashSet<string>(StringComparer.Ordinal);
        var nodeIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in options.NodeMap)
        {
            if (string.IsNullOrWhiteSpace(entry.SignalId) || string.IsNullOrWhiteSpace(entry.NodeId))
            {
                errors.Add("invalid-node-map-entry: every entry requires a SignalId and a NodeId.");
                continue;
            }

            if (!signalIds.Add(entry.SignalId))
            {
                errors.Add($"duplicate-signal-id: '{entry.SignalId}' appears more than once in the node map.");
            }

            if (!nodeIds.Add(entry.NodeId))
            {
                errors.Add($"duplicate-node-id: '{entry.NodeId}' appears more than once in the node map.");
            }

            if (!SignalVocabulary.TryParseDirection(entry.Direction, out _))
            {
                errors.Add($"invalid-direction: '{entry.Direction}' is not a known signal direction.");
            }

            if (!SignalVocabulary.TryParseDataType(entry.DataType, out _))
            {
                errors.Add($"invalid-data-type: '{entry.DataType}' is not a known signal data type.");
            }

            if (!NodeId.TryParse(entry.NodeId, out _))
            {
                errors.Add($"invalid-node-id: '{entry.NodeId}' is not a parseable OPC UA node id.");
            }
        }

        return errors;
    }
}
