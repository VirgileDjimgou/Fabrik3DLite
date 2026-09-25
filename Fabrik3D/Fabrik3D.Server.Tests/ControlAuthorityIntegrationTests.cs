using System.Diagnostics;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Control;
using Fabrik3D.Server.Exceptions;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// MongoDB-backed integration tests for the S36 authority service: exclusivity, handover,
/// persistence, audit trail, hub events and degraded mode. Each test uses its own scope so the
/// shared fixture database cannot cause cross-test interference.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class ControlAuthorityIntegrationTests
{
    private readonly OrchestrationFixture _fx;
    private readonly ITestOutputHelper _output;

    public ControlAuthorityIntegrationTests(OrchestrationFixture fx, ITestOutputHelper output)
    {
        _fx = fx;
        _output = output;
    }

    private static string NewScope() => $"cell-{Guid.NewGuid():N}";

    private static AcquireControlAuthorityRequest Acquire(
        string mode, string? ownerId, string? ownerKind = null, int leaseSeconds = 0)
        => new() { Mode = mode, OwnerId = ownerId, OwnerKind = ownerKind, LeaseSeconds = leaseSeconds };

    [Fact]
    public async Task Absent_document_is_reported_as_implicit_local_simulation_with_a_diagnostic()
    {
        var scope = NewScope();

        var dto = await _fx.AuthorityService.GetAsync(scope);

        Assert.Equal("local-simulation", dto.Mode);
        Assert.Equal("available", dto.State);
        Assert.False(dto.IsPersisted);
        Assert.NotNull(dto.Diagnostic);

        // Implicit local simulation may drive; the diagnostic is not an error.
        var decision = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.True(decision.Allowed);
    }

    [Fact]
    public async Task Concurrent_acquisition_by_a_second_owner_is_rejected_and_audited()
    {
        var scope = NewScope();
        var first = await _fx.AuthorityService.AcquireAsync(
            scope, Acquire("ExternalController", "modbus", "connector", leaseSeconds: 30), "corr-first");

        Assert.Equal("external-controller", first.Mode);
        Assert.Equal("held", first.State);

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.AuthorityService.AcquireAsync(
                scope, Acquire("ExternalController", "opcua", "connector"), "corr-second"));

        Assert.Equal(ControlAuthorityCodes.Conflict, conflict.Code);

        // Only one persisted authority exists for the scope and it is still the first owner.
        var stored = await _fx.Authorities.GetAsync(scope);
        Assert.NotNull(stored);
        Assert.Equal("modbus", stored!.OwnerId);

        var audit = await _fx.AuthorityService.GetAuditAsync(scope, 20);
        Assert.Contains(audit, e => e.Scope == scope && e.EventType == "authority_acquired");
        Assert.Contains(audit, e => e.EventType == "authority_conflict" && e.CorrelationId == "corr-second");

        Assert.Contains(_fx.Hub.Events,
            e => e is ControlAuthorityChangedEvent c && c.Scope == scope && c.EventType == "authority_acquired");
    }

    [Fact]
    public async Task Handover_quiesces_outputs_then_transfers_and_is_audited()
    {
        var scope = NewScope();

        var stopwatch = Stopwatch.StartNew();
        var acquired = await _fx.AuthorityService.AcquireAsync(
            scope, Acquire("ExternalController", "modbus", "connector", leaseSeconds: 30), "corr-handover");
        stopwatch.Stop();

        _output.WriteLine($"Authority handover completed in {stopwatch.Elapsed.TotalMilliseconds:F2} ms (scope {scope}).");
        Assert.True(acquired.LeaseExpiresAtUtc is not null);

        var audit = await _fx.AuthorityService.GetAuditAsync(scope, 20);
        var quiesceIndex = audit.ToList().FindIndex(e => e.EventType == "authority_quiesce");
        var acquiredIndex = audit.ToList().FindIndex(e => e.EventType == "authority_acquired");

        Assert.True(quiesceIndex >= 0, "the handover must record a quiesce event");
        Assert.True(acquiredIndex >= 0);
        // Newest first, so quiesce was written before the acquisition completed.
        Assert.True(quiesceIndex > acquiredIndex);
        Assert.Contains(audit, e => e.EventType == "authority_quiesce" && e.Detail!.Contains("de-energized"));
        Assert.True(stopwatch.Elapsed.TotalMilliseconds < 2000, "handover must complete within the documented bound");
    }

    [Fact]
    public async Task Takeover_requires_confirmation_and_then_transfers_authority()
    {
        var scope = NewScope();
        await _fx.AuthorityService.AcquireAsync(scope, Acquire("ExternalController", "modbus", "connector"), null);

        var rejected = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.AuthorityService.TakeoverAsync(scope, new TakeoverControlAuthorityRequest
            {
                Mode = "ExternalController",
                OwnerId = "opcua",
                OwnerKind = "connector",
                Confirm = false,
            }, null));
        Assert.Equal(ControlAuthorityCodes.HandoverRejected, rejected.Code);

        var taken = await _fx.AuthorityService.TakeoverAsync(scope, new TakeoverControlAuthorityRequest
        {
            Mode = "ExternalController",
            OwnerId = "opcua",
            OwnerKind = "connector",
            Confirm = true,
        }, "corr-takeover");

        Assert.Equal("opcua", taken.OwnerId);

        var audit = await _fx.AuthorityService.GetAuditAsync(scope, 20);
        Assert.Contains(audit, e => e.EventType == "authority_takeover" && e.OwnerId == "opcua");
    }

    [Fact]
    public async Task Release_returns_the_scope_to_local_simulation_and_only_the_owner_may_release()
    {
        var scope = NewScope();
        await _fx.AuthorityService.AcquireAsync(scope, Acquire("ExternalController", "modbus", "connector"), null);

        var foreign = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.AuthorityService.ReleaseAsync(scope, new ReleaseControlAuthorityRequest { OwnerId = "opcua" }, null));
        Assert.Equal(ControlAuthorityCodes.NotOwner, foreign.Code);

        var released = await _fx.AuthorityService.ReleaseAsync(
            scope, new ReleaseControlAuthorityRequest { OwnerId = "modbus" }, "corr-release");

        Assert.Equal("local-simulation", released.Mode);
        Assert.Equal("available", released.State);
        Assert.Null(released.OwnerId);

        var allowed = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.LocalSimulation, "sim-1");
        Assert.True(allowed.Allowed);
    }

    [Fact]
    public async Task Lost_lease_degrades_authority_and_never_silently_reverts_to_local_simulation()
    {
        var scope = NewScope();
        await _fx.AuthorityService.AcquireAsync(
            scope, Acquire("ExternalController", "modbus", "connector", leaseSeconds: 5), null);

        // Advance the monitor clock past the lease instead of sleeping for it.
        var degraded = await _fx.AuthorityService.ExpireLeasesAsync(DateTime.UtcNow.AddMinutes(5));
        Assert.True(degraded >= 1);

        var dto = await _fx.AuthorityService.GetAsync(scope);
        Assert.Equal("degraded", dto.State);
        Assert.Equal("external-controller", dto.Mode);
        Assert.Equal("modbus", dto.OwnerId);
        Assert.Equal("controller-heartbeat-lost", dto.DegradedReason);

        var external = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.ExternalController, "modbus");
        var local = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.LocalSimulation, "sim-1");

        Assert.False(external.Allowed);
        Assert.Equal(ControlAuthorityCodes.Lost, external.Code);
        Assert.False(local.Allowed);
        Assert.Equal(ControlAuthorityCodes.Lost, local.Code);

        var audit = await _fx.AuthorityService.GetAuditAsync(scope, 20);
        Assert.Contains(audit, e => e.EventType == "authority_degraded");
        Assert.Contains(_fx.Hub.Events,
            e => e is ControlAuthorityChangedEvent c && c.Scope == scope && c.State == "degraded");
    }

    [Fact]
    public async Task Heartbeat_with_resume_restores_a_degraded_authority_and_refreshes_its_lease()
    {
        var scope = NewScope();
        await _fx.AuthorityService.AcquireAsync(
            scope, Acquire("ExternalController", "modbus", "connector", leaseSeconds: 5), null);
        await _fx.AuthorityService.ExpireLeasesAsync(DateTime.UtcNow.AddMinutes(5));

        var resumed = await _fx.AuthorityService.HeartbeatAsync(scope, new HeartbeatControlAuthorityRequest
        {
            OwnerId = "modbus",
            Resume = true,
            LeaseSeconds = 60,
        }, "corr-resume");

        Assert.Equal("held", resumed.State);
        Assert.Null(resumed.DegradedReason);
        Assert.True(resumed.LeaseExpiresAtUtc > DateTime.UtcNow.AddSeconds(30));

        var allowed = await _fx.AuthorityService.AuthorizeCommandAsync(
            scope, ControlAuthorityMode.ExternalController, "modbus");
        Assert.True(allowed.Allowed);
    }

    [Fact]
    public async Task Replay_acquisition_is_rejected()
    {
        var scope = NewScope();

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.AuthorityService.AcquireAsync(scope, Acquire("Replay", "replay-1"), null));

        Assert.Equal(ControlAuthorityCodes.ReplayReadOnly, conflict.Code);
    }

    [Fact]
    public async Task Unhealthy_external_owner_is_refused_at_handover()
    {
        var scope = NewScope();
        var service = new Fabrik3D.Server.Services.ControlAuthorityService(
            _fx.Authorities,
            _fx.Hub,
            new UnreadyOwnerProbe("modbus"),
            Microsoft.Extensions.Options.Options.Create(new Fabrik3D.Server.Settings.OrchestrationOptions()),
            TimeProvider.System,
            Microsoft.Extensions.Logging.Abstractions.NullLogger<Fabrik3D.Server.Services.ControlAuthorityService>.Instance);

        var rejected = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            service.AcquireAsync(scope, Acquire("ExternalController", "modbus", "connector"), null));

        Assert.Equal(ControlAuthorityCodes.HandoverRejected, rejected.Code);
    }
}
