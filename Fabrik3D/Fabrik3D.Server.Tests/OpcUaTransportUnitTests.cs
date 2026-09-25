using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.Server.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Opc.Ua;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for the OPC UA transport pieces that do not need a live server: option validation,
/// write policy, quality/timestamp mapping and the connector-status surface.
/// Integration coverage lives in <see cref="OpcUaConnectorIntegrationTests"/>.
/// </summary>
public class OpcUaTransportUnitTests
{
    private static OpcUaNodeMapEntry Entry(
        string signalId = "robot-1.Speed",
        string nodeId = "ns=2;s=Fabrik3D/Robot/Speed",
        bool writable = false,
        string direction = "input-to-controller",
        string dataType = "float")
        => new()
        {
            SignalId = signalId,
            NodeId = nodeId,
            EquipmentId = "robot-1",
            Name = "Speed",
            Writable = writable,
            Direction = direction,
            DataType = dataType,
        };

    [Fact]
    public void Disabled_connector_skips_validation_entirely()
    {
        var options = new OpcUaOptions
        {
            Enabled = false,
            Endpoint = "not-an-endpoint",
            ReconnectDelaySeconds = 50,
            MaxReconnectDelaySeconds = 5,
            SamplingIntervalMilliseconds = -1,
        };

        Assert.Empty(OpcUaOptionsValidator.Validate(options));
    }

    [Fact]
    public void Validator_reports_invalid_endpoint_policy_and_node_map()
    {
        var options = new OpcUaOptions
        {
            Enabled = true,
            Endpoint = "http://localhost:4840",
            ReconnectDelaySeconds = 10,
            MaxReconnectDelaySeconds = 5,
            SamplingIntervalMilliseconds = 0,
            PublishingIntervalMilliseconds = 0,
            NodeMap =
            [
                Entry(),
                Entry(),
                Entry(signalId: "robot-1.Bad", nodeId: "ns=notanumber;s=Fabrik3D/Robot/Bad", direction: "sideways", dataType: "quantum"),
            ],
        };

        var errors = OpcUaOptionsValidator.Validate(options);

        Assert.Contains("invalid-endpoint", errors[0]);
        Assert.Contains(errors, error => error.StartsWith("invalid-reconnect-policy", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-sampling-interval", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-publishing-interval", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("duplicate-signal-id", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("duplicate-node-id", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-direction", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-data-type", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-node-id", StringComparison.Ordinal));
    }

    [Fact]
    public void Write_policy_requires_enabled_writes_allow_list_and_writable_signal()
    {
        var entry = Entry(writable: true);
        var options = new OpcUaOptions
        {
            Enabled = true,
            AllowWrites = true,
            WriteAllowList = [entry.NodeId],
        };

        Assert.True(OpcUaMapping.CanWrite(options, entry.NodeId));
        Assert.True(OpcUaMapping.CanWriteSignal(options, entry));

        options.Enabled = false;
        Assert.False(OpcUaMapping.CanWriteSignal(options, entry));

        options.Enabled = true;
        options.AllowWrites = false;
        Assert.False(OpcUaMapping.CanWriteSignal(options, entry));

        options.AllowWrites = true;
        Assert.False(OpcUaMapping.CanWriteSignal(options, Entry(writable: false)));

        options.WriteAllowList = ["ns=2;s=Fabrik3D/Robot/OTHER"];
        Assert.False(OpcUaMapping.CanWriteSignal(options, entry));

        options.WriteAllowList = [entry.NodeId.ToUpperInvariant()];
        Assert.False(OpcUaMapping.CanWrite(options, entry.NodeId));
    }

    [Fact]
    public void Quality_mapping_preserves_good_uncertain_and_bad()
    {
        Assert.Equal(SignalQuality.Good, OpcUaMapping.MapQuality(StatusCodes.Good));
        Assert.Equal(SignalQuality.Uncertain, OpcUaMapping.MapQuality(StatusCodes.Uncertain));
        Assert.Equal(SignalQuality.Bad, OpcUaMapping.MapQuality(StatusCodes.Bad));
        Assert.Equal(SignalQuality.Bad, OpcUaMapping.MapQuality(StatusCodes.BadNodeIdUnknown));
    }

    [Fact]
    public void Monitored_value_mapping_uses_source_timestamp_and_observed_source()
    {
        var entry = Entry();
        var sourceTimestamp = new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Utc);
        var dataValue = new DataValue
        {
            Value = new Variant(2.5d),
            StatusCode = StatusCodes.Good,
            SourceTimestamp = sourceTimestamp,
        };

        var update = OpcUaMapping.ToMirrorUpdate(entry, dataValue, new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero));

        Assert.Equal(entry.SignalId, update.SignalId);
        Assert.Equal(2.5d, update.Value);
        Assert.Equal(SignalQuality.Good, update.Quality);
        Assert.Equal(SignalSource.Observed, update.Source);
        Assert.Equal(SignalOrigin.Controller, update.Origin);
        Assert.Equal(sourceTimestamp, update.Timestamp.UtcDateTime);
    }

    [Fact]
    public void Monitored_value_mapping_treats_unspecified_and_missing_timestamps_as_utc_now()
    {
        var entry = Entry();
        var now = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

        var unspecified = new DataValue
        {
            Value = new Variant(1.0d),
            StatusCode = StatusCodes.Good,
            SourceTimestamp = new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Unspecified),
        };
        var withoutTimestamp = new DataValue { Value = new Variant(1.0d), StatusCode = StatusCodes.Good };

        Assert.Equal(new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Utc), OpcUaMapping.ToMirrorUpdate(entry, unspecified, now).Timestamp.UtcDateTime);
        Assert.Equal(now, OpcUaMapping.ToMirrorUpdate(entry, withoutTimestamp, now).Timestamp);
    }

