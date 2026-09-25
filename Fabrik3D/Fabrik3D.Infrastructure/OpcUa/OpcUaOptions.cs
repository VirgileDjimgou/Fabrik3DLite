namespace Fabrik3D.Infrastructure.OpcUa;

/// <summary>
/// Optional OPC UA connector settings. Disabled and read-only by default.
/// Secrets (user name/password) come from configuration or environment and are never committed.
/// </summary>
public class OpcUaOptions
{
    public const string SectionName = "OpcUa";

    public bool Enabled { get; set; }
    public string Endpoint { get; set; } = "opc.tcp://localhost:4840";
    public string SecurityPolicy { get; set; } = "Basic256Sha256";
    public string ApplicationName { get; set; } = "Fabrik3D.OpcUa";
    public string CertificateTrustStore { get; set; } = "./data/opcua-trust";
    public string? UserName { get; set; }
    public string? Password { get; set; }

    /// <summary>
    /// Development-only escape hatch: accept any server certificate. Never enable in production.
    /// </summary>
    public bool AutoAcceptUntrustedCertificates { get; set; }

    public int ReconnectDelaySeconds { get; set; } = 5;
    public int MaxReconnectDelaySeconds { get; set; } = 60;
    public int SamplingIntervalMilliseconds { get; set; } = 1000;
    public int PublishingIntervalMilliseconds { get; set; } = 1000;
    public int OperationTimeoutMilliseconds { get; set; } = 15000;
    public int SessionTimeoutMilliseconds { get; set; } = 60000;
    public int StaleAfterMilliseconds { get; set; } = 10000;

    public bool AllowWrites { get; set; }

    /// <summary>Exact-match protocol node id allow-list for writes.</summary>
    public List<string> WriteAllowList { get; set; } = [];

    /// <summary>Explicit protocol node id to signal map. Node ids never leave this mapping.</summary>
    public List<OpcUaNodeMapEntry> NodeMap { get; set; } = [];
}

/// <summary>
/// One mapping from a protocol node id to a domain signal id. This is configuration data;
/// no protocol type is exposed to Domain.
/// </summary>
public class OpcUaNodeMapEntry
{
    /// <summary>Stable domain signal id, convention <c>&lt;equipmentId&gt;.&lt;name&gt;</c>.</summary>
    public string SignalId { get; set; } = string.Empty;

    /// <summary>Protocol node id (for example <c>ns=2;s=Fabrik3D/Robot/Speed</c>).</summary>
    public string NodeId { get; set; } = string.Empty;

    public string? EquipmentId { get; set; }
    public string? Name { get; set; }

    /// <summary>One of input-to-controller, output-from-controller, internal, telemetry-only.</summary>
    public string Direction { get; set; } = "input-to-controller";

    /// <summary>One of bool, int, uint, float, enum, string.</summary>
    public string DataType { get; set; } = "float";

    public string? EngineeringUnit { get; set; }
    public bool Writable { get; set; }
    public double? Min { get; set; }
    public double? Max { get; set; }
    public List<string>? EnumValues { get; set; }
    public int? StaleAfterMilliseconds { get; set; }
}
