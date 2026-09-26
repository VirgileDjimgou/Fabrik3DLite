using System.Diagnostics;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Mapping;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests.Showcase;

/// <summary>
/// S46 CODESYS / SoftPLC showcase evidence. The committed showcase I/O map is validated against the
/// real mapping rules, projected into the real Modbus connector and exercised by an automated
/// substitute fixture controller against the real in-process Modbus TCP fixture. The closed loop is
/// controller output → Fabrik3D virtual actuator → virtual sensor → controller input, asserted at
/// every documented sequence step. Authority acquisition, release and controller loss follow the
/// S36 semantics.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class ReferenceCellShowcaseTests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private readonly OrchestrationFixture _fx;
    private readonly ITestOutputHelper _output;

    public ReferenceCellShowcaseTests(OrchestrationFixture fx, ITestOutputHelper output)
    {
        _fx = fx;
        _output = output;
    }

    private static Task<bool> WaitForMirrorBoolAsync(ShowcaseHarness harness, string signalId, bool expected, TimeSpan timeout)
        => harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(signalId, out var sample) &&
                  sample!.Value is bool value && value == expected,
            timeout);

    private static Task<bool> WaitForMirrorNumberAsync(ShowcaseHarness harness, string signalId, double expected, TimeSpan timeout)
        => harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(signalId, out var sample) &&
                  sample!.Value is not null && sample.Value is not bool &&
                  Math.Abs(Convert.ToDouble(sample.Value) - expected) < 0.0001,
            timeout);

    [Fact]
    public void Committed_showcase_io_map_is_a_valid_versioned_mapping_document()
    {
        var path = ShowcaseHarness.LocateIoMap();
        Assert.NotNull(path);
        _output.WriteLine($"Showcase I/O map: {path}");

        var document = ShowcaseHarness.LoadIoMap();
        Assert.Equal("1.0", document.SchemaVersion);
        Assert.Equal("codesys-softplc-showcase-io-map", document.Id);

        var validation = SignalMappingValidator.Validate(document, ShowcaseSignalMap.Catalog());
        Assert.True(validation.Valid, string.Join("; ", validation.Diagnostics.Select(d => $"{d.Severity}:{d.Code}:{d.Message}")));
        Assert.Empty(validation.Conflicts);

        // Every declared read signal maps to an external input and every declared write signal to an
        // external output; no direction is inverted and no unknown signal slipped in.
        Assert.Equal(ShowcaseSignalMap.ReadSignals.OrderBy(id => id, StringComparer.Ordinal),
            document.Entries.Where(e => e.Direction == "read").Select(e => e.InternalSignalId).OrderBy(id => id, StringComparer.Ordinal));
        Assert.Equal(ShowcaseSignalMap.WriteSignals.OrderBy(id => id, StringComparer.Ordinal),
            document.Entries.Where(e => e.Direction == "write").Select(e => e.InternalSignalId).OrderBy(id => id, StringComparer.Ordinal));

        // Register points must state their byte order; the validator rejects ambiguous endianness.
        foreach (var entry in document.Entries)
        {
            Assert.Equal("holding-register", entry.Target.Area);
            Assert.Equal("big-endian", entry.Target.ByteOrder);
            Assert.NotNull(entry.Target.AddressConvention);
        }

        var options = SignalMappingProjection.BuildModbusOptions(new ModbusOptions(), document);
        Assert.Equal(14, options.Points.Count);
        Assert.Equal(5, options.Points.Count(p => ModbusMapping.EffectiveDirection(p) == ModbusPointDirection.Read));
        Assert.Equal(9, options.Points.Count(p => ModbusMapping.EffectiveDirection(p) == ModbusPointDirection.Write));
    }

    [Fact]
    public async Task Fixture_controller_drives_the_showcase_sequence_closed_loop()
    {
        var scope = $"showcase-loop-{Guid.NewGuid():N}";
        await using var harness = await ShowcaseHarness.StartAsync(ShowcaseHarness.LoadIoMap(), _fx.AuthorityService, scope);
        Assert.True(await harness.WaitForConnectedAsync(ConnectTimeout),
            $"connector did not connect: state={harness.Connector.State} lastError={harness.Connector.LastError}");

        var authority = await _fx.AuthorityService.AcquireAsync(scope, new AcquireControlAuthorityRequest
        {
            Mode = "ExternalController",
            OwnerId = ShowcaseSignalMap.ControllerOwnerId,
            OwnerKind = "connector",
            LeaseSeconds = 120,
        }, "corr-showcase-loop-acquire");
        Assert.Equal("held", authority.State);

        // ── Step 1: permissives ────────────────────────────────────────────────────────────────
        var idle = await harness.Cell.TickAsync();
        Assert.True(idle.Authorized, idle.RejectionCode);
        Assert.Equal("ready", idle.Phase);
        Assert.True(idle.Ready);
        Assert.False(idle.Running);
        Assert.Empty(idle.RejectedWrites);
        Assert.True(await harness.WaitUntilAsync(() => harness.Plc.Ready, ObservationTimeout));
        _output.WriteLine("Step 1 permissives: cell Ready=true published to the controller.");

        // ── Step 2: start is refused until a pallet is present ────────────────────────────────
        harness.Plc.SetStart(true);
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.Start, true, ObservationTimeout));
        var waiting = await harness.Cell.TickAsync();
        Assert.Equal("ready", waiting.Phase);
        Assert.False(waiting.Running);
        _output.WriteLine("Step 2 start requested without a pallet: still Ready, no motion.");

        // ── Step 3: pallet detection starts the robot cycle ───────────────────────────────────
        harness.Plc.SetPalletPresent(true);
        harness.Plc.SetCycleTarget(100);
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.PalletPresent, true, ObservationTimeout));
        Assert.True(await WaitForMirrorNumberAsync(harness, ShowcaseSignalMap.CycleTarget, 100, ObservationTimeout));

        var loopWatch = Stopwatch.StartNew();
        var robotStart = await harness.Cell.TickAsync();
        Assert.Equal("robot", robotStart.Phase);
        Assert.True(robotStart.Running);
        Assert.True(robotStart.ActuatorPosition > 0);
        Assert.Equal(robotStart.ActuatorPosition, robotStart.SensorPosition);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Plc.ActuatorPosition == robotStart.ActuatorPosition && harness.Plc.SensorPosition == robotStart.ActuatorPosition,
            ObservationTimeout));
        _output.WriteLine($"Step 3 pallet detected: robot running, actuator/sensor={robotStart.ActuatorPosition}.");

        // ── Step 4: robot cycle completes and hands over to the CNC ───────────────────────────
        var robotDone = robotStart;
        var previousPosition = robotStart.ActuatorPosition;
        for (var guard = 0; guard < 10 && !robotDone.RobotCycleComplete; guard++)
        {
            robotDone = await harness.Cell.TickAsync();
            Assert.True(robotDone.Authorized, robotDone.RejectionCode);
            Assert.True(robotDone.Running);
            Assert.True(robotDone.ActuatorPosition >= previousPosition, "the robot transfer axis must not move backwards");
            Assert.Equal(robotDone.ActuatorPosition, robotDone.SensorPosition);
            previousPosition = robotDone.ActuatorPosition;
        }

        Assert.True(robotDone.RobotCycleComplete);
        Assert.Equal(100, robotDone.ActuatorPosition);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Plc.RobotCycleComplete && harness.Plc.ActuatorPosition == 100 && harness.Plc.SensorPosition == 100,
            ObservationTimeout));
        _output.WriteLine($"Step 4 robot cycle complete: actuator/sensor=100 mirrored to the controller.");

        // ── Step 5: CNC cycle completes the pallet ────────────────────────────────────────────
        var cncDone = robotDone;
        for (var guard = 0; guard < 10 && !cncDone.CncCycleComplete; guard++)
        {
            cncDone = await harness.Cell.TickAsync();
            Assert.True(cncDone.Authorized, cncDone.RejectionCode);
            Assert.True(cncDone.Running || cncDone.CncCycleComplete);
        }

        Assert.True(cncDone.CncCycleComplete);
        Assert.True(cncDone.CycleComplete);
        Assert.Equal("complete", cncDone.Phase);
        Assert.False(cncDone.Running);
        Assert.Equal(1, cncDone.PartsCompleted);
        loopWatch.Stop();
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Plc.CncCycleComplete && harness.Plc.CycleComplete && harness.Plc.PartsCompleted == 1,
            ObservationTimeout));
        _output.WriteLine(
            $"Step 5 CNC cycle complete: parts={harness.Plc.PartsCompleted}; closed-loop latency " +
            $"(setpoint -> controller sensor/count feedback) {loopWatch.Elapsed.TotalMilliseconds:F2} ms.");

        // ── Step 6: latched stop during a new cycle quiesces and faults ────────────────────────
        harness.Plc.SetReset(true);
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.Reset, true, ObservationTimeout));
        var afterReset = await harness.Cell.TickAsync();
        Assert.Equal("idle", afterReset.Phase);
        Assert.False(afterReset.CycleComplete);
        harness.Plc.SetReset(false);
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.Reset, false, ObservationTimeout));

        var readyAgain = await harness.Cell.TickAsync();
        Assert.Equal("ready", readyAgain.Phase);
        var secondRobot = await harness.Cell.TickAsync();
        Assert.Equal("robot", secondRobot.Phase);

        harness.Plc.SetStop(true);
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.Stop, true, ObservationTimeout));
        var faulted = await harness.Cell.TickAsync();
        Assert.Equal("fault", faulted.Phase);
        Assert.True(faulted.Fault);
        Assert.False(faulted.Running);
        Assert.Equal(secondRobot.ActuatorPosition, faulted.ActuatorPosition);
        Assert.True(await harness.WaitUntilAsync(() => harness.Plc.Fault && !harness.Plc.Running, ObservationTimeout));
        _output.WriteLine($"Step 6 stop during cycle: fault latched at actuator hold {faulted.ActuatorPosition}, no motion.");

        // ── Step 7: reset clears the fault ────────────────────────────────────────────────────
        harness.Plc.SetStop(false);
        harness.Plc.SetReset(true);
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.Stop, false, ObservationTimeout));
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.Reset, true, ObservationTimeout));
        var cleared = await harness.Cell.TickAsync();
        Assert.Equal("idle", cleared.Phase);
        Assert.False(cleared.Fault);
        _output.WriteLine("Step 7 reset: fault cleared, cell idle and ready for the next pallet.");

        var status = harness.Connector.GetStatus();
        Assert.Equal(0, status.WritesRejected);
        _output.WriteLine($"Connector: {status.PollCycles} poll cycles, {status.WritesAccepted} accepted writes, {status.WritesRejected} rejected.");
    }

    [Fact]
    public async Task Showcase_authority_acquisition_release_and_controller_loss_follow_s36()
    {
        var scope = $"showcase-authority-{Guid.NewGuid():N}";
        await using var harness = await ShowcaseHarness.StartAsync(ShowcaseHarness.LoadIoMap(), _fx.AuthorityService, scope);
        Assert.True(await harness.WaitForConnectedAsync(ConnectTimeout));

        var acquired = await _fx.AuthorityService.AcquireAsync(scope, new AcquireControlAuthorityRequest
        {
            Mode = "ExternalController",
            OwnerId = ShowcaseSignalMap.ControllerOwnerId,
            OwnerKind = "connector",
            LeaseSeconds = 120,
        }, "corr-showcase-authority");
        Assert.Equal("held", acquired.State);

        var authorized = await harness.Cell.TickAsync();
        Assert.True(authorized.Authorized, authorized.RejectionCode);

        // Exclusivity: local simulation may not drive while the external controller holds authority.
        var deniedLocal = await _fx.AuthorityService.AuthorizeCommandAsync(scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.False(deniedLocal.Allowed);
        Assert.Equal(ControlAuthorityCodes.Conflict, deniedLocal.Code);

        // Loss of the controller: the connector degrades and the lease expires into the documented
        // degraded state. No authority silently takes over.
        await harness.Fixture.StopAsync();
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Connector.State is ModbusConnectorState.Degraded or ModbusConnectorState.Error,
            ConnectTimeout));
        var degradedCount = await _fx.AuthorityService.ExpireLeasesAsync(DateTime.UtcNow.AddMinutes(5));
        Assert.True(degradedCount >= 1);
        var degraded = await _fx.AuthorityService.GetAsync(scope);
        Assert.Equal("degraded", degraded.State);
        Assert.Equal("external-controller", degraded.Mode);

        // A tick after the loss is denied with no actuator effect.
        var before = harness.Cell.ActuatorPosition;
        var denied = await harness.Cell.TickAsync();
        Assert.False(denied.Authorized);
        Assert.Equal(ControlAuthorityCodes.Lost, denied.RejectionCode);
        Assert.Equal(before, harness.Cell.ActuatorPosition);

        // Explicit release by the owner returns the scope to implicit local simulation.
        var released = await _fx.AuthorityService.ReleaseAsync(
            scope, new ReleaseControlAuthorityRequest { OwnerId = ShowcaseSignalMap.ControllerOwnerId }, "corr-showcase-release");
        Assert.Equal("available", released.State);
        var localAfterRelease = await _fx.AuthorityService.AuthorizeCommandAsync(scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.True(localAfterRelease.Allowed);

        var audit = await _fx.AuthorityService.GetAuditAsync(scope, 50);
        Assert.Contains(audit, e => e.EventType == "authority_acquired");
        Assert.Contains(audit, e => e.EventType == "authority_degraded");
        _output.WriteLine("Authority audit: " + string.Join(
            " | ", audit.Take(6).Select(e => $"{e.EventType}:{e.Mode}/{e.OwnerId ?? "-"}")));
    }

    [Fact]
    public async Task Showcase_writes_fail_closed_without_enablement_and_allow_list()
    {
        var ioMap = ShowcaseHarness.LoadIoMap();
        var mirror = new SignalMirrorStore();

        // Connector disabled entirely: every write is refused before any network traffic.
        var disabled = new ModbusConnector(
            Options.Create(SignalMappingProjection.BuildModbusOptions(new ModbusOptions { Enabled = false }, ioMap)),
            mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        Assert.False(disabled.IsWriteAllowed(ShowcaseSignalMap.Ready));
        var disabledWrite = await disabled.WriteAsync(ShowcaseSignalMap.Ready, true, CancellationToken.None);
        Assert.False(disabledWrite.Accepted);
        Assert.Equal("connector-disabled", disabledWrite.RejectionReason);

        // Enabled but AllowWrites off: still refused.
        var writesOff = new ModbusConnector(
            Options.Create(SignalMappingProjection.BuildModbusOptions(
                new ModbusOptions { Enabled = true, AllowWrites = false }, ioMap)),
            mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        Assert.False(writesOff.IsWriteAllowed(ShowcaseSignalMap.Ready));

        // Writes enabled but the signal is not on the exact allow-list: refused.
        var notAllowListed = new ModbusConnector(
            Options.Create(SignalMappingProjection.BuildModbusOptions(
                new ModbusOptions { Enabled = true, AllowWrites = true, WriteAllowList = [ShowcaseSignalMap.PartsCompleted] }, ioMap)),
            mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        Assert.False(notAllowListed.IsWriteAllowed(ShowcaseSignalMap.Ready));
        var notListedWrite = await notAllowListed.WriteAsync(ShowcaseSignalMap.Ready, true, CancellationToken.None);
        Assert.False(notListedWrite.Accepted);
        Assert.Equal("not-allow-listed", notListedWrite.RejectionReason);

        // A read-only input signal can never be written, even if it is allow-listed.
        var readSignal = new ModbusConnector(
            Options.Create(SignalMappingProjection.BuildModbusOptions(
                new ModbusOptions { Enabled = true, AllowWrites = true, WriteAllowList = [ShowcaseSignalMap.Start] }, ioMap)),
            mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        Assert.False(readSignal.IsWriteAllowed(ShowcaseSignalMap.Start));

        // The showcase configuration is write-enabled only for the explicit output allow-list.
        var showcase = SignalMappingProjection.BuildModbusOptions(
            new ModbusOptions
            {
                Enabled = true,
                AllowWrites = true,
                WriteAllowList = [.. ShowcaseSignalMap.WriteSignals],
            },
            ioMap);
        Assert.All(ShowcaseSignalMap.WriteSignals, signalId =>
            Assert.True(ModbusMapping.FindPoint(showcase, signalId) is { } point &&
                        ModbusCodec.DirectionAllowsWrite(ModbusMapping.EffectiveDirection(point))));
    }
}
