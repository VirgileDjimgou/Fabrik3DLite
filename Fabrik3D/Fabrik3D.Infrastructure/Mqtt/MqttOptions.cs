namespace Fabrik3D.Infrastructure.Mqtt;
public class MqttOptions
{
    public const string SectionName = "Mqtt";
    public bool Enabled { get; set; }
    public string Broker { get; set; } = "mqtt://localhost:1883";
    public string ClientId { get; set; } = "fabrik3d-orchestrator";
    public int QoS { get; set; } = 1;
    public bool CleanSession { get; set; }
    public int ReconnectDelaySeconds { get; set; } = 5;
    public bool AllowWrites { get; set; }
    public List<string> CommandAllowList { get; set; } = [];
}
