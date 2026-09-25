using Fabrik3D.Infrastructure.Mapping;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>Projects validated mapping documents into connector configuration without mutating options.</summary>
public class SignalMappingProjectionTests
{
    [Fact]
    public void Projects_modbus_points_with_explicit_endianness_and_scaling()
    {
        var points = SignalMappingProjection.ToModbusPoints(SignalMappingTestData.SampleDocument());
        Assert.Equal(2, points.Count);

        var feedRate = points.Single(point => point.SignalId == "cnc-1.FeedRate");
        Assert.Equal("holding-register", feedRate.Area);
        Assert.Equal(10, feedRate.Address);
        Assert.Equal(32, feedRate.Width);
        Assert.Equal("big-endian", feedRate.ByteOrder);
        Assert.Equal("high-word-first", feedRate.WordOrder);
        Assert.Equal("read", feedRate.Direction);

        var cycleStart = points.Single(point => point.SignalId == "cnc-1.CycleStart");
        Assert.Equal(16, cycleStart.Width);
        Assert.Equal(3, cycleStart.BitIndex);
        Assert.Equal("write", cycleStart.Direction);
    }

    [Fact]
    public void Builds_modbus_options_without_mutating_the_base_options()
    {
        var baseOptions = new ModbusOptions { Enabled = true, Host = "127.0.0.1", Port = 1502, Points = [] };
        var built = SignalMappingProjection.BuildModbusOptions(baseOptions, SignalMappingTestData.SampleDocument());

        Assert.True(built.Enabled);
        Assert.Equal(1502, built.Port);
        Assert.Equal(2, built.Points.Count);
        Assert.Empty(baseOptions.Points);
    }

    [Fact]
    public void Projects_mqtt_signal_map_and_opcua_node_map()
    {
        var mqtt = SignalMappingProjection.ToMqttMappings(SignalMappingTestData.SampleDocument());
        Assert.Equal(2, mqtt.Count);
        var runCommand = mqtt.Single(entry => entry.SignalId == "conveyor-1.RunCommand");
        Assert.Equal("RunCommand", runCommand.Measurement);
        Assert.True(runCommand.Writable);

        var opcua = SignalMappingProjection.ToOpcUaEntries(SignalMappingTestData.SampleDocument());
        Assert.Equal(2, opcua.Count);
        var start = opcua.Single(entry => entry.SignalId == "robot-1.Start");
        Assert.Equal("ns=2;s=Fabrik3D/Robot/Start", start.NodeId);
        Assert.True(start.Writable);
        Assert.Equal("output-from-controller", start.Direction);
    }

    [Fact]
    public void Disabled_entries_are_not_projected()
    {
        var document = SignalMappingTestData.SampleDocument() with
        {
            Entries = SignalMappingTestData.SampleDocument().Entries
                .Select(entry => entry with { Enabled = entry.Protocol != "modbus" })
                .ToList(),
        };
        Assert.Empty(SignalMappingProjection.ToModbusPoints(document));
        Assert.Equal(2, SignalMappingProjection.ToOpcUaEntries(document).Count);
        Assert.Equal(2, SignalMappingProjection.ToMqttMappings(document).Count);
    }
}
