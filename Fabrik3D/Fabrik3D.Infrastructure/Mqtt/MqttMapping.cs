using System.Text.Json;
using Fabrik3D.Domain.Signals;

namespace Fabrik3D.Infrastructure.Mqtt;

/// <summary>
/// Versioned MQTT telemetry payload (schema 1.0). The original six fields are required; the
/// <c>source</c>, <c>quality</c>, <c>cellId</c>, <c>sessionId</c> and <c>correlationId</c> members
/// are optional and additive, so existing 1.0 publishers keep working unchanged.
/// </summary>
public record MqttTwinPayload(
    string SchemaVersion,
    string EquipmentId,
    string Category,
    string ExecutionState,
    Dictionary<string, JsonElement> Measurements,
    DateTime TimestampUtc,
    string? Source = null,
    string? Quality = null,
    string? CellId = null,
    string? SessionId = null,
    string? CorrelationId = null);

/// <summary>A validated, transport-neutral telemetry sample ready for mirror mapping.</summary>
public sealed record MqttTelemetrySample(
    string? CellId,
    string EquipmentId,
    string Category,
    string ExecutionState,
    IReadOnlyDictionary<string, JsonElement> Measurements,
    DateTimeOffset Timestamp,
    bool HasTimestamp,
    SignalQuality Quality,
    SignalSource Source,
    string? SessionId,
    string? CorrelationId,
    bool Retained,
    bool Historical);

