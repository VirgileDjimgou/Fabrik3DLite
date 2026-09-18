using Fabrik3D.Infrastructure.Mqtt;
namespace Fabrik3D.Server.Tests;
public class MqttMappingTests
{
    [Fact] public void Versioned_telemetry_payload_maps_and_invalid_payload_is_rejected()
    { const string json = "{\"schemaVersion\":\"1.0\",\"equipmentId\":\"robot-1\",\"category\":\"robot\",\"executionState\":\"Running\",\"measurements\":{},\"timestampUtc\":\"2026-01-01T00:00:00Z\"}"; Assert.True(MqttMapping.TryParseTelemetry("fabrik3d/v1/cells/demo/equipment/robot-1/telemetry", json, out var state)); Assert.Equal("robot-1", state!.EquipmentId); Assert.False(MqttMapping.TryParseTelemetry("x", "{}", out _)); }
    [Fact] public void Commands_require_explicit_allowlist()
    { var options = new MqttOptions { Enabled = true, AllowWrites = true, CommandAllowList = ["fabrik3d/v1/cells/demo/equipment/robot-1/command/start"] }; Assert.True(MqttMapping.CanPublishCommand(options, options.CommandAllowList[0])); options.AllowWrites = false; Assert.False(MqttMapping.CanPublishCommand(options, "fabrik3d/v1/cells/demo/equipment/robot-1/command/start")); }
}
