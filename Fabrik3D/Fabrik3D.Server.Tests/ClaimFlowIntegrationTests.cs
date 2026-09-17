using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Services;

namespace Fabrik3D.Server.Tests;

[Collection(OrchestrationCollection.Name)]
public class ClaimFlowIntegrationTests
{
    private readonly OrchestrationFixture _fx;

    public ClaimFlowIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private Task<JobDto> CreateJobWithTasksAsync()
    {
        return _fx.JobService.CreateAsync(new CreateJobRequest
        {
            Name = "Claim test job",
            MachineMode = "Automatic",
            Tasks =
            [
                new CreateTaskRequest { Name = "Slot R0 C0", PartType = "hex-billet", PalletId = "pallet-0", SlotRow = 0, SlotColumn = 0 },
                new CreateTaskRequest { Name = "Slot R0 C1", PartType = "hex-billet", PalletId = "pallet-0", SlotRow = 0, SlotColumn = 1 },
            ],
        });
    }

    [Fact]
    public async Task Claim_assigns_job_and_session_to_simulator_and_maps_tasks()
    {
        var job = await CreateJobWithTasksAsync();

        var result = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest
        {
            SimulatorId = "sim-a",
            CorrelationId = "corr-1",
        }, "corr-1");

        Assert.NotNull(result);
        Assert.Equal(JobStatus.Running.ToString(), result.Job.Status);
        Assert.NotNull(result.Job.SimulationSessionId);
        Assert.Equal(result.Job.SimulationSessionId, result.Session.Id);
        Assert.Equal("sim-a", result.Session.SimulatorId);
        Assert.Equal("corr-1", result.Session.CorrelationId);
        Assert.Equal(2, result.Tasks.Count);

        // The displayed task can be traced to its job, pallet slot and session.
        var slotTask = Assert.Single(result.Tasks, t => t.SlotRow == 0 && t.SlotColumn == 1);
        Assert.Equal(job.Id, slotTask.JobId);
        Assert.Equal("pallet-0", slotTask.PalletId);
        Assert.Equal(result.Session.Id, result.Job.SimulationSessionId);
    }

    [Fact]
    public async Task Duplicate_claim_from_same_simulator_is_idempotent()
    {
        var job = await CreateJobWithTasksAsync();

        var first = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-a" }, null);
        var second = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-a" }, null);

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(first.Session.Id, second.Session.Id);
        Assert.Equal(first.Job.SimulationSessionId, second.Job.SimulationSessionId);
    }

    [Fact]
    public async Task Claim_by_foreign_simulator_is_rejected_while_owner_is_alive()
    {
        var job = await CreateJobWithTasksAsync();
        await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-a" }, null);

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-b" }, null));

        Assert.Equal("session_already_claimed", conflict.Code);
    }

    [Fact]
    public async Task Claim_after_owner_heartbeat_expiry_reassigns_session()
    {
        var job = await CreateJobWithTasksAsync();
        var first = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-a" }, null);
        Assert.NotNull(first);

        // Simulate an expired owner heartbeat.
        var session = await _fx.Sessions.GetByIdAsync(first.Session.Id);
        Assert.NotNull(session);
        session.LastHeartbeatUtc = DateTime.UtcNow.AddMinutes(-10);
        await _fx.Sessions.UpdateAsync(session);

        var recovered = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-b" }, null);

        Assert.NotNull(recovered);
        Assert.Equal("sim-b", recovered.Session.SimulatorId);
        Assert.Equal(first.Session.Id, recovered.Session.Id);
    }

    [Fact]
    public async Task Claim_on_stopped_job_is_rejected()
    {
        var job = await CreateJobWithTasksAsync();
        await _fx.JobService.StartAsync(job.Id, null);
        await _fx.JobService.StopAsync(job.Id, null);

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-a" }, null));

        Assert.Equal("job_not_claimable", conflict.Code);
    }

    [Fact]
    public async Task Start_followed_by_claim_adopts_the_unowned_session()
    {
        var job = await CreateJobWithTasksAsync();
        var started = await _fx.JobService.StartAsync(job.Id, "corr-start");
        Assert.NotNull(started);
        Assert.NotNull(started.SimulationSessionId);

        var claimed = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-a" }, "corr-claim");

        Assert.NotNull(claimed);
        Assert.Equal(started.SimulationSessionId, claimed.Session.Id);
        Assert.Equal("sim-a", claimed.Session.SimulatorId);
        Assert.Equal("corr-claim", claimed.Session.CorrelationId);
    }
}
