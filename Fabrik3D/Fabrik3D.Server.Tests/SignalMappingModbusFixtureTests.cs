using System.Diagnostics;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Mapping;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.Modbus.Fixture;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Integration evidence for S37: a validated mapping document is projected into Modbus options and
/// applied to a real connector talking to the in-process Modbus TCP fixture. It proves
/// external→internal reads (holding registers → mirror) and internal→external writes (mirror
/// command → register bit) through the mapping, without any hand-written point table.
/// </summary>
public class SignalMappingModbusFixtureTests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private readonly ITestOutputHelper _output;

    public SignalMappingModbusFixtureTests(ITestOutputHelper output) => _output = output;

    private static async Task<bool> WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
    {
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < timeout)
        {
            if (condition()) return true;
            await Task.Delay(25);
        }
        return condition();
    }

    private static void SetFloat32BigEndianHighWordFirst(ModbusTcpFixtureServer fixture, int address, float value)
    {
        var bits = BitConverter.SingleToInt32Bits(value);
        fixture.SetHoldingRegister(address, (ushort)(bits >> 16));
        fixture.SetHoldingRegister(address + 1, (ushort)(bits & 0xFFFF));
    }

    [Fact]
    public async Task Mapping_document_drives_reads_and_writes_against_the_fixture()
    {
        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        _output.WriteLine($"Modbus fixture: endpoint={fixture.Endpoint}");
        SetFloat32BigEndianHighWordFirst(fixture, 10, 12.5f);
        fixture.SetHoldingRegister(20, 0);

        var baseOptions = new ModbusOptions
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
            AddressConvention = "zero-based",
            AllowWrites = true,
            WriteAllowList = ["cnc-1.CycleStart"],
        };

        // The mapping document is the only source of Modbus points.
        var options = SignalMappingProjection.BuildModbusOptions(baseOptions, SignalMappingTestData.SampleDocument());
        Assert.Equal(2, options.Points.Count);

        var mirror = new SignalMirrorStore();
        await using var connector = new ModbusConnector(Options.Create(options), mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        await connector.StartAsync();

        Assert.True(await WaitUntilAsync(() => connector.State == ModbusConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        // External -> internal: the feed rate register is decoded into the mirror as observed telemetry.
        Assert.True(await WaitUntilAsync(
                () => mirror.TryGetSample("cnc-1.FeedRate", out var sample) && sample!.Value is not null &&
                      Math.Abs(Convert.ToDouble(sample.Value) - 12.5) < 0.0001,
                ObservationTimeout),
            "the mapped feed rate was not observed in the mirror");

        Assert.True(mirror.TryGetSample("cnc-1.FeedRate", out var observed));
        Assert.Equal(SignalQuality.Good, observed!.Quality);
        Assert.Equal(SignalSource.Observed, observed.Source);
        Assert.Equal(SignalOrigin.Controller, observed.Origin);

        // Internal -> external: the command bit is written through the mapped holding register.
        var write = await connector.WriteAsync("cnc-1.CycleStart", true, CancellationToken.None);
        Assert.True(write.Accepted, write.RejectionReason);
        Assert.True(await WaitUntilAsync(() => (fixture.GetHoldingRegister(20) & 0b1000) != 0, ObservationTimeout),
            "the mapped cycle-start bit was not written to the fixture");

        // A signal that is not on the write allow-list stays rejected, even though the mapping exists.
        var rejected = await connector.WriteAsync("cnc-1.FeedRate", 1.0, CancellationToken.None);
        Assert.False(rejected.Accepted);

        await connector.StopAsync(CancellationToken.None);
        Assert.Equal(ModbusConnectorState.Disabled, connector.State);
    }
}
