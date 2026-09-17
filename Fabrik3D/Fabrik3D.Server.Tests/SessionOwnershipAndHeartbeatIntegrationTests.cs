using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Fabrik3D.Server.Tests;

[Collection(OrchestrationCollection.Name)]
public class SessionOwnershipAndHeartbeatIntegrationTests
{
    private readonly OrchestrationFixture _fx;

    public SessionOwnershipAndHeartbeatIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private async Task<ClaimResultDto> ClaimJobAsync()
    {
        var job = await _fx.JobService.CreateAsync(new CreateJobRequest
        {
            Name = "Ownership job",
            Tasks = [new CreateTaskRequest { Name = "Slot", SlotRow = 0, SlotColumn = 0 }],
        });
        var claim = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-owner" }, null);
        Assert.NotNull(claim);
        return claim;
    }

    [Fact]
    public async Task State_updates_require_the_owning_simulator()
    {
        var claim = await ClaimJobAsync();

        var pushed = await _fx.SessionService.UpdateStateAsync(claim.Session.Id, new UpdateSimulationStateRequest
        {
            Status = "Running",
            CurrentPhase = "MACHINING",
            CurrentPalletId = "pallet-0",
            SimulatorId = "sim-owner",
        }, "corr-state");

        Assert.NotNull(pushed);
        Assert.Equal("MACHINING", pushed.CurrentPhase);
        Assert.Equal("pallet-0", pushed.CurrentPalletId);

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.SessionService.UpdateStateAsync(claim.Session.Id, new UpdateSimulationStateRequest
            {
                Status = "Running",
                SimulatorId = "sim-intruder",
            }, null));

        Assert.Equal("session_not_owned", conflict.Code);
    }

    [Fact]
    public async Task Heartbeat_from_owner_is_accepted_and_foreign_heartbeat_is_rejected()
    {
        var claim = await ClaimJobAsync();

        var beat = await _fx.SessionService.HeartbeatAsync(claim.Session.Id, new HeartbeatRequest
        {
            SimulatorId = "sim-owner",
        });
        Assert.NotNull(beat);

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.SessionService.HeartbeatAsync(claim.Session.Id, new HeartbeatRequest
            {
                SimulatorId = "sim-intruder",
            }));

        Assert.Equal("session_not_owned", conflict.Code);
    }

    [Fact]
    public async Task Stale_heartbeat_marks_session_faulted_and_owner_heartbeat_revives_it()
    {
        var claim = await ClaimJobAsync();

        // Age the heartbeat beyond the fixture's 5 s timeout.
        var session = await _fx.Sessions.GetByIdAsync(claim.Session.Id);
        Assert.NotNull(session);
        session.LastHeartbeatUtc = DateTime.UtcNow.AddSeconds(-30);
        await _fx.Sessions.UpdateAsync(session);

        await _fx.Monitor.CheckNowAsync();

        var faulted = await _fx.Sessions.GetByIdAsync(claim.Session.Id);
        Assert.NotNull(faulted);
        Assert.Equal(SimulationStatus.Faulted, faulted.Status);
        Assert.False(faulted.IsPaused);

        // Recovery: a heartbeat from the owner revives the session.
        var revived = await _fx.SessionService.HeartbeatAsync(claim.Session.Id, new HeartbeatRequest
        {
            SimulatorId = "sim-owner",
        });

        Assert.NotNull(revived);
        Assert.Equal(SimulationStatus.Running.ToString(), revived.Status);
    }

    [Fact]
    public async Task Fresh_heartbeat_keeps_session_running()
    {
        var claim = await ClaimJobAsync();

        // Heartbeat inside the timeout window: no fault.
        await _fx.SessionService.HeartbeatAsync(claim.Session.Id, new HeartbeatRequest { SimulatorId = "sim-owner" });
        await _fx.Monitor.CheckNowAsync();

        var session = await _fx.Sessions.GetByIdAsync(claim.Session.Id);
        Assert.NotNull(session);
        Assert.Equal(SimulationStatus.Running, session.Status);
    }

    [Fact]
    public async Task Machine_state_can_only_be_pushed_by_the_session_owner()
    {
        var claim = await ClaimJobAsync();

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            PushMachineStateAs(claim.Session.Id));

        Assert.Equal("session_not_owned", conflict.Code);
    }

    private async Task PushMachineStateAs(string sessionId)
    {
        var svc = new MachineStateService(
            new MachineStateRepository(_fx.Context), _fx.Sessions, _fx.Hub,
            NullLogger<MachineStateService>.Instance);
        await svc.UpdateCurrentAsync(new UpdateMachineStateRequest
        {
            SimulationSessionId = sessionId,
            SimulatorId = "sim-intruder",
            MachineMode = "Automatic",
        });
    }
}
