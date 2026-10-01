using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Tenancy;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S51 server-authoritative dispatch: assignment, targeted publish, claim/ACK/running lifecycle,
/// idempotency, foreign-claim rejection, timeout and target resolution.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class DispatchIntegrationTests
{
    private readonly OrchestrationFixture _fx;

    public DispatchIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private Task<JobDto> CreateJobAsync(string? targetCellId = null)
    {
        return _fx.JobService.CreateAsync(new CreateJobRequest
        {
            Name = "Dispatch test job",
            MachineMode = "Automatic",
            Tasks =
            [
                new CreateTaskRequest { Name = "Slot R0 C0", PartType = "hex-billet", PalletId = "pallet-0", SlotRow = 0, SlotColumn = 0 },
                new CreateTaskRequest { Name = "Slot R0 C1", PartType = "hex-billet", PalletId = "pallet-0", SlotRow = 0, SlotColumn = 1 },
            ],
        });
    }

    private void RegisterSimulator(string simulatorId, string cellId)
        => _fx.Registry.Register(simulatorId, cellId, $"conn-{simulatorId}", DateTime.UtcNow);

    [Fact]
    public async Task Dispatch_assigns_target_and_publishes_targeted_request()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();

        var result = await _fx.DispatchService.StartDispatchAsync(
            job.Id, new StartJobDispatchRequest(), "corr-dispatch");

        Assert.NotNull(result);
        Assert.Equal(DispatchState.Pending.ToString(), result.DispatchState);
        Assert.Equal("reference-cell", result.TargetCellId);
        Assert.Equal("sim-a", result.AssignedSimulatorId);
        Assert.Equal("corr-dispatch", result.DispatchCorrelationId);
        Assert.Equal(JobStatus.Running.ToString(), result.Job.Status);
        Assert.NotNull(result.Job.SimulationSessionId);
        Assert.Equal(result.Job.SimulationSessionId, result.Session.Id);
        Assert.Equal("reference-cell", result.Session.TargetCellId);
        Assert.Equal(2, result.Tasks.Count);

        // The targeted execution request carries the same correlation id and target.
        var requested = Assert.Single(
            _fx.Hub.Events.OfType<ExecutionDispatchRequestedEvent>(),
            e => e.JobId == job.Id);
        Assert.Equal("sim-a", requested.AssignedSimulatorId);
        Assert.Equal("reference-cell", requested.TargetCellId);
        Assert.Equal("corr-dispatch", requested.CorrelationId);
        Assert.Equal(result.Session.Id, requested.SessionId);
        Assert.Equal(2, requested.TaskIds.Count);

        // The HMI observes a Pending dispatch state change.
        Assert.Contains(_fx.Hub.Events.OfType<DispatchStateChangedEvent>(),
            e => e.JobId == job.Id && e.DispatchState == DispatchState.Pending.ToString());
    }

    [Fact]
    public async Task Dispatch_without_available_target_fails_without_starting()
    {
        var job = await CreateJobAsync();

        // A unique cell guarantees no simulator is registered for it, independent of test order.
        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest
            {
                TargetCellId = $"unregistered-cell-{Guid.NewGuid():N}",
            }, null));

        Assert.Equal("dispatch_no_target", conflict.Code);

        // The job must not be left Running.
        var stored = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(stored);
        Assert.Equal(JobStatus.Created.ToString(), stored.Status);
        Assert.Null(stored.SimulationSessionId);
    }

    [Fact]
    public async Task Duplicate_dispatch_is_idempotent()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();

        var first = await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest(), "corr-1");
        var second = await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest(), "corr-2");

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(first.Session.Id, second.Session.Id);
        Assert.Equal(first.DispatchCorrelationId, second.DispatchCorrelationId);
        Assert.Equal(DispatchState.Pending.ToString(), second.DispatchState);
    }

    [Fact]
    public async Task Acknowledge_transitions_pending_to_acknowledged_then_running()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();
        var dispatch = await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest(), "corr-ack");
        Assert.NotNull(dispatch);

        var ack = await _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
        {
            SimulatorId = "sim-a",
            CorrelationId = "corr-ack",
            TargetCellId = "reference-cell",
            SimulationSessionId = dispatch.Session.Id,
            State = "Acknowledged",
        }, "corr-ack");

        Assert.NotNull(ack);
        Assert.Equal(DispatchState.Acknowledged.ToString(), ack.DispatchState);
        Assert.NotNull(ack.Job.DispatchAcknowledgedAtUtc);

        var running = await _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
        {
            SimulatorId = "sim-a",
            CorrelationId = "corr-ack",
            TargetCellId = "reference-cell",
            SimulationSessionId = dispatch.Session.Id,
            State = "Running",
        }, "corr-ack");

        Assert.NotNull(running);
        Assert.Equal(DispatchState.Running.ToString(), running.DispatchState);

        // Duplicate running ACK is idempotent.
        var duplicate = await _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
        {
            SimulatorId = "sim-a",
            CorrelationId = "corr-ack",
            State = "Running",
        }, "corr-ack");
        Assert.NotNull(duplicate);
        Assert.Equal(DispatchState.Running.ToString(), duplicate.DispatchState);
    }

    [Fact]
    public async Task Foreign_simulator_claim_is_rejected()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();
        await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest(), "corr-foreign");

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
            {
                SimulatorId = "sim-b",
                CorrelationId = "corr-foreign",
                State = "Acknowledged",
            }, null));

        Assert.Equal("dispatch_foreign_claim", conflict.Code);
    }

    [Fact]
    public async Task Mismatched_correlation_and_target_are_rejected()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();
        await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest(), "corr-match");

        var badCorrelation = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
            {
                SimulatorId = "sim-a",
                CorrelationId = "corr-other",
                State = "Acknowledged",
            }, null));
        Assert.Equal("dispatch_correlation_mismatch", badCorrelation.Code);

        var badTarget = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
            {
                SimulatorId = "sim-a",
                CorrelationId = "corr-match",
                TargetCellId = "other-cell",
                State = "Acknowledged",
            }, null));
        Assert.Equal("dispatch_target_mismatch", badTarget.Code);
    }

    [Fact]
    public async Task Pending_dispatch_times_out_and_late_ack_is_rejected()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();
        await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest(), "corr-timeout");

        // Force the deadline into the past and run the monitor scan.
        var stored = await _fx.Jobs.GetByIdAsync(job.Id);
        Assert.NotNull(stored);
        stored.DispatchTimeoutAtUtc = DateTime.UtcNow.AddSeconds(-1);
        await _fx.Jobs.UpdateAsync(stored);

        var expired = await _fx.DispatchService.ExpirePendingDispatchesAsync(DateTime.UtcNow);
        Assert.Equal(1, expired);

        var afterTimeout = await _fx.DispatchService.GetDispatchAsync(job.Id);
        Assert.NotNull(afterTimeout);
        Assert.Equal(DispatchState.TimedOut.ToString(), afterTimeout.DispatchState);
        Assert.NotNull(afterTimeout.FailureReason);

        var lateAck = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
            {
                SimulatorId = "sim-a",
                CorrelationId = "corr-timeout",
                State = "Acknowledged",
            }, null));
        Assert.Equal("dispatch_timed_out", lateAck.Code);
    }

    [Fact]
    public async Task Explicit_target_cell_mismatch_is_rejected()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest
            {
                TargetCellId = "other-cell",
                SimulatorId = "sim-a",
            }, null));

        Assert.Equal("dispatch_target_incompatible", conflict.Code);
    }

    [Fact]
    public async Task Dispatch_on_unknown_job_returns_null()
    {
        var result = await _fx.DispatchService.StartDispatchAsync(
            "0123456789abcdef01234567", new StartJobDispatchRequest(), null);
        Assert.Null(result);
    }

    [Fact]
    public async Task Dispatch_on_stopped_job_is_rejected()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();
        await _fx.JobService.StartAsync(job.Id, null);
        await _fx.JobService.StopAsync(job.Id, null);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest(), null));
    }

    [Fact]
    public async Task Cross_tenant_dispatch_returns_null_without_leaking_existence()
    {
        RegisterSimulator("sim-a", "reference-cell");
        var job = await CreateJobAsync();

        // A dispatch service scoped to another organization cannot see the job.
        var otherTenant = new FixedTenantContext("org-other");
        var scopedDispatch = new DispatchService(
            new JobRepository(_fx.Context, otherTenant),
            new TaskRepository(_fx.Context, otherTenant),
            new SimulationSessionRepository(_fx.Context, otherTenant),
            _fx.Hub,
            _fx.Registry,
            NullLogger<DispatchService>.Instance,
            Options.Create(new Fabrik3D.Server.Settings.OrchestrationOptions
            {
                DispatchAckTimeoutSeconds = 5,
                DefaultCellId = "reference-cell",
                AuthoritativeDispatchEnabled = true,
            }));

        var result = await scopedDispatch.StartDispatchAsync(
            job.Id, new StartJobDispatchRequest(), null);

        Assert.Null(result);
    }

    private sealed class FixedTenantContext : ITenantContext
    {
        public FixedTenantContext(string organizationId)
            => Scope = TenantScope.ForOrganization(organizationId);

        public TenantScope? Scope { get; }
    }
}
