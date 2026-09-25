using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Domain.Entities;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Pure domain tests for the S36 control-authority rules: exclusivity, replay rejection,
/// degraded fail-closed behaviour, lease expiry and release ownership.
/// </summary>
public class ControlAuthorityRulesTests
{
    private static readonly DateTime Now = new(2026, 9, 25, 10, 0, 0, DateTimeKind.Utc);

    private static ControlAuthority Held(ControlAuthorityMode mode, string ownerId, DateTime? lease = null) => new()
    {
        Id = "cell-1",
        Mode = mode,
        State = ControlAuthorityState.Held,
        OwnerId = ownerId,
        LeaseExpiresAtUtc = lease,
    };

    [Fact]
    public void Replay_can_never_acquire_authority()
    {
        var decision = ControlAuthorityRules.ValidateAcquire(null, ControlAuthorityMode.Replay, "replay-1");

        Assert.False(decision.Allowed);
        Assert.Equal(ControlAuthorityCodes.ReplayReadOnly, decision.Code);
    }

    [Fact]
    public void Acquiring_a_scope_held_by_another_owner_is_a_conflict()
    {
        var current = Held(ControlAuthorityMode.ExternalController, "modbus");

        var decision = ControlAuthorityRules.ValidateAcquire(current, ControlAuthorityMode.ExternalController, "opcua");

        Assert.False(decision.Allowed);
        Assert.Equal(ControlAuthorityCodes.Conflict, decision.Code);
    }

    [Fact]
    public void Re_acquiring_the_same_owner_and_mode_is_idempotent()
    {
        var current = Held(ControlAuthorityMode.ExternalController, "modbus");

        var decision = ControlAuthorityRules.ValidateAcquire(current, ControlAuthorityMode.ExternalController, "modbus");

        Assert.True(decision.Allowed);
    }

    [Fact]
    public void Local_simulation_is_allowed_implicitly_when_no_document_exists()
    {
        var decision = ControlAuthorityRules.EvaluateCommand(
            null, ControlAuthorityMode.LocalSimulation, "sim-1", Now);

        Assert.True(decision.Allowed);
    }

    [Fact]
    public void External_mode_must_acquire_before_it_may_command()
    {
        var decision = ControlAuthorityRules.EvaluateCommand(
            null, ControlAuthorityMode.ExternalController, "modbus", Now);

        Assert.False(decision.Allowed);
        Assert.Equal(ControlAuthorityCodes.NotAcquired, decision.Code);
    }

    [Fact]
    public void External_owner_may_command_while_holding_authority_but_local_simulation_may_not()
    {
        var current = Held(ControlAuthorityMode.ExternalController, "modbus");

        var external = ControlAuthorityRules.EvaluateCommand(
            current, ControlAuthorityMode.ExternalController, "modbus", Now);
        var local = ControlAuthorityRules.EvaluateCommand(
            current, ControlAuthorityMode.LocalSimulation, "sim-1", Now);

        Assert.True(external.Allowed);
        Assert.False(local.Allowed);
        Assert.Equal(ControlAuthorityCodes.Conflict, local.Code);
    }

    [Fact]
    public void Degraded_authority_fails_closed_even_for_its_owner()
    {
        var current = new ControlAuthority
        {
            Id = "cell-1",
            Mode = ControlAuthorityMode.ExternalController,
            State = ControlAuthorityState.Degraded,
            OwnerId = "modbus",
            DegradedReason = "controller-heartbeat-lost",
        };

        var owner = ControlAuthorityRules.EvaluateCommand(
            current, ControlAuthorityMode.ExternalController, "modbus", Now);
        var local = ControlAuthorityRules.EvaluateCommand(
            current, ControlAuthorityMode.LocalSimulation, "sim-1", Now);

        Assert.False(owner.Allowed);
        Assert.Equal(ControlAuthorityCodes.Lost, owner.Code);
        Assert.False(local.Allowed);
        Assert.Equal(ControlAuthorityCodes.Lost, local.Code);
    }

    [Theory]
    [InlineData(ControlAuthorityMode.Replay)]
    [InlineData(ControlAuthorityMode.ObservedTwin)]
    public void Read_only_modes_can_never_command(ControlAuthorityMode mode)
    {
        var decision = ControlAuthorityRules.EvaluateCommand(
            Held(ControlAuthorityMode.LocalSimulation, "sim-1"), mode, "x", Now);

        Assert.False(decision.Allowed);
        Assert.False(ControlAuthorityRules.ModeAllowsCommanding(mode));
    }

    [Fact]
    public void Lease_expiry_only_applies_to_held_external_authority()
    {
        var external = Held(ControlAuthorityMode.ExternalController, "modbus", Now.AddSeconds(-1));
        var local = Held(ControlAuthorityMode.LocalSimulation, "sim-1");
        var future = Held(ControlAuthorityMode.ExternalController, "modbus", Now.AddSeconds(30));

        Assert.True(ControlAuthorityRules.IsLeaseExpired(external, Now));
        Assert.False(ControlAuthorityRules.IsLeaseExpired(local, Now));
        Assert.False(ControlAuthorityRules.IsLeaseExpired(future, Now));
    }

    [Fact]
    public void Only_the_current_owner_may_release()
    {
        var current = Held(ControlAuthorityMode.ExternalController, "modbus");

        Assert.True(ControlAuthorityRules.ValidateRelease(current, "modbus").Allowed);
        var foreign = ControlAuthorityRules.ValidateRelease(current, "opcua");
        Assert.False(foreign.Allowed);
        Assert.Equal(ControlAuthorityCodes.NotOwner, foreign.Code);
    }

    [Fact]
    public void Lease_duration_is_clamped_to_the_documented_bounds()
    {
        Assert.Equal(ControlAuthorityRules.DefaultLeaseSeconds, ControlAuthorityRules.ClampLeaseSeconds(0));
        Assert.Equal(ControlAuthorityRules.DefaultLeaseSeconds, ControlAuthorityRules.ClampLeaseSeconds(-5));
        Assert.Equal(45, ControlAuthorityRules.ClampLeaseSeconds(45));
        Assert.Equal(ControlAuthorityRules.MaxLeaseSeconds, ControlAuthorityRules.ClampLeaseSeconds(99999));
    }
}
