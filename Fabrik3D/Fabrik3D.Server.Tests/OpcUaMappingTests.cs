using Fabrik3D.Infrastructure.OpcUa;
namespace Fabrik3D.Server.Tests;
public class OpcUaMappingTests
{
    [Fact] public void Sample_nodes_map_to_protocol_independent_equipment_state()
    { var state = OpcUaMapping.Map("robot-1", "robot", [new("ns=2;s=Fabrik3D/Robot/ExecutionState", "Running", DateTime.UnixEpoch), new("ns=2;s=Fabrik3D/Robot/Speed", 1.2, DateTime.UnixEpoch)]); Assert.Equal("Running", state.ExecutionState); Assert.Equal(1.2, state.Measurements["Speed"]); }
    [Fact] public void Writes_are_disabled_unless_explicitly_enabled_and_allowlisted()
    { var options = new OpcUaOptions { Enabled = true, AllowWrites = true, WriteAllowList = ["node"] }; Assert.True(OpcUaMapping.CanWrite(options, "node")); options.AllowWrites = false; Assert.False(OpcUaMapping.CanWrite(options, "node")); }
}
