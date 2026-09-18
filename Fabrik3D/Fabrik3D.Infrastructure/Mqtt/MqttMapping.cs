using System.Text.Json;
namespace Fabrik3D.Infrastructure.Mqtt;
public record MqttTwinPayload(string SchemaVersion, string EquipmentId, string Category, string ExecutionState, Dictionary<string, JsonElement> Measurements, DateTime TimestampUtc);
public static class MqttMapping
{
    public const string TopicPrefix = "fabrik3d/v1/cells/{cellId}/equipment/{equipmentId}";
    public static bool TryParseTelemetry(string topic, string payload, out MqttTwinPayload? mapped)
    {
        mapped = null; if (!topic.Contains("/telemetry", StringComparison.Ordinal)) return false;
        try { var value = JsonSerializer.Deserialize<MqttTwinPayload>(payload, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }); if (value?.SchemaVersion != "1.0" || string.IsNullOrWhiteSpace(value.EquipmentId)) return false; mapped = value; return true; } catch (JsonException) { return false; }
    }
    public static bool CanPublishCommand(MqttOptions options, string topic) => options.Enabled && options.AllowWrites && options.CommandAllowList.Contains(topic, StringComparer.Ordinal);
}