    [Fact]
    public void Node_map_entries_project_to_canonical_signal_definitions()
    {
        var entry = new OpcUaNodeMapEntry
        {
            SignalId = "robot-1.Speed",
            NodeId = "ns=2;s=Fabrik3D/Robot/Speed",
            Direction = "output-from-controller",
            DataType = "uint",
            Min = 0,
            Max = 3000,
            StaleAfterMilliseconds = 500,
        };

        var definition = OpcUaMapping.ToDefinition(entry);

        Assert.Equal("robot-1.Speed", definition.SignalId);
        Assert.Equal("robot-1", definition.EquipmentId);
        Assert.Equal("Speed", definition.Name);
        Assert.Equal(SignalDirection.OutputFromController, definition.Direction);
        Assert.Equal(SignalDataType.UInt, definition.DataType);
        Assert.Equal(500, definition.StaleAfterMs);
        Assert.Equal(0, definition.Min);
        Assert.Equal(3000, definition.Max);
    }

    [Fact]
    public async Task Write_attempts_fail_closed_before_any_connection()
    {
        var mirror = new SignalMirrorStore();

        var disabled = new OpcUaOptions { Enabled = false };
        await using var disabledConnector = new OpcUaConnector(Options.Create(disabled), mirror, NullLogger<OpcUaConnector>.Instance);
        var disabledResult = await disabledConnector.WriteAsync("robot-1.Speed", 1.0d, CancellationToken.None);
        Assert.False(disabledResult.Accepted);
        Assert.Equal("connector-disabled", disabledResult.RejectionReason);

        var readOnly = new OpcUaOptions { Enabled = true, AllowWrites = false };
        await using var readOnlyConnector = new OpcUaConnector(Options.Create(readOnly), mirror, NullLogger<OpcUaConnector>.Instance);
        var readOnlyResult = await readOnlyConnector.WriteAsync("robot-1.Speed", 1.0d, CancellationToken.None);
        Assert.False(readOnlyResult.Accepted);
        Assert.Equal("writes-disabled", readOnlyResult.RejectionReason);

        var unknownSignal = new OpcUaOptions { Enabled = true, AllowWrites = true, WriteAllowList = ["ns=2;s=x"] };
        await using var unknownConnector = new OpcUaConnector(Options.Create(unknownSignal), mirror, NullLogger<OpcUaConnector>.Instance);
        var unknownResult = await unknownConnector.WriteAsync("robot-1.Speed", 1.0d, CancellationToken.None);
        Assert.False(unknownResult.Accepted);
        Assert.Equal("unknown-signal", unknownResult.RejectionReason);
    }

    [Fact]
    public void Connector_status_surface_maps_disabled_and_enabled_options()
    {
        var disabledOptions = Options.Create(new OpcUaOptions { Enabled = false });
        var disabledConnector = new OpcUaConnector(disabledOptions, new SignalMirrorStore(), NullLogger<OpcUaConnector>.Instance);
        var disabledMqttOptions = Options.Create(new MqttOptions { Enabled = false });
        var disabledMqttConnector = new MqttConnector(disabledMqttOptions, new SignalMirrorStore(), NullLogger<MqttConnector>.Instance);
        var disabledModbusOptions = Options.Create(new ModbusOptions { Enabled = false });
        var disabledModbusConnector = new ModbusConnector(
            disabledModbusOptions, new SignalMirrorStore(), TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        var disabledController = new ConnectorsController(
            disabledConnector, disabledOptions, disabledMqttConnector, disabledMqttOptions, disabledModbusConnector, disabledModbusOptions);

        var disabledResult = Assert.IsType<OkObjectResult>(disabledController.GetOpcUa());
        var disabledDto = Assert.IsType<ConnectorStatusDto>(disabledResult.Value);
        Assert.Equal("opcua", disabledDto.Connector);
        Assert.Equal("Disabled", disabledDto.State);
        Assert.Null(disabledDto.Endpoint);
        Assert.Null(disabledDto.LastError);

        var enabledOptions = Options.Create(new OpcUaOptions { Enabled = true, Endpoint = "opc.tcp://127.0.0.1:4840" });
        var enabledConnector = new OpcUaConnector(enabledOptions, new SignalMirrorStore(), NullLogger<OpcUaConnector>.Instance);
        var enabledMqttOptions = Options.Create(new MqttOptions { Enabled = false });
        var enabledMqttConnector = new MqttConnector(enabledMqttOptions, new SignalMirrorStore(), NullLogger<MqttConnector>.Instance);
        var enabledModbusOptions = Options.Create(new ModbusOptions { Enabled = false });
        var enabledModbusConnector = new ModbusConnector(
            enabledModbusOptions, new SignalMirrorStore(), TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        var enabledController = new ConnectorsController(
            enabledConnector, enabledOptions, enabledMqttConnector, enabledMqttOptions, enabledModbusConnector, enabledModbusOptions);

        var enabledResult = Assert.IsType<OkObjectResult>(enabledController.GetOpcUa());
        var enabledDto = Assert.IsType<ConnectorStatusDto>(enabledResult.Value);
        Assert.Equal("opc.tcp://127.0.0.1:4840", enabledDto.Endpoint);
    }
}
