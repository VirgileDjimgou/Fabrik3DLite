namespace Fabrik3D.Infrastructure.Mqtt;

/// <summary>
/// Optional MQTT connector settings. Disabled, read-only and non-retained for commands by default.
/// Credentials and TLS material come from configuration or environment and are never committed and
/// never logged. MQTT is an integration boundary only; it never carries application orchestration.
/// </summary>
public class MqttOptions
{
    public const string SectionName = "Mqtt";

    public bool Enabled { get; set; }

    /// <summary>Broker uri, for example <c>mqtt://localhost:1883</c> or <c>mqtts://broker:8883</c>.</summary>
    public string Broker { get; set; } = "mqtt://localhost:1883";

    public string ClientId { get; set; } = "fabrik3d-orchestrator";

    /// <summary>QoS used for telemetry/command subscriptions and outbound publishes (0, 1 or 2).</summary>
    public int QoS { get; set; } = 1;

    /// <summary>MQTT clean-session / clean-start flag. A persistent session is the default.</summary>
    public bool CleanSession { get; set; }

    /// <summary>Session expiry advertised on connect (MQTT 5 only; ignored for 3.1.1).</summary>
    public int SessionExpirySeconds { get; set; } = 3600;

    public int ReconnectDelaySeconds { get; set; } = 5;
    public int MaxReconnectDelaySeconds { get; set; } = 60;
    public int ConnectTimeoutSeconds { get; set; } = 10;
    public int KeepAliveSeconds { get; set; } = 30;

    /// <summary>Wire protocol; <c>5.0</c> (default) or <c>3.1.1</c> for legacy peers.</summary>
    public string ProtocolVersion { get; set; } = "5.0";

    /// <summary>Optional broker user name. Never logged.</summary>
    public string? UserName { get; set; }

    /// <summary>Optional broker password. Never logged.</summary>
    public string? Password { get; set; }

    public bool UseTls { get; set; }

    /// <summary>
    /// Development-only escape hatch: accept any broker certificate. Never enable in production.
    /// </summary>
    public bool AllowUntrustedCertificates { get; set; }

    /// <summary>
    /// Development marker: the broker is anonymous. Anonymous brokers are only ever explicitly opted in.
    /// </summary>
    public bool AllowAnonymousBroker { get; set; } = true;

    /// <summary>Enables outbound publishes (commands and telemetry). Disabled and fail-closed by default.</summary>
    public bool AllowWrites { get; set; }

    /// <summary>Exact-match topic allow-list for outbound command publishes.</summary>
    public List<string> CommandAllowList { get; set; } = [];

    /// <summary>Retained commands are refused unless explicitly configured.</summary>
    public bool AllowRetainedCommands { get; set; }

    /// <summary>
    /// Retained telemetry is accepted only with a valid timestamp and is downgraded to a historical
    /// (stale) quality unless it is demonstrably fresh. Disabling rejects it outright.
    /// </summary>
    public bool AllowRetainedTelemetry { get; set; } = true;

    /// <summary>Hard upper bound on an inbound/outbound MQTT payload.</summary>
    public int MaxPayloadBytes { get; set; } = 65536;

    public int StaleAfterMilliseconds { get; set; } = 10000;

    /// <summary>Bound on the duplicate/correlation tracking window (no unbounded queues).</summary>
    public int DuplicateWindowSize { get; set; } = 1024;

    /// <summary>Optional Last Will topic used for broker-side liveness signalling.</summary>
    public string? WillTopic { get; set; }

    public string WillPayload { get; set; } = "{\"schemaVersion\":\"1.0\",\"state\":\"offline\"}";

    public bool WillRetain { get; set; } = true;

    /// <summary>Declared telemetry topic filters (wildcards allowed), for example <c>fabrik3d/v1/cells/+/equipment/+/telemetry</c>.</summary>
    public List<string> TelemetryTopics { get; set; } = [];

    /// <summary>Optional command topic filters subscribed for observation (never used for orchestration).</summary>
    public List<string> CommandTopics { get; set; } = [];

    /// <summary>Explicit measurement-to-signal declarations. Unmapped measurements use <c>{equipmentId}.{measurement}</c>.</summary>
    public List<MqttSignalMapping> SignalMap { get; set; } = [];
}

/// <summary>
/// One mapping from a payload measurement to a canonical domain signal id. This is configuration
/// data; no protocol type is exposed to Domain.
/// </summary>
public class MqttSignalMapping
{
    /// <summary>Canonical signal id, convention <c>&lt;equipmentId&gt;.&lt;name&gt;</c>.</summary>
    public string SignalId { get; set; } = string.Empty;

    /// <summary>Payload measurement key this entry maps.</summary>
    public string Measurement { get; set; } = string.Empty;

    /// <summary>Optional equipment scope; when set the mapping only applies to that equipment.</summary>
    public string? EquipmentId { get; set; }

    /// <summary>One of bool, int, uint, float, enum, string.</summary>
    public string DataType { get; set; } = "float";

    public string? EngineeringUnit { get; set; }
    public bool Writable { get; set; }
    public double? Min { get; set; }
    public double? Max { get; set; }
    public List<string>? EnumValues { get; set; }
    public int? StaleAfterMilliseconds { get; set; }
}
