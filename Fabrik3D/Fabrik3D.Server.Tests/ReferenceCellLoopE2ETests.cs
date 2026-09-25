using System.Diagnostics;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.Modbus.Fixture;
using Fabrik3D.Server.Simulation;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S36 external-controller end-to-end evidence. A real in-process Modbus TCP fixture (the S35
/// deterministic fixture controller, not a proprietary PLC) drives the reference cell through the
/// real Modbus connector: fixture output → observed signal → authority-gated virtual actuator →
/// virtual sensor → connector write back to the fixture input, closed loop. It also proves
/// exclusivity, loss-of-controller degraded behaviour and that denied commands have no actuator
/// effect.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class ReferenceCellLoopE2ETests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private readonly OrchestrationFixture _fx;
    private readonly ITestOutputHelper _output;

    public ReferenceCellLoopE2ETests(OrchestrationFixture fx, ITestOutputHelper output)
    {
        _fx = fx;
        _output = output;
    }

    private static ModbusOptions ConnectorOptions(ModbusTcpFixtureServer fixture)
    {
        var options = new ModbusOptions
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
            AllowWrites = true,
            AddressConvention = "zero-based",
        };
        options.WriteAllowList = [ReferenceCellLoop.SensorSignalId];
        options.Points.Add(new ModbusPointMapping
        {
            SignalId = ReferenceCellLoop.CommandSignalId,
            Area = "holding-register",
            Address = 0,
            DataType = "uint",
            Width = 16,
            ByteOrder = "big-endian",
            Direction = "read",
        });
        options.Points.Add(new ModbusPointMapping
        {
            SignalId = ReferenceCellLoop.SensorSignalId,
            Area = "holding-register",
            Address = 1,
            DataType = "uint",
            Width = 16,
            ByteOrder = "big-endian",
            // Write-only: the controller input is written by the loop, not polled back, so the
            // authority-tagged simulated sensor sample is not overwritten by a poll.
            Direction = "write",
        });
        return options;
    }

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

    [Fact]
    public async Task External_fixture_controller_drives_the_reference_cell_closed_loop_with_exclusive_authority()
    {
        var scope = $"cell-e2e-{Guid.NewGuid():N}";

        await using var fixture = await ModbusTcpFixtureServer.StartAsync();
        _output.WriteLine($"E2E fixture controller endpoint: {fixture.Endpoint} (scope {scope})");

        fixture.SetHoldingRegister(0, 100);

        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(fixture);
        await using var connector = new ModbusConnector(
            Options.Create(options), mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == ModbusConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");
        Assert.True(await WaitUntilAsync(
                () => HasNumeric(mirror, ReferenceCellLoop.CommandSignalId, 100), ObservationTimeout),
            "the fixture command was not observed in the signal mirror");

        var authority = await _fx.AuthorityService.AcquireAsync(scope, new AcquireControlAuthorityRequest
        {
            Mode = "ExternalController",
            OwnerId = "modbus",
            OwnerKind = "connector",
            LeaseSeconds = 120,
        }, "corr-e2e-acquire");
        Assert.Equal("held", authority.State);

        var loop = new ReferenceCellLoop(_fx.AuthorityService, mirror, connector, TimeProvider.System, scope, "modbus");

        var stepWatch = Stopwatch.StartNew();
        var first = await loop.StepAsync();
        stepWatch.Stop();
        _output.WriteLine($"Closed-loop step latency: {stepWatch.Elapsed.TotalMilliseconds:F2} ms");

        Assert.True(first.Authorized, first.RejectionCode);
        Assert.True(first.SensorWritten, first.RejectionCode);
        Assert.Equal(100, first.SensorValue);
        Assert.Equal(100, loop.Position);
        Assert.Equal(100, fixture.GetHoldingRegister(1));
        Assert.True(await WaitUntilAsync(
                () => mirror.TryGetSample(ReferenceCellLoop.SensorSignalId, out var sample) &&
                      sample!.Source == SignalSource.Simulated &&
                      sample.AuthorityMode == "external-controller",
                ObservationTimeout),
            "the virtual sensor was not mirrored as a simulated authority-tagged sample");

        // Exclusivity: local simulation may not drive while the external controller holds authority.
        var deniedLocal = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.False(deniedLocal.Allowed);
        Assert.Equal(ControlAuthorityCodes.Conflict, deniedLocal.Code);

        // The denied request has no actuator effect.
        var localStep = await loop.StepAsync(ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.False(localStep.Authorized);
        Assert.Null(localStep.SensorValue);
        Assert.Equal(100, loop.Position);

        // The external controller moves the actuator again; the new sensor value returns to the fixture input.
        fixture.SetHoldingRegister(0, 40);
        Assert.True(await WaitUntilAsync(
                () => HasNumeric(mirror, ReferenceCellLoop.CommandSignalId, 40), ObservationTimeout),
            "the updated fixture command was not observed");
        var second = await loop.StepAsync();
        Assert.True(second.Authorized, second.RejectionCode);
        Assert.Equal(40, second.SensorValue);
        Assert.Equal(40, fixture.GetHoldingRegister(1));

        _output.WriteLine(
            $"Observed closed loop sequence: fixture 100 → actuator 100 → sensor 100; fixture 40 → actuator 40 → sensor 40. " +
            $"Connector poll cycles={connector.GetStatus().PollCycles}.");

        // Loss of the controller: the connector degrades and the lease expires into the documented
        // degraded state. No authority silently takes over and the actuator does not move.
        await fixture.StopAsync();
        Assert.True(await WaitUntilAsync(
                () => connector.State is ModbusConnectorState.Degraded or ModbusConnectorState.Error,
                ConnectTimeout),
            $"connector did not report the controller loss: state={connector.State}");

        var degradedCount = await _fx.AuthorityService.ExpireLeasesAsync(DateTime.UtcNow.AddMinutes(5));
        Assert.True(degradedCount >= 1);

        var degradedState = await _fx.AuthorityService.GetAsync(scope);
        Assert.Equal("degraded", degradedState.State);
        Assert.Equal("external-controller", degradedState.Mode);

        var afterLoss = await loop.StepAsync();
        Assert.False(afterLoss.Authorized);
        Assert.Equal(ControlAuthorityCodes.Lost, afterLoss.RejectionCode);
        Assert.Equal(40, loop.Position);

        var localAfterLoss = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.False(localAfterLoss.Allowed);
        Assert.Equal(ControlAuthorityCodes.Lost, localAfterLoss.Code);

        var audit = await _fx.AuthorityService.GetAuditAsync(scope, 50);
        Assert.Contains(audit, e => e.EventType == "authority_acquired");
        Assert.Contains(audit, e => e.EventType == "authority_quiesce");
        Assert.Contains(audit, e => e.EventType == "authority_degraded");
        _output.WriteLine("Audit: " + string.Join(
            " | ",
            audit.Take(6).Select(e => $"{e.EventType}:{e.Mode}/{e.OwnerId ?? "-"}")));

        // Explicit release returns the scope to implicit local simulation.
        var released = await _fx.AuthorityService.ReleaseAsync(
            scope, new ReleaseControlAuthorityRequest { OwnerId = "modbus" }, "corr-e2e-release");
        Assert.Equal("available", released.State);
        var localAfterRelease = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.True(localAfterRelease.Allowed);

        await connector.StopAsync(CancellationToken.None);
    }
}
