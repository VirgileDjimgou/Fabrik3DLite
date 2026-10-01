using System.Diagnostics;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Server.Tests.Showcase;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Post-1.0 flagship workflow proof, entirely automated and deterministic:
///   operator job composition (S52) → server-authoritative Start/dispatch (S51) → targeted execution
///   request → simulator acknowledge/running with no local Start → external control authority (S36)
///   acquired by the fixture controller → deterministic virtual cell sequence (robot → CNC → complete)
///   → simulated fault and recovery → server-authoritative job completion.
///
/// The external controller is the committed CODESYS/SoftPLC substitute fixture (real Modbus TCP
/// transport, no proprietary software). It is deliberately labelled a <em>fixture</em>, not a real
/// Siemens/PLCSIM run; the real-PLC proof was removed from Roadmap Revision 2 and remains unvalidated.
/// Historian and time-travel fidelity are covered by the dedicated <c>Historian*</c> and
/// <c>time-travel</c> suites recorded in <c>docs/operations/VALIDATION_POST_1.0.md</c>.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class FlagshipWorkflowIntegrationTests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private readonly OrchestrationFixture _fx;
    private readonly ITestOutputHelper _output;

    public FlagshipWorkflowIntegrationTests(OrchestrationFixture fx, ITestOutputHelper output)
    {
        _fx = fx;
        _output = output;
    }

    private async Task<JobDto> ComposeJobAsync()
        => await _fx.Composer.CreateAsync(new CreateJobRequest
        {
            Name = $"Flagship workflow {Guid.NewGuid():N}",
            Description = "Post-1.0 automated flagship workflow proof",
            MachineMode = "Automatic",
            TargetCellId = "reference-cell",
            ScenarioId = "pallet-processing",
            PalletLayout = new PalletLayoutRequest { PalletId = "flagship-pallet", Rows = 1, Columns = 2 },
            OccupiedSlots =
            [
                new PalletSlotRequest { Row = 0, Column = 0 },
                new PalletSlotRequest { Row = 0, Column = 1 },
            ],
        }, "corr-flagship-compose");

    [Fact]
    public async Task Flagship_workflow_runs_from_composed_job_through_external_control_to_completion()
    {
        // ── 1. Operator composes the job server-side (no client-side task generation) ────────────
        var job = await ComposeJobAsync();
        Assert.Equal("reference-cell", job.TargetCellId);
        Assert.Equal("Created", job.Status);
        Assert.Equal(2, job.TaskCount);

        // ── 2. Operator Start: the server assigns exactly one target and publishes a targeted ────
        //       execution request. There is no simulator-local Start anywhere in the flow.
        var simulatorId = $"sim-flagship-{Guid.NewGuid():N}";
        _fx.Registry.Register(simulatorId, "reference-cell", $"conn-{simulatorId}", DateTime.UtcNow);

        var dispatch = await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest
        {
            TargetCellId = "reference-cell",
            SimulatorId = simulatorId,
        }, "corr-flagship-dispatch");

        Assert.NotNull(dispatch);
        Assert.Equal(DispatchState.Pending.ToString(), dispatch!.DispatchState);
        Assert.Equal("reference-cell", dispatch.TargetCellId);
        Assert.Equal(simulatorId, dispatch.AssignedSimulatorId);
        Assert.Equal("corr-flagship-dispatch", dispatch.DispatchCorrelationId);
        Assert.Equal(JobStatus.Running.ToString(), dispatch.Job.Status);
        Assert.Equal(dispatch.Session.Id, dispatch.Job.SimulationSessionId);
        Assert.Equal(2, dispatch.Tasks.Count);

        var requested = Assert.Single(
            _fx.Hub.Events.OfType<ExecutionDispatchRequestedEvent>(), e => e.JobId == job.Id);
        Assert.Equal(simulatorId, requested.AssignedSimulatorId);
        Assert.Equal("reference-cell", requested.TargetCellId);
        Assert.Equal("corr-flagship-dispatch", requested.CorrelationId);
        Assert.Equal(dispatch.Session.Id, requested.SessionId);

        // ── 3. The assigned simulator acknowledges and reports Running; no local Start exists ─────
        var acknowledged = await _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
        {
            SimulatorId = simulatorId,
            CorrelationId = requested.CorrelationId,
            TargetCellId = "reference-cell",
            SimulationSessionId = dispatch.Session.Id,
            State = "Acknowledged",
        }, "corr-flagship-dispatch");
        Assert.NotNull(acknowledged);
        Assert.Equal(DispatchState.Acknowledged.ToString(), acknowledged!.DispatchState);

        var running = await _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
        {
            SimulatorId = simulatorId,
            CorrelationId = requested.CorrelationId,
            TargetCellId = "reference-cell",
            SimulationSessionId = dispatch.Session.Id,
            State = "Running",
        }, "corr-flagship-dispatch");
        Assert.NotNull(running);
        Assert.Equal(DispatchState.Running.ToString(), running!.DispatchState);
        Assert.Contains(_fx.Hub.Events.OfType<DispatchStateChangedEvent>(),
            e => e.JobId == job.Id && e.DispatchState == DispatchState.Running.ToString());
        _output.WriteLine("Dispatch: Pending -> Acknowledged -> Running (targeted, no local Start).");

        // ── 4. External authority owns the cell scope; before it is acquired the cell cannot move ─
        var scope = $"flagship-cell-{dispatch.Session.Id}";
        await using var harness = await ShowcaseHarness.StartAsync(
            ShowcaseHarness.LoadIoMap(), _fx.AuthorityService, scope);
        Assert.True(await harness.WaitForConnectedAsync(ConnectTimeout),
            $"fixture connector did not connect: state={harness.Connector.State} lastError={harness.Connector.LastError}");

        var deniedWithoutAuthority = await harness.Cell.TickAsync();
        Assert.False(deniedWithoutAuthority.Authorized);
        Assert.NotNull(deniedWithoutAuthority.RejectionCode);
        Assert.Equal(0, deniedWithoutAuthority.ActuatorPosition);

        var acquired = await _fx.AuthorityService.AcquireAsync(scope, new AcquireControlAuthorityRequest
        {
            Mode = "ExternalController",
            OwnerId = ShowcaseSignalMap.ControllerOwnerId,
            OwnerKind = "connector",
            LeaseSeconds = 120,
        }, "corr-flagship-authority");
        Assert.Equal("held", acquired.State);
        Assert.Contains(_fx.Hub.Events.OfType<ControlAuthorityChangedEvent>(),
            e => e.Scope == scope && e.EventType == "authority_acquired");

        // ── 5. Fixture controller drives the deterministic virtual cell closed loop ──────────────
        var ready = await harness.Cell.TickAsync();
        Assert.True(ready.Authorized, ready.RejectionCode);
        Assert.Equal("ready", ready.Phase);
        Assert.True(await harness.WaitUntilAsync(() => harness.Plc.Ready, ObservationTimeout));

        harness.Plc.SetPalletPresent(true);
        harness.Plc.SetCycleTarget(100);
        harness.Plc.SetStart(true);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.PalletPresent, out var s) && s!.Value is bool b && b,
            ObservationTimeout));
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.CycleTarget, out var s) &&
                  s!.Value is not null && s.Value is not bool &&
                  Math.Abs(Convert.ToDouble(s.Value) - 100) < 0.0001,
            ObservationTimeout));

        var loopWatch = Stopwatch.StartNew();
        var robot = await harness.Cell.TickAsync();
        Assert.Equal("robot", robot.Phase);
        Assert.True(robot.Running);
        Assert.True(robot.ActuatorPosition > 0);

        var robotDone = robot;
        for (var guard = 0; guard < 10 && !robotDone.RobotCycleComplete; guard++)
        {
            robotDone = await harness.Cell.TickAsync();
            Assert.True(robotDone.Authorized, robotDone.RejectionCode);
        }

        Assert.True(robotDone.RobotCycleComplete);
        Assert.Equal(100, robotDone.ActuatorPosition);

        var cncDone = robotDone;
        for (var guard = 0; guard < 10 && !cncDone.CncCycleComplete; guard++)
        {
            cncDone = await harness.Cell.TickAsync();
            Assert.True(cncDone.Authorized, cncDone.RejectionCode);
        }

        Assert.True(cncDone.CncCycleComplete);
        Assert.True(cncDone.CycleComplete);
        Assert.Equal(1, cncDone.PartsCompleted);
        loopWatch.Stop();
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Plc.CycleComplete && harness.Plc.PartsCompleted == 1,
            ObservationTimeout));
        _output.WriteLine(
            $"Cell loop: ready -> robot -> CNC -> complete, actuator={cncDone.ActuatorPosition}, " +
            $"parts={cncDone.PartsCompleted}, latency={loopWatch.Elapsed.TotalMilliseconds:F2} ms (fixture).");

        // ── 6. Simulated fault and recovery ──────────────────────────────────────────────────────
        harness.Plc.SetReset(true);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.Reset, out var s) && s!.Value is bool b && b,
            ObservationTimeout));
        var afterReset = await harness.Cell.TickAsync();
        Assert.Equal("idle", afterReset.Phase);
        harness.Plc.SetReset(false);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.Reset, out var s) && s!.Value is bool b && !b,
            ObservationTimeout));

        var secondRobot = await harness.Cell.TickAsync();
        Assert.Equal("ready", secondRobot.Phase);
        var moving = await harness.Cell.TickAsync();
        Assert.Equal("robot", moving.Phase);

        harness.Plc.SetStop(true);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.Stop, out var s) && s!.Value is bool b && b,
            ObservationTimeout));
        var faulted = await harness.Cell.TickAsync();
        Assert.Equal("fault", faulted.Phase);
        Assert.True(faulted.Fault);
        Assert.False(faulted.Running);
        Assert.Equal(moving.ActuatorPosition, faulted.ActuatorPosition);

        harness.Plc.SetStop(false);
        harness.Plc.SetReset(true);
        Assert.True(await harness.WaitUntilAsync(
            () => harness.Mirror.TryGetSample(ShowcaseSignalMap.Reset, out var s) && s!.Value is bool b && b,
            ObservationTimeout));
        var recovered = await harness.Cell.TickAsync();
        Assert.Equal("idle", recovered.Phase);
        Assert.False(recovered.Fault);
        _output.WriteLine($"Fault/recovery: fault latched at {faulted.ActuatorPosition}, then reset cleared it.");

        // ── 7. Simulator reports tasks + session; the server completes the job ───────────────────
        foreach (var task in dispatch.Tasks.OrderBy(t => t.SequenceOrder))
        {
            await _fx.TaskService.UpdateStatusAsync(task.Id, new UpdateTaskStatusRequest
            {
                Status = "Running",
                SimulationSessionId = dispatch.Session.Id,
                SimulatorId = simulatorId,
            }, "corr-flagship-dispatch");
            await _fx.TaskService.UpdateStatusAsync(task.Id, new UpdateTaskStatusRequest
            {
                Status = "Completed",
                SimulationSessionId = dispatch.Session.Id,
                SimulatorId = simulatorId,
            }, "corr-flagship-dispatch");
        }

        await _fx.SessionService.UpdateStateAsync(dispatch.Session.Id, new UpdateSimulationStateRequest
        {
            Status = "Completed",
            SimulatorId = simulatorId,
            MachinedCount = 2,
            RemainingCount = 0,
            TotalCount = 2,
        }, "corr-flagship-dispatch");

        var completed = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(completed);
        Assert.Equal(JobStatus.Completed.ToString(), completed!.Status);
        Assert.Equal(100, completed.ProgressPercent);
        Assert.NotNull(completed.CompletedAtUtc);
        Assert.Contains(_fx.Hub.Events.OfType<JobStateChangedEvent>(),
            e => e.JobId == job.Id && e.NewStatus == JobStatus.Completed.ToString());

        var status = harness.Connector.GetStatus();
        Assert.Equal(0, status.WritesRejected);
        _output.WriteLine(
            $"Workflow complete: job={job.Id} session={dispatch.Session.Id} correlation=" +
            $"corr-flagship-dispatch; fixture writes accepted={status.WritesAccepted} rejected={status.WritesRejected}.");
    }
}
