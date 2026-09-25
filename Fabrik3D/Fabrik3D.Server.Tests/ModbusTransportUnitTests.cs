using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.Server.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for the Modbus connector pieces that do not need a live PLC: disabled-by-default
/// behaviour, fail-closed write policy, configuration error reporting and the health surface.
/// Live coverage lives in <see cref="ModbusConnectorIntegrationTests"/>.
/// </summary>
public class ModbusTransportUnitTests
{
    private static ModbusPointMapping WritablePoint() => new()
    {
        SignalId = "robot-1.Setpoint",
        Area = "holding-register",
        Address = 40,
        DataType = "uint",
        Width = 16,
        ByteOrder = "big-endian",
        Direction = "read-write",
    };

    private static ModbusConnector CreateConnector(ModbusOptions options, SignalMirrorStore? mirror = null)
        => new(Options.Create(options), mirror ?? new SignalMirrorStore(), TimeProvider.System, NullLogger<ModbusConnector>.Instance);

    [Fact]
    public async Task Disabled_connector_start_and_stop_are_inert()
    {
        await using var connector = CreateConnector(new ModbusOptions { Enabled = false, Host = "not-a-host" });

        await connector.StartAsync();
        Assert.Equal(ModbusConnectorState.Disabled, connector.State);
        Assert.Equal("Disabled", connector.Health);

        var status = connector.GetStatus();
        Assert.Null(status.Endpoint);
        Assert.Empty(status.Points);

        await connector.StopAsync(CancellationToken.None);
        Assert.Equal(ModbusConnectorState.Disabled, connector.State);
    }

    [Fact]
    public async Task Invalid_enabled_configuration_reports_error_without_connecting()
    {
        var options = new ModbusOptions { Enabled = true, Host = "127.0.0.1", Port = 70000 };
        options.Points.Add(WritablePoint());
        options.Points.Add(new ModbusPointMapping
        {
            SignalId = "robot-1.Broken",
            Area = "holding-register",
            Address = 0,
            DataType = "uint",
            Width = 16,
            ByteOrder = null,
        });

        await using var connector = CreateConnector(options);
        await connector.StartAsync();

        Assert.Equal(ModbusConnectorState.Error, connector.State);
        Assert.False(string.IsNullOrWhiteSpace(connector.LastError));
        Assert.Contains("missing-endianness", connector.LastError!, StringComparison.Ordinal);
        Assert.Equal(0, connector.ReconnectCount);
    }

    [Fact]
    public async Task Writes_fail_closed_before_any_connection()
    {
        var disabled = new ModbusOptions { Enabled = false, AllowWrites = true, WriteAllowList = ["robot-1.Setpoint"] };
        disabled.Points.Add(WritablePoint());
        await using var disabledConnector = CreateConnector(disabled);
        Assert.Equal("connector-disabled",
            (await disabledConnector.WriteAsync("robot-1.Setpoint", 10, CancellationToken.None)).RejectionReason);

        var readOnly = new ModbusOptions { Enabled = true, AllowWrites = false, WriteAllowList = ["robot-1.Setpoint"] };
        readOnly.Points.Add(WritablePoint());
        await using var readOnlyConnector = CreateConnector(readOnly);
        Assert.Equal("writes-disabled",
            (await readOnlyConnector.WriteAsync("robot-1.Setpoint", 10, CancellationToken.None)).RejectionReason);

        var notListed = new ModbusOptions { Enabled = true, AllowWrites = true, WriteAllowList = [] };
        notListed.Points.Add(WritablePoint());
        await using var notListedConnector = CreateConnector(notListed);
        Assert.Equal("not-allow-listed",
            (await notListedConnector.WriteAsync("robot-1.Setpoint", 10, CancellationToken.None)).RejectionReason);

        var unknown = new ModbusOptions { Enabled = true, AllowWrites = true, WriteAllowList = ["robot-1.Setpoint"] };
        unknown.Points.Add(WritablePoint());
        await using var unknownConnector = CreateConnector(unknown);
        Assert.Equal("unknown-signal",
            (await unknownConnector.WriteAsync("robot-1.Absent", 10, CancellationToken.None)).RejectionReason);

        var inputRegister = new ModbusOptions { Enabled = true, AllowWrites = true, WriteAllowList = ["robot-1.Input"] };
        inputRegister.Points.Add(new ModbusPointMapping
        {
            SignalId = "robot-1.Input",
            Area = "input-register",
            Address = 0,
            DataType = "uint",
            Width = 16,
            ByteOrder = "big-endian",
            Direction = "read",
        });
        await using var inputConnector = CreateConnector(inputRegister);
        Assert.Equal("not-writable-signal",
            (await inputConnector.WriteAsync("robot-1.Input", 10, CancellationToken.None)).RejectionReason);

        var writableButClosed = new ModbusOptions { Enabled = true, AllowWrites = true, WriteAllowList = ["robot-1.Setpoint"] };
        writableButClosed.Points.Add(WritablePoint());
        await using var closedConnector = CreateConnector(writableButClosed);
        Assert.Equal("not-connected",
            (await closedConnector.WriteAsync("robot-1.Setpoint", 10, CancellationToken.None)).RejectionReason);

        var status = closedConnector.GetStatus();
        Assert.Equal(1, status.WriteAttempts);
        Assert.Equal(0, status.WritesAccepted);
        Assert.Equal(1, status.WritesRejected);
    }

