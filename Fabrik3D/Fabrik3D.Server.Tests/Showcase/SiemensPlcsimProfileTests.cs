using System.Diagnostics;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Mapping;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Infrastructure.Signals;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Opc.Ua;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests.Showcase;

/// <summary>
/// S47 Siemens / PLCSIM interoperability profile evidence. The committed Siemens OPC UA I/O map is
/// validated against the real mapping rules and exercised end to end by an automated substitute:
/// the real in-process OPC UA fixture (a real server transport) driven through the real
/// <see cref="OpcUaConnector"/>, the shared deterministic cell state machine and the S36 authority
/// rules. It covers mapping, handshake, the full machine-state sequence, failure handling
/// (bad quality, disconnect, stop mid-cycle) and the negative cases (wrong tag, fail-closed writes,
/// certificate mismatch). No TIA Portal, PLCSIM or license is required, and no proprietary artifact
/// is committed.
/// </summary>
public class SiemensPlcsimProfileTests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private readonly ITestOutputHelper _output;

    public SiemensPlcsimProfileTests(ITestOutputHelper output) => _output = output;

    private static Task<bool> WaitForMirrorBoolAsync(SiemensPlcHarness harness, string signalId, bool expected, TimeSpan timeout)
        => harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(signalId, out var sample) &&
                  sample!.Value is bool value && value == expected,
            timeout);

    private static Task<bool> WaitForMirrorNumberAsync(SiemensPlcHarness harness, string signalId, double expected, TimeSpan timeout)
        => harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(signalId, out var sample) &&
                  sample!.Value is not null && sample.Value is not bool &&
                  Math.Abs(Convert.ToDouble(sample.Value) - expected) < 0.0001,
            timeout);

    [Fact]
    public void Committed_siemens_profile_io_map_is_a_valid_versioned_mapping_document()
    {
        var path = SiemensPlcHarness.LocateIoMap();
        Assert.NotNull(path);
        _output.WriteLine($"Siemens profile I/O map: {path}");

        var document = SiemensPlcHarness.LoadIoMap();
        Assert.Equal("1.0", document.SchemaVersion);
        Assert.Equal("siemens-plcsim-profile-io-map", document.Id);
        Assert.Equal(14, document.Entries.Count);

        var validation = SignalMappingValidator.Validate(document, ShowcaseSignalMap.Catalog());
        Assert.True(validation.Valid, string.Join("; ", validation.Diagnostics.Select(d => $"{d.Severity}:{d.Code}:{d.Message}")));
        Assert.Empty(validation.Conflicts);

        // The same internal signal vocabulary as the S46 showcase: read = controller output consumed
        // by Fabrik3D, write = Fabrik3D output consumed by the controller. No direction is inverted.
        Assert.Equal(ShowcaseSignalMap.ReadSignals.OrderBy(id => id, StringComparer.Ordinal),
            document.Entries.Where(e => e.Direction == "read").Select(e => e.InternalSignalId).OrderBy(id => id, StringComparer.Ordinal));
        Assert.Equal(ShowcaseSignalMap.WriteSignals.OrderBy(id => id, StringComparer.Ordinal),
            document.Entries.Where(e => e.Direction == "write").Select(e => e.InternalSignalId).OrderBy(id => id, StringComparer.Ordinal));

        // Every point is a Siemens-style OPC UA node id in the TIA Portal namespace and parses as a
        // real node id. A wrong/ambiguous node id is rejected before any connector is started.
        foreach (var entry in document.Entries)
        {
            Assert.Equal("opcua", entry.Protocol);
            var nodeId = entry.Target.NodeId;
            Assert.False(string.IsNullOrWhiteSpace(nodeId));
            Assert.True(SiemensProfileNodeIds.IsSiemensStyle(nodeId!), $"'{nodeId}' is not a Siemens ns=3 OPC UA node id.");
            Assert.True(NodeId.TryParse(nodeId, out _), $"'{nodeId}' is not a parseable OPC UA node id.");
        }

        var options = SignalMappingProjection.BuildOpcUaOptions(new OpcUaOptions(), document);
        Assert.Equal(14, options.NodeMap.Count);
        Assert.Equal(5, options.NodeMap.Count(entry => !entry.Writable));
        Assert.Equal(9, options.NodeMap.Count(entry => entry.Writable));
    }

    [Fact]
    public async Task OpcUa_fixture_plc_drives_the_siemens_profile_sequence_closed_loop()
    {
        var scope = $"siemens-loop-{Guid.NewGuid():N}";
        var authority = new SiemensProfileAuthority(scope);
        await using var harness = await SiemensPlcHarness.StartAsync(SiemensPlcHarness.LoadIoMap(), authority, scope);
        Assert.True(await harness.WaitForConnectedAsync(ConnectTimeout),
            $"connector did not connect: state={harness.Connector.State} lastError={harness.Connector.LastError}");

        // ── Step 1: permissives ────────────────────────────────────────────────────────────────
        var idle = await harness.Cell.TickAsync();
        Assert.True(idle.Authorized, idle.RejectionCode);
        Assert.Equal("ready", idle.Phase);
        Assert.True(idle.Ready);
        Assert.False(idle.Running);
        Assert.Empty(idle.RejectedWrites);
        Assert.True(await harness.WaitUntilAsync(() => harness.Plc.Ready, ObservationTimeout));
        _output.WriteLine("Step 1 permissives: cell Ready=true written to DB tag Ready.");

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
        _output.WriteLine($"Step 3 pallet detected: robot running, actuator/sensor={robotStart.ActuatorPosition} (DB tags).");

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
        _output.WriteLine("Step 4 robot cycle complete: actuator/sensor=100 mirrored to the DB tags.");

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
            $"(DB tag setpoint -> DB tag sensor/count) {loopWatch.Elapsed.TotalMilliseconds:F2} ms.");

        // ── Step 6: latched stop during a new cycle quiesces and faults (PLC stop mid-cycle) ──
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
        _output.WriteLine(
            $"Connector: {status.MonitoredItemCount} monitored items, {status.WritesAccepted} accepted writes, " +
            $"{status.WritesRejected} rejected, {status.UpdatesAccepted} accepted updates, {status.UpdatesRejected} rejected updates.");
    }

    [Fact]
    public async Task Siemens_profile_authority_handshake_release_and_controller_loss_follow_s36()
    {
        var scope = $"siemens-authority-{Guid.NewGuid():N}";
        var authority = new SiemensProfileAuthority(scope);
        await using var harness = await SiemensPlcHarness.StartAsync(SiemensPlcHarness.LoadIoMap(), authority, scope);
        Assert.True(await harness.WaitForConnectedAsync(ConnectTimeout));

        // Handshake: the PLC holds an explicit external-controller lease before it may drive.
        Assert.Equal("held", authority.State);
        Assert.Equal("external-controller", authority.Mode);
        var authorized = await harness.Cell.TickAsync();
        Assert.True(authorized.Authorized, authorized.RejectionCode);

        // Exclusivity: local simulation may not drive while the external controller holds authority.
        var deniedLocal = await authority.AuthorizeCommandAsync(scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.False(deniedLocal.Allowed);
        Assert.Equal(ControlAuthorityCodes.Conflict, deniedLocal.Code);

        // Loss of the controller: the lease degrades and every subsequent command fails closed with
        // authority_lost and no actuator effect (no implicit takeover).
        authority.Degrade("PLC stopped responding");
        var before = harness.Cell.ActuatorPosition;
        var denied = await harness.Cell.TickAsync();
        Assert.False(denied.Authorized);
        Assert.Equal(ControlAuthorityCodes.Lost, denied.RejectionCode);
        Assert.Equal(before, harness.Cell.ActuatorPosition);

        // Explicit release returns the scope to implicit local simulation.
        authority.Release();
        Assert.Equal("available", authority.State);
        var localAfterRelease = await authority.AuthorizeCommandAsync(scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.True(localAfterRelease.Allowed);
        var externalAfterRelease = await authority.AuthorizeCommandAsync(scope, ControlAuthorityMode.ExternalController, ShowcaseSignalMap.ControllerOwnerId);
        Assert.False(externalAfterRelease.Allowed);
        Assert.Equal(ControlAuthorityCodes.NotAcquired, externalAfterRelease.Code);

        _output.WriteLine("Authority handshake: held -> local denied (conflict) -> degraded (authority_lost, no takeover) -> released -> local allowed.");
    }

    [Fact]
    public async Task Siemens_profile_failure_handling_covers_bad_quality_and_disconnect()
    {
        var scope = $"siemens-failure-{Guid.NewGuid():N}";
        await using var harness = await SiemensPlcHarness.StartAsync(
            SiemensPlcHarness.LoadIoMap(), new SiemensProfileAuthority(scope), scope);
        Assert.True(await harness.WaitForConnectedAsync(ConnectTimeout));

        var palletIdentifier = harness.IdentifiersBySignalId[ShowcaseSignalMap.PalletPresent];

        // Bad quality: an OPC UA Bad status must propagate as Bad, never be coerced to Good, and the
        // last known value is preserved rather than replaced by garbage.
        harness.Plc.SetPalletPresent(true);
        Assert.True(await WaitForMirrorBoolAsync(harness, ShowcaseSignalMap.PalletPresent, true, ObservationTimeout));

        harness.Fixture.SetValue(palletIdentifier, true, StatusCodes.Bad);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.PalletPresent, out var sample) &&
                  sample!.Quality == SignalQuality.Bad && true.Equals(sample.Value),
            ObservationTimeout),
            "a Bad OPC UA status did not propagate as Bad bad-quality with the last known value preserved");

        harness.Fixture.SetValue(palletIdentifier, true, StatusCodes.Good);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.PalletPresent, out var sample) &&
                  sample!.Quality == SignalQuality.Good,
            ObservationTimeout),
            "the recovery back to Good quality was not delivered");

        // Disconnect: losing the PLC must degrade the connector, not fabricate fresh state.
        await harness.Fixture.DisposeAsync();
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Connector.State is OpcUaConnectorState.Degraded or OpcUaConnectorState.Error,
            ConnectTimeout),
            $"the connector did not notice the PLC loss: state={harness.Connector.State}");
        _output.WriteLine(
            $"Failure handling: Bad quality preserved value; PLC loss -> connector {harness.Connector.State} " +
            $"(reconnects={harness.Connector.ReconnectCount}, lastError={harness.Connector.LastError ?? "-"}).");
    }

    [Fact]
    public async Task Siemens_profile_wrong_tag_is_reported_and_writes_fail_closed()
    {
        var scope = $"siemens-negative-{Guid.NewGuid():N}";
        var committed = SiemensPlcHarness.LoadIoMap();

        // A missing nodeId is rejected by the same validator the server applies before an apply.
        var missing = committed with
        {
            Entries = committed.Entries.Select(entry => entry.Id == "cell-ready"
                ? entry with { Target = entry.Target with { NodeId = null } }
                : entry).ToList(),
        };
        var missingValidation = SignalMappingValidator.Validate(missing, ShowcaseSignalMap.Catalog());
        Assert.False(missingValidation.Valid);
        Assert.Contains(missingValidation.Diagnostics, d => d.Code == "missing-node-id");

        // A node id that does not exist on the PLC is a diagnostics condition: the connector stays
        // connected, only the valid nodes are monitored, and delivery keeps working.
        await using var harness = await SiemensPlcHarness.StartAsync(committed, new SiemensProfileAuthority(scope), scope);
        Assert.True(await harness.WaitForConnectedAsync(ConnectTimeout));

        var fixturePrefix = SiemensProfileNodeIds.FixturePrefix(harness.Fixture);
        var wrongDocument = SiemensProfileNodeIds.RewriteToFixture(committed, fixturePrefix);
        wrongDocument = wrongDocument with
        {
            Entries = wrongDocument.Entries.Select(entry => entry.InternalSignalId == ShowcaseSignalMap.Ready
                ? entry with { Target = entry.Target with { NodeId = fixturePrefix + "Fabrik3D_Cell_DB.DoesNotExist" } }
                : entry).ToList(),
        };

        var wrongOptions = SignalMappingProjection.BuildOpcUaOptions(new OpcUaOptions
        {
            Enabled = true,
            Endpoint = harness.Fixture.EndpointUrl,
            SecurityPolicy = "None",
            AutoAcceptUntrustedCertificates = true,
            ReconnectDelaySeconds = 1,
            MaxReconnectDelaySeconds = 2,
            SamplingIntervalMilliseconds = 100,
            PublishingIntervalMilliseconds = 200,
            StaleAfterMilliseconds = 30_000,
            AllowWrites = false,
        }, wrongDocument);

        var wrongMirror = new SignalMirrorStore();
        await using var wrongConnector = new OpcUaConnector(
            Options.Create(wrongOptions), wrongMirror, NullLogger<OpcUaConnector>.Instance);
        await wrongConnector.StartAsync();
        Assert.True(await harness.WaitUntilAsync(() => wrongConnector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect with one wrong tag: {wrongConnector.LastError}");
        Assert.Equal(13, wrongConnector.MonitoredItemCount);

        harness.Fixture.SetValue(harness.IdentifiersBySignalId[ShowcaseSignalMap.Start], true);
        Assert.True(await harness.WaitUntilAsync(
            () => wrongMirror.TryGetSample(ShowcaseSignalMap.Start, out var sample) && true.Equals(sample!.Value),
            ObservationTimeout),
            "the connector stopped delivering valid nodes because of one wrong tag");

        // Write policy fails closed: writes disabled, then not allow-listed, then a read-only signal.
        var disabledWrite = await wrongConnector.WriteAsync(ShowcaseSignalMap.Ready, true, CancellationToken.None);
        Assert.False(disabledWrite.Accepted);
        Assert.Equal("writes-disabled", disabledWrite.RejectionReason);

        var allowListedOptions = SignalMappingProjection.BuildOpcUaOptions(new OpcUaOptions
        {
            Enabled = true,
            Endpoint = harness.Fixture.EndpointUrl,
            SecurityPolicy = "None",
            AutoAcceptUntrustedCertificates = true,
            ReconnectDelaySeconds = 1,
            MaxReconnectDelaySeconds = 2,
            AllowWrites = true,
            WriteAllowList = [fixturePrefix + "Fabrik3D_Cell_DB.PartsCompleted"],
        }, SiemensProfileNodeIds.RewriteToFixture(committed, fixturePrefix));

        await using var policyConnector = new OpcUaConnector(
            Options.Create(allowListedOptions), new SignalMirrorStore(), NullLogger<OpcUaConnector>.Instance);
        await policyConnector.StartAsync();
        Assert.True(await harness.WaitUntilAsync(() => policyConnector.State == OpcUaConnectorState.Connected, ConnectTimeout));

        var notListed = await policyConnector.WriteAsync(ShowcaseSignalMap.Ready, true, CancellationToken.None);
        Assert.False(notListed.Accepted);
        Assert.Equal("not-allow-listed", notListed.RejectionReason);

        var readOnly = await policyConnector.WriteAsync(ShowcaseSignalMap.Start, true, CancellationToken.None);
        Assert.False(readOnly.Accepted);
        Assert.Equal("not-writable-signal", readOnly.RejectionReason);
        _output.WriteLine("Negative tags/policy: missing nodeId rejected; wrong tag -> 13/14 monitored without crash; writes fail closed.");
    }

    [Fact]
    public async Task Siemens_profile_secure_endpoint_requires_explicit_certificate_trust()
    {
        var scope = $"siemens-security-{Guid.NewGuid():N}";
        var committed = SiemensPlcHarness.LoadIoMap();

        // Untrusted certificate: a secure (Basic256Sha256) endpoint must be refused, never silently
        // accepted. This is the certificate-mismatch negative case.
        await using (var untrusted = await SiemensPlcHarness.StartAsync(
            committed, new SiemensProfileAuthority(scope), scope,
            securityPolicy: "Basic256Sha256", autoAcceptUntrustedCertificates: false))
        {
            Assert.True(await untrusted.WaitUntilAsync(
                () => untrusted.Connector.State == OpcUaConnectorState.Error, ConnectTimeout),
                $"expected a certificate/trust failure, state={untrusted.Connector.State}");
            Assert.NotEqual(OpcUaConnectorState.Connected, untrusted.Connector.State);
            Assert.False(string.IsNullOrWhiteSpace(untrusted.Connector.LastError));
            _output.WriteLine($"Untrusted secure endpoint surfaced as: {untrusted.Connector.LastError}");
        }

        // Explicit, development-only trust: the same secure endpoint connects. Documented as a
        // development escape hatch, never a production default.
        await using var trusted = await SiemensPlcHarness.StartAsync(
            committed, new SiemensProfileAuthority(scope), scope,
            securityPolicy: "Basic256Sha256", autoAcceptUntrustedCertificates: true);
        Assert.True(await trusted.WaitForConnectedAsync(ConnectTimeout),
            $"secure connection with explicit development trust failed: {trusted.Connector.LastError}");
        _output.WriteLine("Certificate handling: untrusted secure endpoint refused; explicit development trust connects.");
    }
}
