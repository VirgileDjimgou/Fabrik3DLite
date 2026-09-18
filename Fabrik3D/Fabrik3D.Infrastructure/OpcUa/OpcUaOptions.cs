namespace Fabrik3D.Infrastructure.OpcUa;
/// <summary>Optional OPC UA connector settings. Disabled and read-only by default.</summary>
public class OpcUaOptions
{
    public const string SectionName = "OpcUa";
    public bool Enabled { get; set; }
    public string Endpoint { get; set; } = "opc.tcp://localhost:4840";
    public string SecurityPolicy { get; set; } = "Basic256Sha256";
    public string CertificateTrustStore { get; set; } = "./data/opcua-trust";
    public int ReconnectDelaySeconds { get; set; } = 5;
    public int SamplingIntervalMilliseconds { get; set; } = 1000;
    public bool AllowWrites { get; set; }
    public List<string> WriteAllowList { get; set; } = [];
}