    [Fact]
    public void IsWriteAllowed_requires_master_flags_direction_and_allow_list()
    {
        var options = new ModbusOptions { Enabled = true, AllowWrites = true, WriteAllowList = ["robot-1.Setpoint"] };
        options.Points.Add(WritablePoint());
        options.Points.Add(new ModbusPointMapping
        {
            SignalId = "robot-1.Speed",
            Area = "holding-register",
            Address = 0,
            DataType = "uint",
            Width = 16,
            ByteOrder = "big-endian",
            Direction = "read",
        });

        var connector = CreateConnector(options);

        Assert.True(connector.IsWriteAllowed("robot-1.Setpoint"));
        Assert.False(connector.IsWriteAllowed("robot-1.Speed"));
        Assert.False(connector.IsWriteAllowed("robot-1.Unknown"));

        options.AllowWrites = false;
        Assert.False(connector.IsWriteAllowed("robot-1.Setpoint"));
    }

    [Fact]
    public void Connector_status_surface_maps_disabled_and_enabled_options()
    {
        var disabledOpcUa = Options.Create(new OpcUaOptions { Enabled = false });
        var disabledOpcUaConnector = new OpcUaConnector(disabledOpcUa, new SignalMirrorStore(), NullLogger<OpcUaConnector>.Instance);
        var disabledMqtt = Options.Create(new MqttOptions { Enabled = false });
        var disabledMqttConnector = new MqttConnector(disabledMqtt, new SignalMirrorStore(), NullLogger<MqttConnector>.Instance);

        var disabledOptions = Options.Create(new ModbusOptions { Enabled = false });
        var disabledConnector = CreateConnector(disabledOptions.Value);
        var disabledController = new ConnectorsController(
            disabledOpcUaConnector, disabledOpcUa, disabledMqttConnector, disabledMqtt, disabledConnector, disabledOptions);

        var disabledResult = Assert.IsType<OkObjectResult>(disabledController.GetModbus());
        var disabledDto = Assert.IsType<ConnectorStatusDto>(disabledResult.Value);
        Assert.Equal("modbus", disabledDto.Connector);
        Assert.Equal("Disabled", disabledDto.State);
        Assert.Null(disabledDto.Endpoint);
        Assert.Null(disabledDto.LastError);
        Assert.Equal(0, disabledDto.MonitoredItemCount);

        var enabledOptions = Options.Create(new ModbusOptions { Enabled = true, Host = "127.0.0.1", Port = 1502 });
        var enabledConnector = CreateConnector(enabledOptions.Value);
        var enabledController = new ConnectorsController(
            disabledOpcUaConnector, disabledOpcUa, disabledMqttConnector, disabledMqtt, enabledConnector, enabledOptions);

        var enabledResult = Assert.IsType<OkObjectResult>(enabledController.GetModbus());
        var enabledDto = Assert.IsType<ConnectorStatusDto>(enabledResult.Value);
        Assert.Equal("127.0.0.1:1502", enabledDto.Endpoint);
        Assert.Equal("Disabled", enabledDto.State);
    }

    [Fact]
    public void Shipped_appsettings_keep_the_adapter_and_writes_disabled_by_default()
    {
        var path = FindAppSettings();
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var modbus = document.RootElement.GetProperty("Modbus");

        Assert.False(modbus.GetProperty("Enabled").GetBoolean());
        Assert.False(modbus.GetProperty("AllowWrites").GetBoolean());
        Assert.Equal("zero-based", modbus.GetProperty("AddressConvention").GetString());
        Assert.Empty(modbus.GetProperty("Points").EnumerateArray());
    }

    private static string FindAppSettings()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "Fabrik3D", "Fabrik3D.Server", "appsettings.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException("Fabrik3D/Fabrik3D.Server/appsettings.json was not found from the test output directory.");
    }
}
