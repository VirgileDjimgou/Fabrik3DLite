using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Settings;
using Fabrik3D.Server.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S64 flagship-demo coverage for the final stage of the documented workflow: a completed
/// server-authoritative job is recorded by the S40 historian and the record is read back
/// deterministically and read-only (<c>historian / time travel</c>).
///
/// The workflow half reuses the same orchestration building blocks as
/// <see cref="FlagshipWorkflowIntegrationTests"/> (composer → dispatch → acknowledge → task/session
/// completion) and then feeds the completed run into a real MongoDB-backed historian on the same
/// disposable container. No claim about a real PLC is made; the client-side time-travel
/// reconstruction of a historian window is covered by the client <c>timeTravel</c> suite.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class FlagshipDemoHistorianTests
{
    private readonly OrchestrationFixture _fx;
    private readonly ITestOutputHelper _output;

    public FlagshipDemoHistorianTests(OrchestrationFixture fx, ITestOutputHelper output)
    {
        _fx = fx;
        _output = output;
    }

    [Fact]
    public async Task Completed_flagship_run_is_recorded_by_the_historian_and_read_back_read_only()
    {
        // ── 1. Compose the demo job server-side (no client-generated tasks) ─────────────────────
        var job = await _fx.Composer.CreateAsync(new CreateJobRequest
        {
            Name = $"Flagship historian {Guid.NewGuid():N}",
            Description = "S64 flagship historian/time-travel coverage",
            MachineMode = "Automatic",
            TargetCellId = "reference-cell",
            ScenarioId = "pallet-processing",
            PalletLayout = new PalletLayoutRequest { PalletId = "flagship-history-pallet", Rows = 1, Columns = 2 },
            OccupiedSlots =
            [
                new PalletSlotRequest { Row = 0, Column = 0 },
                new PalletSlotRequest { Row = 0, Column = 1 },
            ],
        }, "corr-flagship-history-compose");
        Assert.Equal("Created", job.Status);

        // ── 2. Server-authoritative dispatch + assigned-simulator acknowledgement ───────────────
        var simulatorId = $"sim-flagship-history-{Guid.NewGuid():N}";
        _fx.Registry.Register(simulatorId, "reference-cell", $"conn-{simulatorId}", DateTime.UtcNow);

        var dispatch = await _fx.DispatchService.StartDispatchAsync(job.Id, new StartJobDispatchRequest
        {
            TargetCellId = "reference-cell",
            SimulatorId = simulatorId,
        }, "corr-flagship-history");
        Assert.NotNull(dispatch);
        var sessionId = dispatch!.Session.Id;

        await _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
        {
            SimulatorId = simulatorId,
            CorrelationId = dispatch.DispatchCorrelationId!,
            TargetCellId = "reference-cell",
            SimulationSessionId = sessionId,
            State = "Acknowledged",
        }, "corr-flagship-history");
        var running = await _fx.DispatchService.AcknowledgeAsync(job.Id, new DispatchAckRequest
        {
            SimulatorId = simulatorId,
            CorrelationId = dispatch.DispatchCorrelationId!,
            TargetCellId = "reference-cell",
            SimulationSessionId = sessionId,
            State = "Running",
        }, "corr-flagship-history");
        Assert.Equal(DispatchState.Running.ToString(), running!.DispatchState);

        // ── 3. Execute both pallet slots and complete the run ───────────────────────────────────
        foreach (var task in dispatch.Tasks.OrderBy(t => t.SequenceOrder))
        {
            var taskRunning = await _fx.TaskService.UpdateStatusAsync(task.Id, new UpdateTaskStatusRequest
            {
                Status = "Running",
                SimulationSessionId = sessionId,
                SimulatorId = simulatorId,
            }, "corr-flagship-history");
            Assert.NotNull(taskRunning);
            var taskCompleted = await _fx.TaskService.UpdateStatusAsync(task.Id, new UpdateTaskStatusRequest
            {
                Status = "Completed",
                SimulationSessionId = sessionId,
                SimulatorId = simulatorId,
            }, "corr-flagship-history");
            Assert.NotNull(taskCompleted);
        }

        await _fx.SessionService.UpdateStateAsync(sessionId, new UpdateSimulationStateRequest
        {
            Status = "Completed",
            SimulatorId = simulatorId,
            MachinedCount = 2,
            RemainingCount = 0,
            TotalCount = 2,
        }, "corr-flagship-history");

        var completed = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(completed);
        Assert.Equal(JobStatus.Completed.ToString(), completed!.Status);
        Assert.Equal(100, completed.ProgressPercent);

        // ── 4. The completed run is recorded by a real MongoDB-backed historian ─────────────────
        var historian = new HistorianService(
            new HistorianRepository(_fx.Context),
            Options.Create(new HistorianOptions { Enabled = true, DefaultSamplingMode = "on-change" }),
            NullLogger<HistorianService>.Instance,
            TimeProvider.System);
        await historian.EnsureIndexesAsync();

        var t0 = DateTime.UtcNow.AddSeconds(-5);
        var telemetry = await historian.IngestTelemetryAsync(new IngestTelemetryBatchRequest
        {
            SourceId = "flagship-simulator",
            Samples =
            [
                Sample("robot-1", "robot.payload.kg", t0, 3.0, sessionId, "corr-flagship-history"),
                Sample("robot-1", "robot.payload.kg", t0.AddSeconds(1), 6.0, sessionId, "corr-flagship-history"),
                Sample("cnc-1", "cnc.CycleStep", t0.AddSeconds(2), 5, sessionId, "corr-flagship-history"),
                Sample("conveyor-1", "conveyor.MachinedSlots", t0.AddSeconds(3), 2, sessionId, "corr-flagship-history"),
            ],
        }, null, "corr-flagship-history");
        Assert.True(telemetry.Enabled);
        Assert.Equal("accepted", telemetry.Status);
        Assert.Equal(4, telemetry.Accepted);
        Assert.Equal(0, telemetry.Rejected);

        var events = await historian.IngestEventsAsync(new IngestHistorizedEventBatchRequest
        {
            SourceId = "flagship-simulator",
            Events =
            [
                Event("command", t0, "info", "JOB.START", "reference-cell", sessionId, "corr-flagship-history"),
                Event("state-transition", t0.AddSeconds(1), "info", "CNC.MACHINING", "cnc-1", sessionId, "corr-flagship-history"),
                Event("fault", t0.AddSeconds(2), "warning", "CNC.DOOR.BLOCKED", "cnc-1", sessionId, "corr-flagship-history"),
                Event("state-transition", t0.AddSeconds(3), "info", "JOB.COMPLETED", "reference-cell", sessionId, "corr-flagship-history"),
            ],
        }, null, "corr-flagship-history");
        Assert.Equal(4, events.Accepted);

        // ── 5. Read back deterministically and read-only ────────────────────────────────────────
        var bySession = await historian.QuerySamplesAsync(new TelemetrySampleQuery(SessionId: sessionId));
        Assert.Equal(4, bySession.TotalCount);
        // Newest first, and every stored sample keeps its source, quality, session and correlation.
        Assert.True(bySession.Items[0].TimestampUtc > bySession.Items[1].TimestampUtc);
        Assert.All(bySession.Items, s =>
        {
            Assert.Equal(sessionId, s.SessionId);
            Assert.Equal("simulated", s.Source);
            Assert.Equal("good", s.Quality);
            Assert.Equal("corr-flagship-history", s.CorrelationId);
        });

        var byCorrelation = await historian.QuerySamplesAsync(
            new TelemetrySampleQuery(CorrelationId: "corr-flagship-history"));
        Assert.Equal(4, byCorrelation.TotalCount);

        var bySignal = await historian.QuerySamplesAsync(
            new TelemetrySampleQuery(EquipmentId: "robot-1", SignalId: "robot.payload.kg"));
        Assert.Equal(2, bySignal.TotalCount);
        Assert.Equal(6.0, bySignal.Items[0].NumericValue);

        var alarms = await historian.QueryEventsAsync(new HistorizedEventQuery(
            SessionId: sessionId, Kind: HistorianEventKind.Fault));
        Assert.Single(alarms.Items);
        Assert.Equal("CNC.DOOR.BLOCKED", alarms.Items[0].Code);

        var transitions = await historian.QueryEventsAsync(new HistorizedEventQuery(
            SessionId: sessionId, Kind: HistorianEventKind.StateTransition));
        Assert.Equal(2, transitions.TotalCount);
        Assert.Equal("JOB.COMPLETED", transitions.Items[0].Code);

        // A different session must not observe this run's history.
        var otherSession = await historian.QuerySamplesAsync(
            new TelemetrySampleQuery(SessionId: $"other-{Guid.NewGuid():N}"));
        Assert.Empty(otherSession.Items);

        var status = await historian.GetStatusAsync();
        Assert.True(status.Enabled);
        Assert.Equal(4, status.SampleDocumentCount);
        Assert.Equal(4, status.EventDocumentCount);

        _output.WriteLine(
            $"Flagship history: job={job.Id} session={sessionId} samples=4 events=4 " +
            $"correlation=corr-flagship-history, queryable read-only.");
    }

    private static IngestTelemetrySampleRequest Sample(
        string equipmentId,
        string signalId,
        DateTime timestampUtc,
        double value,
        string sessionId,
        string correlationId) => new()
    {
        TimestampUtc = timestampUtc,
        SessionId = sessionId,
        EquipmentId = equipmentId,
        SignalId = signalId,
        NumericValue = value,
        ValueType = "float",
        Quality = "good",
        Source = "simulated",
        Origin = "simulation",
        CorrelationId = correlationId,
    };

    private static IngestHistorizedEventRequest Event(
        string kind,
        DateTime timestampUtc,
        string severity,
        string code,
        string equipmentId,
        string sessionId,
        string correlationId) => new()
    {
        TimestampUtc = timestampUtc,
        Kind = kind,
        EquipmentId = equipmentId,
        SessionId = sessionId,
        Severity = severity,
        Code = code,
        Payload = """{"detail":"flagship-history"}""",
        Source = "simulation",
        CorrelationId = correlationId,
    };
}
