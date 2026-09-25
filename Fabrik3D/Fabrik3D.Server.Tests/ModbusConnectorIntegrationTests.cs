using System.Diagnostics;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.Modbus.Fixture;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Modbus connector integration tests against a real Modbus TCP server started in-process by the
/// purpose-built <see cref="Fabrik3D.Modbus.Fixture.ModbusTcpFixtureServer"/>. They prove connect,
/// address-level reads for all four areas, typed/scaled mapping, illegal-address handling, timeouts,
/// reconnect after a PLC outage and the fail-closed write policy.
/// </summary>
public class ModbusConnectorIntegrationTests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private readonly ITestOutputHelper _output;

    public ModbusConnectorIntegrationTests(ITestOutputHelper output) => _output = output;

    private static ModbusOptions ConnectorOptions(ModbusTcpFixtureServer fixture, bool allowWrites = false) => new()
    {
        Enabled = true,
        Host = "127.0.0.1",
        Port = fixture.Port,
        UnitId = 1,
        ConnectTimeoutMilliseconds = 5000,
        RequestTimeoutMilliseconds = 2000,
        PollIntervalMilliseconds = 100,
        ReconnectDelaySeconds = 1,
        MaxReconnectDelaySeconds = 1,
        StaleAfterMilliseconds = 30000,
        AllowWrites = allowWrites,
        AddressConvention = "zero-based",
    };

    private static ModbusConnector CreateConnector(ModbusOptions options, SignalMirrorStore mirror)
        => new(Options.Create(options), mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);

    private static ModbusPointMapping Point(
        string signalId,
        string area,
        int address,
        string dataType = "uint",
        int width = 16,
        string? byteOrder = "big-endian",
        string? wordOrder = "high-word-first",
        int? bitIndex = null,
        double scale = 1.0,
        double offset = 0.0,
        string direction = "read") => new()
        {
            SignalId = signalId,
            Area = area,
            Address = address,
            DataType = dataType,
            Width = width,
            ByteOrder = byteOrder,
            WordOrder = wordOrder,
            BitIndex = bitIndex,
            Scale = scale,
            Offset = offset,
            Direction = direction,
        };

    private static async Task<bool> WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
    {
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < timeout)
        {
            if (condition())
            {
                return true;
            }

            await Task.Delay(25);
        }

        return condition();
    }

    private static bool HasNumeric(SignalMirrorStore mirror, string signalId, double expected)
        => mirror.TryGetSample(signalId, out var sample) &&
           sample!.Value is not null &&
           sample.Value is not bool &&
           Math.Abs(Convert.ToDouble(sample.Value) - expected) < 0.0001;

    private static bool HasBool(SignalMirrorStore mirror, string signalId, bool expected)
        => mirror.TryGetSample(signalId, out var sample) && sample!.Value is bool value && value == expected;

    /// <summary>Arranges two big-endian holding registers for a float without reusing the connector codec.</summary>
    private static void SetFloat32BigEndianHighWordFirst(ModbusTcpFixtureServer fixture, int address, float value)
    {
        var bits = BitConverter.SingleToInt32Bits(value);
        fixture.SetHoldingRegister(address, (ushort)(bits >> 16));
        fixture.SetHoldingRegister(address + 1, (ushort)(bits & 0xFFFF));
    }

    [Fact]
    public async Task Connects_and_reads_all_four_areas_with_typed_scaled_mapping()
    {
        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        _output.WriteLine($"Modbus fixture: endpoint={fixture.Endpoint}");

        fixture.SetHoldingRegister(0, 4242);
        fixture.SetInputRegister(2, 0xFFFE);
        fixture.SetCoil(0, true);
        fixture.SetDiscreteInput(1, true);
        SetFloat32BigEndianHighWordFirst(fixture, 10, 1.5f);
        fixture.SetHoldingRegister(20, 100);
        fixture.SetHoldingRegister(30, 0b0000_1000);

        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(fixture);
        options.Points.Add(Point("robot-1.Counter", "holding-register", 0));
        options.Points.Add(Point("robot-1.Offset", "input-register", 2, "int"));
        options.Points.Add(Point("robot-1.Running", "coil", 0, "bool", 1, byteOrder: null, wordOrder: null));
        options.Points.Add(Point("robot-1.Ready", "discrete-input", 1, "bool", 1, byteOrder: null, wordOrder: null));
        options.Points.Add(Point("robot-1.Speed", "holding-register", 10, "float", 32));
        options.Points.Add(Point("robot-1.Scaled", "holding-register", 20, scale: 0.1, offset: -5.0));
        options.Points.Add(Point("robot-1.Flag", "holding-register", 30, "bool", 16, bitIndex: 3));

        await using var connector = CreateConnector(options, mirror);
        await connector.StartAsync();

        Assert.True(await WaitUntilAsync(() => connector.State == ModbusConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        Assert.True(await WaitUntilAsync(
                () => HasNumeric(mirror, "robot-1.Counter", 4242) &&
                      HasNumeric(mirror, "robot-1.Offset", -2) &&
                      HasNumeric(mirror, "robot-1.Scaled", 5.0) &&
                      HasNumeric(mirror, "robot-1.Speed", 1.5) &&
                      HasBool(mirror, "robot-1.Running", true) &&
                      HasBool(mirror, "robot-1.Ready", true) &&
                      HasBool(mirror, "robot-1.Flag", true),
                ObservationTimeout),
            "not all mapped points were observed in the mirror");

        Assert.True(mirror.TryGetSample("robot-1.Counter", out var counter));
        Assert.Equal(SignalQuality.Good, counter!.Quality);
        Assert.Equal(SignalSource.Observed, counter.Source);
        Assert.Equal(SignalOrigin.Controller, counter.Origin);

        var definitions = mirror.Definitions().ToDictionary(definition => definition.SignalId, StringComparer.Ordinal);
        Assert.Equal(SignalDataType.UInt, definitions["robot-1.Counter"].DataType);
        Assert.Equal(SignalDataType.Int, definitions["robot-1.Offset"].DataType);
        Assert.Equal(SignalDataType.Bool, definitions["robot-1.Running"].DataType);
        Assert.Equal(SignalDataType.Float, definitions["robot-1.Speed"].DataType);

        var status = connector.GetStatus();
        Assert.True(status.PollCycles >= 1);
        Assert.True(status.UpdatesAccepted >= 7);
        Assert.True(status.AveragePollLatencyMs is >= 0);
        _output.WriteLine(
            $"Poll cycles={status.PollCycles}, updatesAccepted={status.UpdatesAccepted}, " +
            $"lastCycleLatencyMs={status.LastPollLatencyMs:F2}, averageCycleLatencyMs={status.AveragePollLatencyMs:F2}.");

        await connector.StopAsync(CancellationToken.None);
        Assert.Equal(ModbusConnectorState.Disabled, connector.State);
    }

    [Fact]
    public async Task Illegal_address_is_reported_per_point_without_stopping_the_connector()
    {
        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        fixture.SetHoldingRegister(0, 7);

        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(fixture);
        options.Points.Add(Point("robot-1.Legal", "holding-register", 0));
        options.Points.Add(Point("robot-1.Illegal", "holding-register", 5000));

        await using var connector = CreateConnector(options, mirror);
        await connector.StartAsync();

        Assert.True(await WaitUntilAsync(() => connector.GetStatus().IllegalAddresses >= 1, ObservationTimeout),
            "the illegal address was never reported");
        Assert.True(await WaitUntilAsync(() => HasNumeric(mirror, "robot-1.Legal", 7), ObservationTimeout),
            "the connector stopped reading valid points after an illegal address");
        Assert.Equal(ModbusConnectorState.Connected, connector.State);

        var illegal = connector.GetStatus().Points.Single(point => point.SignalId == "robot-1.Illegal");
        Assert.True(illegal.ReadErrors >= 1);
        Assert.Equal("illegal-data-address", illegal.LastError);

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Timeout_is_recorded_and_the_connector_keeps_retrying()
    {
        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        fixture.Respond = false;

        var options = ConnectorOptions(fixture);
        options.RequestTimeoutMilliseconds = 500;
        options.Points.Add(Point("robot-1.Speed", "holding-register", 0));

        await using var connector = CreateConnector(options, new SignalMirrorStore());
        await connector.StartAsync();

        Assert.True(await WaitUntilAsync(() => connector.GetStatus().Timeouts >= 1, ObservationTimeout),
            "the request timeout was never recorded");
        Assert.NotEqual(ModbusConnectorState.Disabled, connector.State);
        Assert.True(connector.GetStatus().ReconnectCount >= 1);

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Reconnects_after_the_plc_goes_away_and_returns()
    {
        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        fixture.SetHoldingRegister(0, 11);

        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(fixture);
        options.Points.Add(Point("robot-1.Counter", "holding-register", 0));

        await using var connector = CreateConnector(options, mirror);
        await connector.StartAsync();

        Assert.True(await WaitUntilAsync(() => HasNumeric(mirror, "robot-1.Counter", 11), ConnectTimeout),
            "the initial value was not observed");

        await fixture.StopAsync();
        Assert.True(await WaitUntilAsync(
                () => connector.State == ModbusConnectorState.Degraded && connector.ReconnectCount >= 1,
                ConnectTimeout),
            $"the connector did not report the PLC outage: state={connector.State} reconnects={connector.ReconnectCount}");

        await fixture.StartOnSamePortAsync();
        fixture.SetHoldingRegister(0, 22);
        Assert.True(await WaitUntilAsync(
                () => connector.State == ModbusConnectorState.Connected && HasNumeric(mirror, "robot-1.Counter", 22),
                ConnectTimeout),
            $"the connector did not resume after the PLC returned: state={connector.State} reconnects={connector.ReconnectCount}");

        _output.WriteLine($"Reconnect count after outage: {connector.ReconnectCount}.");
        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Write_policy_accepts_only_writable_allow_listed_points()
    {
        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        fixture.SetHoldingRegister(30, 0b1010_1000);

        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(fixture, allowWrites: true);
        options.WriteAllowList = ["robot-1.Setpoint", "robot-1.Run", "robot-1.FlagBit"];
        options.Points.Add(Point("robot-1.Setpoint", "holding-register", 40, direction: "read-write"));
        options.Points.Add(Point("robot-1.Other", "holding-register", 41, direction: "read-write"));
        options.Points.Add(Point("robot-1.Speed", "holding-register", 0));
        options.Points.Add(Point("robot-1.Run", "coil", 0, "bool", 1, byteOrder: null, wordOrder: null, direction: "read-write"));
        options.Points.Add(Point("robot-1.FlagBit", "holding-register", 30, "bool", 16, bitIndex: 3, direction: "read-write"));

        await using var connector = CreateConnector(options, mirror);
        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == ModbusConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        var notWritable = await connector.WriteAsync("robot-1.Speed", 5, CancellationToken.None);
        Assert.False(notWritable.Accepted);
        Assert.Equal("not-writable-signal", notWritable.RejectionReason);

        var notListed = await connector.WriteAsync("robot-1.Other", 5, CancellationToken.None);
        Assert.False(notListed.Accepted);
        Assert.Equal("not-allow-listed", notListed.RejectionReason);

        var accepted = await connector.WriteAsync("robot-1.Setpoint", 1234, CancellationToken.None);
        Assert.True(accepted.Accepted, accepted.RejectionReason);
        Assert.Equal(1234, fixture.GetHoldingRegister(40));
        Assert.True(await WaitUntilAsync(
                () => mirror.TryGetSample("robot-1.Setpoint", out var sample) &&
                      sample!.Source == SignalSource.Commanded && sample.Value is long written && written == 1234,
                ObservationTimeout),
            "the accepted write was not mirrored as commanded");

        var coil = await connector.WriteAsync("robot-1.Run", true, CancellationToken.None);
        Assert.True(coil.Accepted, coil.RejectionReason);
        Assert.True(fixture.GetCoil(0));

        // Boolean register writes preserve the other bits of the shared register.
        var clearBit = await connector.WriteAsync("robot-1.FlagBit", false, CancellationToken.None);
        Assert.True(clearBit.Accepted, clearBit.RejectionReason);
        Assert.Equal(0b1010_0000, fixture.GetHoldingRegister(30));

        var setBit = await connector.WriteAsync("robot-1.FlagBit", true, CancellationToken.None);
        Assert.True(setBit.Accepted, setBit.RejectionReason);
        Assert.Equal(0b1010_1000, fixture.GetHoldingRegister(30));

        var status = connector.GetStatus();
        Assert.Equal(6, status.WriteAttempts);
        Assert.Equal(4, status.WritesAccepted);
        Assert.Equal(2, status.WritesRejected);

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Writes_fail_visibly_when_the_connector_is_no_longer_connected()
    {
        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        var options = ConnectorOptions(fixture, allowWrites: true);
        options.WriteAllowList = ["robot-1.Setpoint"];
        options.Points.Add(Point("robot-1.Setpoint", "holding-register", 40, direction: "read-write"));

        await using var connector = CreateConnector(options, new SignalMirrorStore());
        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == ModbusConnectorState.Connected, ConnectTimeout));

        await connector.StopAsync(CancellationToken.None);
        Assert.Equal(ModbusConnectorState.Disabled, connector.State);

        var write = await connector.WriteAsync("robot-1.Setpoint", 5, CancellationToken.None);
        Assert.False(write.Accepted);
        Assert.Equal("not-connected", write.RejectionReason);
    }
}
