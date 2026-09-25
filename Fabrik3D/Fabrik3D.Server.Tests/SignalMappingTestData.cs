using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Mapping;

namespace Fabrik3D.Server.Tests;

/// <summary>Deterministic mapping fixtures shared by the S37 server tests.</summary>
internal static class SignalMappingTestData
{
    public static IReadOnlyDictionary<string, InternalSignalDescriptor> ReferenceCatalog()
        => new Dictionary<string, InternalSignalDescriptor>(StringComparer.Ordinal)
        {
            ["cnc-1.SpindleSpeed"] = new("cnc-1.SpindleSpeed", "cnc-1", false, "float"),
            ["cnc-1.FeedRate"] = new("cnc-1.FeedRate", "cnc-1", false, "float"),
            ["cnc-1.CycleStart"] = new("cnc-1.CycleStart", "cnc-1", true, "bool"),
            ["robot-1.Start"] = new("robot-1.Start", "robot-1", true, "bool"),
            ["conveyor-1.ActualSpeed"] = new("conveyor-1.ActualSpeed", "conveyor-1", false, "float"),
            ["conveyor-1.RunCommand"] = new("conveyor-1.RunCommand", "conveyor-1", true, "bool"),
        };

    public static SignalMappingDocumentDto SampleDocument() => new(
        "1.0",
        "reference-cell-mapping",
        "Reference cell signal mapping",
        [
            new SignalMappingEntryDto("opcua-cnc-spindle-speed", "CNC spindle speed to OPC UA", "cnc-1.SpindleSpeed", "cnc-1",
                "opcua", "read", "float", 1, 0, "rpm", true, new SignalMappingTargetDto(NodeId: "ns=2;s=Fabrik3D/CNC/SpindleSpeed")),
            new SignalMappingEntryDto("opcua-robot-start", "Robot start from OPC UA", "robot-1.Start", "robot-1",
                "opcua", "write", "bool", 1, 0, null, true, new SignalMappingTargetDto(NodeId: "ns=2;s=Fabrik3D/Robot/Start")),
            new SignalMappingEntryDto("mqtt-conveyor-actual-speed", "Conveyor speed over MQTT", "conveyor-1.ActualSpeed", "conveyor-1",
                "mqtt", "read", "float", 1, 0, "m/s", true,
                new SignalMappingTargetDto(Topic: "fabrik3d/v1/cells/single-conveyor-machining-cell/equipment/conveyor-1/telemetry", PayloadField: "ActualSpeed")),
            new SignalMappingEntryDto("mqtt-conveyor-run-command", "Conveyor command over MQTT", "conveyor-1.RunCommand", "conveyor-1",
                "mqtt", "write", "bool", 1, 0, null, true,
                new SignalMappingTargetDto(Topic: "fabrik3d/v1/cells/single-conveyor-machining-cell/equipment/conveyor-1/command", PayloadField: "RunCommand", Retain: false)),
            new SignalMappingEntryDto("modbus-cnc-feed-rate", "CNC feed rate register", "cnc-1.FeedRate", "cnc-1",
                "modbus", "read", "float", 1, 0, "mm/min", true,
                new SignalMappingTargetDto(Area: "holding-register", Address: 10, Width: 32, ByteOrder: "big-endian", WordOrder: "high-word-first")),
            new SignalMappingEntryDto("modbus-cnc-cycle-start", "CNC cycle start bit", "cnc-1.CycleStart", "cnc-1",
                "modbus", "write", "bool", 1, 0, null, true,
                new SignalMappingTargetDto(Area: "holding-register", Address: 20, Width: 16, BitIndex: 3, ByteOrder: "big-endian", AddressConvention: "zero-based")),
        ]);
}