/// <summary>Quality/source vocabulary reused from the shared signal core.</summary>
public static class MqttMapping
{
    public const string TopicPrefix = "fabrik3d/v1/cells/{cellId}/equipment/{equipmentId}";
    public const string TelemetrySegment = "/telemetry";
    public const string SupportedSchemaVersion = "1.0";

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    /// <summary>
    /// Legacy mapping surface kept for backward compatibility: requires a <c>/telemetry</c> topic,
    /// schema version 1.0 and a non-empty equipment id.
    /// </summary>
    public static bool TryParseTelemetry(string topic, string payload, out MqttTwinPayload? mapped)
    {
        mapped = null;
        if (!topic.Contains(TelemetrySegment, StringComparison.Ordinal))
        {
            return false;
        }

        try
        {
            var value = JsonSerializer.Deserialize<MqttTwinPayload>(payload, JsonOptions);
            if (value?.SchemaVersion != SupportedSchemaVersion || string.IsNullOrWhiteSpace(value.EquipmentId))
            {
                return false;
            }

            mapped = value;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>
    /// Full validation pipeline used by the real connector: topic allow, payload size, JSON shape,
    /// schema version, quality/source vocabulary and retained-message freshness policy.
    /// Returns a canonical rejection reason on failure.
    /// </summary>
    public static bool TryParseTelemetry(
        string topic,
        string payload,
        bool retained,
        MqttOptions options,
        DateTimeOffset now,
        out MqttTelemetrySample? sample,
        out string? reason)
    {
        sample = null;
        ArgumentNullException.ThrowIfNull(options);

        if (!IsTelemetryTopic(topic, options))
        {
            reason = "unknown-topic";
            return false;
        }

        if (!IsAllowedPayloadSize(payload, options, out reason))
        {
            return false;
        }

        MqttTwinPayload? value;
        try
        {
            value = JsonSerializer.Deserialize<MqttTwinPayload>(payload, JsonOptions);
        }
        catch (JsonException)
        {
            reason = "malformed-json";
            return false;
        }

        if (value is null)
        {
            reason = "malformed-json";
            return false;
        }

        if (!string.Equals(value.SchemaVersion, SupportedSchemaVersion, StringComparison.Ordinal))
        {
            reason = "unsupported-schema";
            return false;
        }

        if (string.IsNullOrWhiteSpace(value.EquipmentId))
        {
            reason = "missing-equipment-id";
            return false;
        }

        var quality = SignalQuality.Good;
        if (!string.IsNullOrWhiteSpace(value.Quality))
        {
            if (!SignalVocabulary.TryParseQuality(value.Quality, out quality))
            {
                reason = "invalid-quality";
                return false;
            }
        }

        var source = SignalSource.Observed;
        if (!string.IsNullOrWhiteSpace(value.Source))
        {
            if (!SignalVocabulary.TryParseSource(value.Source, out source))
            {
                reason = "invalid-source";
                return false;
            }

            // The transport is an observation boundary. A publisher may not declare its value as
            // commanded; that would let an external broker masquerade as an operator command.
            if (source == SignalSource.Commanded)
            {
                reason = "commanded-source-not-allowed";
                return false;
            }
        }

        var hasTimestamp = value.TimestampUtc != default;
        var timestamp = hasTimestamp
            ? ToUtcOffset(value.TimestampUtc)
            : now;

        var historical = false;
        if (retained)
        {
            if (!options.AllowRetainedTelemetry)
            {
                reason = "retained-telemetry-disabled";
                return false;
            }

            if (!hasTimestamp)
            {
                // A retained value without a valid timestamp can never be trusted as fresh state.
                reason = "retained-without-timestamp";
                return false;
            }

            var age = now - timestamp;
            if (age.TotalMilliseconds > Math.Max(0, options.StaleAfterMilliseconds))
            {
                // Historical retained state is surfaced as stale, never as fresh good.
                quality = quality == SignalQuality.Good ? SignalQuality.Stale : quality;
                historical = true;
            }
        }

        sample = new MqttTelemetrySample(
            value.CellId,
            value.EquipmentId,
            value.Category,
            value.ExecutionState,
            value.Measurements ?? new Dictionary<string, JsonElement>(),
            timestamp,
            hasTimestamp,
            quality,
            source,
            value.SessionId,
            value.CorrelationId,
            retained,
            historical);
        reason = null;
        return true;
    }

    /// <summary>Exact-match outbound command policy: enabled connector, writes enabled, exact allow-list.</summary>
    public static bool CanPublishCommand(MqttOptions options, string topic)
        => options.Enabled && options.AllowWrites && options.CommandAllowList.Contains(topic, StringComparer.Ordinal);

    /// <summary>Full command policy including the retained-message decision.</summary>
    public static bool CanPublishCommand(MqttOptions options, string topic, bool retain)
        => CanPublishCommand(options, topic) && (!retain || options.AllowRetainedCommands);

    /// <summary>True when a topic matches a declared telemetry filter, the default prefix or the <c>/telemetry</c> segment.</summary>
    public static bool IsTelemetryTopic(string topic, MqttOptions options)
    {
        ArgumentNullException.ThrowIfNull(topic);
        ArgumentNullException.ThrowIfNull(options);

        if (string.IsNullOrWhiteSpace(topic))
        {
            return false;
        }

        foreach (var filter in options.TelemetryTopics)
        {
            if (!string.IsNullOrWhiteSpace(filter) && TopicMatches(filter, topic))
            {
                return true;
            }
        }

        return options.TelemetryTopics.Count == 0
            ? topic.Contains(TelemetrySegment, StringComparison.Ordinal)
            : false;
    }

    /// <summary>True when a topic matches a declared command-observation filter.</summary>
    public static bool IsCommandTopic(string topic, MqttOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        foreach (var filter in options.CommandTopics)
        {
            if (!string.IsNullOrWhiteSpace(filter) && TopicMatches(filter, topic))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>MQTT wildcard match (<c>+</c> single level, <c>#</c> multi level). Exact text otherwise.</summary>
    public static bool TopicMatches(string filter, string topic)
    {
        if (string.Equals(filter, topic, StringComparison.Ordinal))
        {
            return true;
        }

        var filterLevels = filter.Split('/');
        var topicLevels = topic.Split('/');

        for (var index = 0; index < filterLevels.Length; index++)
        {
            if (filterLevels[index] == "#")
            {
                return true;
            }

            if (index >= topicLevels.Length)
            {
                return false;
            }

            if (filterLevels[index] == "+")
            {
                continue;
            }

            if (!string.Equals(filterLevels[index], topicLevels[index], StringComparison.Ordinal))
            {
                return false;
            }
        }

        return filterLevels.Length == topicLevels.Length;
    }

    /// <summary>Resolves the declared mapping for a measurement, if any.</summary>
    public static MqttSignalMapping? ResolveMapping(MqttOptions options, string equipmentId, string measurement)
    {
        foreach (var mapping in options.SignalMap)
        {
            if (!string.Equals(mapping.Measurement, measurement, StringComparison.Ordinal))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(mapping.EquipmentId) &&
                !string.Equals(mapping.EquipmentId, equipmentId, StringComparison.Ordinal))
            {
                continue;
            }

            return mapping;
        }

        return null;
    }

    /// <summary>Default signal id rule: <c>{equipmentId}.{measurement}</c>.</summary>
    public static string BuildSignalId(string equipmentId, string measurement) => $"{equipmentId}.{measurement}";

    /// <summary>Converts a JSON measurement to a CLR primitive the signal mirror understands.</summary>
    public static object? ConvertMeasurement(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => element.TryGetInt64(out var integer) ? (object)integer : element.GetDouble(),
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        _ => element.GetRawText(),
    };

    /// <summary>Infers the signal data type from the JSON measurement shape.</summary>
    public static SignalDataType InferDataType(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.True or JsonValueKind.False => SignalDataType.Bool,
        JsonValueKind.Number => element.TryGetInt64(out _) ? SignalDataType.Int : SignalDataType.Float,
        JsonValueKind.String => SignalDataType.String,
        _ => SignalDataType.String,
    };

    /// <summary>Projects a mapping (or an inferred measurement) into a canonical signal definition.</summary>
    public static IndustrialSignalDefinition ToDefinition(
        MqttSignalMapping? mapping,
        string equipmentId,
        string signalId,
        SignalDataType dataType,
        int defaultStaleAfterMs)
    {
        var name = NameFromSignalId(signalId);

        return new IndustrialSignalDefinition(
            signalId,
            equipmentId,
            name,
            name,
            SignalDirection.TelemetryOnly,
            dataType,
            mapping?.EngineeringUnit,
            mapping?.Writable ?? false,
            mapping?.Min,
            mapping?.Max,
            mapping?.EnumValues,
            null,
            mapping?.StaleAfterMilliseconds ?? defaultStaleAfterMs);
    }

    private static string NameFromSignalId(string signalId)
    {
        var index = signalId.IndexOf('.', StringComparison.Ordinal);
        return index > 0 && index < signalId.Length - 1 ? signalId[(index + 1)..] : signalId;
    }

    private static bool IsAllowedPayloadSize(string payload, MqttOptions options, out string? reason)
    {
        var size = string.IsNullOrEmpty(payload) ? 0 : System.Text.Encoding.UTF8.GetByteCount(payload);
        if (options.MaxPayloadBytes > 0 && size > options.MaxPayloadBytes)
        {
            reason = "payload-too-large";
            return false;
        }

        if (size == 0)
        {
            reason = "empty-payload";
            return false;
        }

        reason = null;
        return true;
    }

    private static DateTimeOffset ToUtcOffset(DateTime value)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };

        return new DateTimeOffset(utc);
    }
}

/// <summary>Validates connector configuration before any network work starts.</summary>
public static class MqttOptionsValidator
{
    public static IReadOnlyList<string> Validate(MqttOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var errors = new List<string>();

        if (!options.Enabled)
        {
            return errors;
        }

        if (!Uri.TryCreate(options.Broker, UriKind.Absolute, out var broker) ||
            (broker.Scheme != "mqtt" && broker.Scheme != "mqtts" &&
             broker.Scheme != "tcp" && broker.Scheme != "ssl"))
        {
            errors.Add($"invalid-broker: '{options.Broker}' is not a valid mqtt:// or mqtts:// broker uri.");
        }

        if (string.IsNullOrWhiteSpace(options.ClientId))
        {
            errors.Add("invalid-client-id: ClientId is required.");
        }

        if (options.QoS is < 0 or > 2)
        {
            errors.Add($"invalid-qos: QoS '{options.QoS}' must be 0, 1 or 2.");
        }

        if (options.ReconnectDelaySeconds < 0 || options.MaxReconnectDelaySeconds < 1 ||
            options.MaxReconnectDelaySeconds < options.ReconnectDelaySeconds)
        {
            errors.Add("invalid-reconnect-policy: MaxReconnectDelaySeconds must be >= ReconnectDelaySeconds >= 0.");
        }

        if (options.ConnectTimeoutSeconds <= 0)
        {
            errors.Add("invalid-connect-timeout: ConnectTimeoutSeconds must be positive.");
        }

        if (options.MaxPayloadBytes <= 0)
        {
            errors.Add("invalid-payload-bound: MaxPayloadBytes must be positive.");
        }

        if (options.StaleAfterMilliseconds <= 0)
        {
            errors.Add("invalid-stale-after: StaleAfterMilliseconds must be positive.");
        }

        if (!TryParseProtocolVersion(options.ProtocolVersion, out _))
        {
            errors.Add($"invalid-protocol-version: '{options.ProtocolVersion}' is not 5.0 or 3.1.1.");
        }

        if (options.AllowUntrustedCertificates && !options.UseTls)
        {
            // The untrusted-certificate escape hatch only has meaning for TLS brokers. Requiring
            // UseTls keeps the flag explicit instead of a silent no-op on a plaintext broker.
            errors.Add(
                "insecure-tls-policy: AllowUntrustedCertificates requires UseTls=true; the flag has no effect on a plaintext broker.");
        }

        if (!string.IsNullOrEmpty(options.Password) && string.IsNullOrEmpty(options.UserName))
        {
            errors.Add("invalid-credentials: a password requires a user name.");
        }

        if (!string.IsNullOrWhiteSpace(options.WillTopic) && string.IsNullOrWhiteSpace(options.WillPayload))
        {
            errors.Add("invalid-will: a configured Last Will requires a non-empty WillPayload.");
        }

        foreach (var topic in options.TelemetryTopics)
        {
            if (string.IsNullOrWhiteSpace(topic))
            {
                errors.Add("invalid-telemetry-topic: telemetry topic filters must not be empty.");
            }
        }

        var signalIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var mapping in options.SignalMap)
        {
            if (string.IsNullOrWhiteSpace(mapping.SignalId) || string.IsNullOrWhiteSpace(mapping.Measurement))
            {
                errors.Add("invalid-signal-map-entry: every entry requires a SignalId and a Measurement.");
                continue;
            }

            if (!signalIds.Add(mapping.SignalId))
            {
                errors.Add($"duplicate-signal-id: '{mapping.SignalId}' appears more than once in the signal map.");
            }

            if (!SignalVocabulary.TryParseDataType(mapping.DataType, out _))
            {
                errors.Add($"invalid-data-type: '{mapping.DataType}' is not a known signal data type.");
            }
        }

        return errors;
    }

    /// <summary>Parses a configured wire protocol; MQTT 5 is the default with a 3.1.1 fallback.</summary>
    public static bool TryParseProtocolVersion(string? value, out string normalized)
    {
        switch (value?.Trim())
        {
            case "3.1.1":
                normalized = "3.1.1";
                return true;
            case "5.0":
            case "5":
                normalized = "5.0";
                return true;
            default:
                normalized = "5.0";
                return false;
        }
    }
}
