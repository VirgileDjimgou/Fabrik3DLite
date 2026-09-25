using System.Diagnostics;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Infrastructure.Settings;
using MongoDB.Bson;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// MongoDB-backed integration tests for the S40 historian: ingestion batching, query filters,
/// pagination and ordering, index presence, retention/pruning, migration of existing data,
/// bounded growth and recorded performance numbers.
/// </summary>
[Collection(HistorianCollection.Name)]
public class HistorianIntegrationTests
{
    private readonly HistorianFixture _fx;
    private readonly ITestOutputHelper _output;

    public HistorianIntegrationTests(HistorianFixture fx, ITestOutputHelper output)
    {
        _fx = fx;
        _output = output;
    }

    private static IngestTelemetrySampleRequest Sample(
        string equipmentId,
        string signalId,
        DateTime timestampUtc,
        double value,
        string quality = "good",
        string? sessionId = null,
        string? correlationId = null) => new()
    {
        TimestampUtc = timestampUtc,
        SessionId = sessionId,
        EquipmentId = equipmentId,
        SignalId = signalId,
        NumericValue = value,
        ValueType = "float",
        Quality = quality,
        Source = "simulated",
        Origin = "simulation",
        CorrelationId = correlationId,
    };

    private static IngestTelemetryBatchRequest Batch(params IngestTelemetrySampleRequest[] samples) =>
        new() { Samples = samples.ToList(), SourceId = "sim-test" };

    private static IngestHistorizedEventRequest Event(
        string kind,
        DateTime timestampUtc,
        string severity,
        string code,
        string? equipmentId = null,
        string? sessionId = null) => new()
    {
        TimestampUtc = timestampUtc,
        Kind = kind,
        EquipmentId = equipmentId,
        SessionId = sessionId,
        Severity = severity,
        Code = code,
        Payload = """{"detail":"integration"}""",
        Source = "simulation",
    };

    [Fact]
    public async Task Ingested_samples_and_events_are_queryable_by_every_documented_filter()
    {
        var context = _fx.CreateContext();
        var service = _fx.CreateService(context);
        await service.EnsureIndexesAsync();

        var t0 = DateTime.UtcNow.AddMinutes(-10);
        var ingest = await service.IngestTelemetryAsync(Batch(
            Sample("cnc-1", "cnc.spindle.speed", t0, 1400, sessionId: "session-1", correlationId: "corr-1"),
            Sample("cnc-1", "cnc.spindle.speed", t0.AddSeconds(1), 1500, sessionId: "session-1", correlationId: "corr-1"),
            Sample("cnc-1", "cnc.spindle.speed", t0.AddSeconds(2), 1500, sessionId: "session-1", quality: "bad", correlationId: "corr-1"),
            Sample("conveyor-1", "conveyor.speed", t0.AddSeconds(3), 0.2, sessionId: "session-1")), null);

        Assert.True(ingest.Enabled);
        Assert.Equal("accepted", ingest.Status);
        // All four are selected: two value changes plus a quality change on the same signal.
        Assert.Equal(4, ingest.Accepted);
        Assert.Equal(0, ingest.Dropped);

        var bySignal = await service.QuerySamplesAsync(new TelemetrySampleQuery(
            EquipmentId: "cnc-1", SignalId: "cnc.spindle.speed"));
        Assert.Equal(3, bySignal.TotalCount);
        Assert.True(bySignal.Items[0].TimestampUtc > bySignal.Items[1].TimestampUtc);

        var bySession = await service.QuerySamplesAsync(new TelemetrySampleQuery(SessionId: "session-1"));
        Assert.Equal(4, bySession.TotalCount);

        var byQuality = await service.QuerySamplesAsync(new TelemetrySampleQuery(Quality: SignalQuality.Bad));
        Assert.Single(byQuality.Items);
        Assert.Equal("bad", byQuality.Items[0].Quality);

        var byRange = await service.QuerySamplesAsync(new TelemetrySampleQuery(
            FromUtc: t0.AddSeconds(1), ToUtc: t0.AddSeconds(2)));
        Assert.Equal(2, byRange.TotalCount);

        var byCorrelation = await service.QuerySamplesAsync(new TelemetrySampleQuery(CorrelationId: "corr-1"));
        Assert.Equal(3, byCorrelation.TotalCount);

        var pageOne = await service.QuerySamplesAsync(new TelemetrySampleQuery(Limit: 2));
        var pageTwo = await service.QuerySamplesAsync(new TelemetrySampleQuery(Limit: 2, Skip: 2));
        Assert.Equal(2, pageOne.Items.Count);
        Assert.Equal(2, pageTwo.Items.Count);
        Assert.Empty(pageOne.Items.Select(s => s.Id).Intersect(pageTwo.Items.Select(s => s.Id)));

        var eventIngest = await service.IngestEventsAsync(new IngestHistorizedEventBatchRequest
        {
            Events =
            [
                Event("alarm", t0.AddSeconds(4), "critical", "A001", "cnc-1", "session-1"),
                Event("state-transition", t0.AddSeconds(5), "info", "STATE.MOVING", "robot-1", "session-1"),
                Event("command", t0.AddSeconds(6), "info", "CMD.START", "robot-1", "session-1"),
            ],
            SourceId = "sim-test",
        }, null);

        Assert.Equal(3, eventIngest.Accepted);

        var alarms = await service.QueryEventsAsync(new HistorizedEventQuery(Kind: HistorianEventKind.Alarm));
        Assert.Single(alarms.Items);
        Assert.Equal("A001", alarms.Items[0].Code);
        Assert.Equal("critical", alarms.Items[0].Severity);

        var robotEvents = await service.QueryEventsAsync(new HistorizedEventQuery(EquipmentId: "robot-1"));
        Assert.Equal(2, robotEvents.TotalCount);

        var bySeverity = await service.QueryEventsAsync(new HistorizedEventQuery(Severity: "critical"));
        Assert.Single(bySeverity.Items);

        var eventsByRange = await service.QueryEventsAsync(new HistorizedEventQuery(
            FromUtc: t0.AddSeconds(5), ToUtc: t0.AddSeconds(6)));
        Assert.Equal(2, eventsByRange.TotalCount);
    }

    [Fact]
    public async Task Indexes_are_created_for_the_documented_query_patterns()
    {
        var context = _fx.CreateContext();
        var repository = _fx.CreateRepository(context);

        await repository.EnsureIndexesAsync();
        var indexes = await repository.ListIndexNamesAsync();

        Assert.Contains("session_timestamp", indexes["telemetrySamples"]);
        Assert.Contains("equipment_signal_timestamp", indexes["telemetrySamples"]);
        Assert.Contains("timestamp", indexes["telemetrySamples"]);
        Assert.Contains("kind_timestamp", indexes["historizedEvents"]);
        Assert.Contains("session_timestamp", indexes["historizedEvents"]);
        Assert.Contains("equipment_timestamp", indexes["historizedEvents"]);
        Assert.Contains("severity_timestamp", indexes["historizedEvents"]);

        // Idempotent: re-running must not fail or change the index set.
        await repository.EnsureIndexesAsync();
        var again = await repository.ListIndexNamesAsync();
        Assert.Equal(indexes["telemetrySamples"].OrderBy(x => x), again["telemetrySamples"].OrderBy(x => x));

        _output.WriteLine($"telemetrySamples indexes: {string.Join(", ", again["telemetrySamples"])}");
        _output.WriteLine($"historizedEvents indexes: {string.Join(", ", again["historizedEvents"])}");
    }

    [Fact]
    public async Task Pruner_deletes_by_age_and_by_per_signal_count_keeping_the_newest()
    {
        var context = _fx.CreateContext();
        var repository = _fx.CreateRepository(context);
        var service = _fx.CreateService(context, new HistorianOptions
        {
            Enabled = true,
            RetentionMaxAgeDays = 1,
            RetentionMaxSamplesPerSignal = 2,
            RetentionMaxEventDocuments = 2,
        });

        var now = DateTime.UtcNow;
        var samples = new List<TelemetrySample>
        {
            NewSample("cnc-1", "cnc.spindle.speed", now.AddDays(-3), 1),
            NewSample("cnc-1", "cnc.spindle.speed", now.AddDays(-2), 2),
            NewSample("cnc-1", "cnc.spindle.speed", now.AddMinutes(-30), 3),
            NewSample("cnc-1", "cnc.spindle.speed", now.AddMinutes(-20), 4),
            NewSample("cnc-1", "cnc.spindle.speed", now.AddMinutes(-10), 5),
        };
        await repository.InsertSamplesAsync(samples);

        var events = Enumerable.Range(0, 5)
            .Select(i => NewEvent(now.AddMinutes(-5 + i), $"E{i}"))
            .ToList();
        await repository.InsertEventsAsync(events);

        // Age prune removes the two older samples.
        var first = await service.PruneAsync(now);
        Assert.Null(first.Error);
        Assert.True(first.Deleted >= 2);

        var remaining = await repository.QuerySamplesAsync(
            new TelemetrySampleQuery(EquipmentId: "cnc-1", SignalId: "cnc.spindle.speed", Limit: 100), 100);
        // Per-signal cap 2 keeps the newest two.
        Assert.Equal(2, remaining.Count);
        Assert.Equal(5, remaining[0].NumericValue);
        Assert.Equal(4, remaining[1].NumericValue);

        var remainingEvents = await repository.QueryEventsAsync(new HistorizedEventQuery(Limit: 100), 100);
        Assert.Equal(2, remainingEvents.Count);
        Assert.Equal("E4", remainingEvents[0].Code);
        Assert.Equal("E3", remainingEvents[1].Code);
    }

    [Fact]
    public async Task Bounded_growth_keeps_on_change_signals_flat_and_reports_storage()
    {
        var context = _fx.CreateContext();
        var repository = _fx.CreateRepository(context);
        var service = _fx.CreateService(context, new HistorianOptions
        {
            Enabled = true,
            DefaultSamplingMode = "on-change",
            MaxBatchSize = 5000,
            MaxSamplesPerMinutePerSource = 1_000_000,
            MaxBatchesPerMinutePerSource = 10_000,
        });

        var t0 = DateTime.UtcNow.AddMinutes(-5);
        var batches = new List<IngestTelemetrySampleRequest>();
        for (var i = 0; i < 2000; i++)
        {
            // An unchanging value: on-change sampling must keep exactly one document.
            batches.Add(Sample("cnc-1", "cnc.spindle.speed", t0.AddMilliseconds(i * 10), 1000));
        }

        var result = await service.IngestTelemetryAsync(Batch([.. batches]), null);
        Assert.Equal("accepted", result.Status);

        var count = await repository.CountSamplesAsync(new TelemetrySampleQuery());
        Assert.Equal(1, count);
        Assert.Equal(1999, result.Dropped);

        // Changing values are recorded one-for-one, still bounded by the source.
        var changing = new List<IngestTelemetrySampleRequest>();
        for (var i = 0; i < 300; i++)
            changing.Add(Sample("robot-1", "robot.joint1.position", t0.AddMilliseconds(i * 20), i * 0.01));
        var changingResult = await service.IngestTelemetryAsync(Batch([.. changing]), null);
        Assert.Equal(300, changingResult.Accepted);

        var storage = await service.GetStatusAsync();
        Assert.Equal(301, storage.SampleDocumentCount);
        Assert.True(storage.EstimatedStorageBytes > 0, "storage estimate must be positive once documents exist");
        _output.WriteLine($"stored={storage.SampleDocumentCount} estimatedStorageBytes={storage.EstimatedStorageBytes}");
    }

    [Fact]
    public async Task Migration_keeps_representative_existing_documents_readable()
    {
        var context = _fx.CreateContext();
        var repository = _fx.CreateRepository(context);

        // A representative pre-S40 document (schema 0.9) written with raw BSON, as an existing
        // deployment would contain it. The compatibility reader must still return it.
        var raw = context.TelemetrySamples.Database.GetCollection<BsonDocument>("telemetrySamples");
        await raw.InsertOneAsync(new BsonDocument
        {
            { "SchemaVersion", "0.9" },
            { "TimestampUtc", DateTime.UtcNow.AddMinutes(-1) },
            { "EquipmentId", "cnc-1" },
            { "SignalId", "legacy.signal" },
            { "NumericValue", 3.5 },
            { "ValueType", "Float" },
            { "Quality", "Good" },
            { "Source", "Simulated" },
            { "Origin", "Simulation" },
        });

        var stored = await repository.QuerySamplesAsync(
            new TelemetrySampleQuery(EquipmentId: "cnc-1", SignalId: "legacy.signal"), 100);

        Assert.Single(stored);
        Assert.Equal("0.9", stored[0].SchemaVersion);
        Assert.Equal(3.5, stored[0].NumericValue);
        Assert.Equal(SignalQuality.Good, stored[0].Quality);

        // New documents are written with the current schema version and remain readable together.
        await repository.InsertSamplesAsync([NewSample("cnc-1", "legacy.signal", DateTime.UtcNow, 4.0)]);
        var mixed = await repository.QuerySamplesAsync(
            new TelemetrySampleQuery(EquipmentId: "cnc-1", SignalId: "legacy.signal"), 100);
        Assert.Equal(2, mixed.Count);
        Assert.Contains(mixed, s => s.SchemaVersion == HistorianSchema.Version);
        Assert.Contains(mixed, s => s.SchemaVersion == "0.9");
    }

    [Fact]
    public async Task Malformed_oversized_and_rate_abusive_input_is_rejected_with_diagnostics()
    {
        var context = _fx.CreateContext();
        var service = _fx.CreateService(context, new HistorianOptions
        {
            Enabled = true,
            MaxBatchSize = 2,
            MaxSamplesPerMinutePerSource = 3,
            MaxBatchesPerMinutePerSource = 100,
        });

        var oversized = await service.IngestTelemetryAsync(Batch(
            Sample("cnc-1", "a", DateTime.UtcNow, 1),
            Sample("cnc-1", "a", DateTime.UtcNow, 2),
            Sample("cnc-1", "a", DateTime.UtcNow, 3)), null);
        Assert.Equal("rejected", oversized.Status);
        Assert.Contains(oversized.Diagnostics, d => d.Contains("exceeds"));

        var malformed = await service.IngestTelemetryAsync(Batch(
            Sample("", "a", DateTime.UtcNow, 1),
            Sample("cnc-1", "", DateTime.UtcNow, 1)), null);
        Assert.Equal(0, malformed.Accepted);
        Assert.Equal(2, malformed.Rejected);
        Assert.Contains(malformed.Diagnostics, d => d.Contains("required"));

        var rateAbusive = await service.IngestTelemetryAsync(Batch(
            Sample("cnc-2", "b", DateTime.UtcNow, 1),
            Sample("cnc-2", "b", DateTime.UtcNow, 2)), null);
        Assert.Equal("rate-limited", rateAbusive.Status);
        Assert.Contains(rateAbusive.Diagnostics, d => d.Contains("samples/minute"));
    }

    [Fact]
    public async Task Disabled_historian_stores_nothing_and_queries_return_empty()
    {
        var context = _fx.CreateContext();
        var repository = _fx.CreateRepository(context);
        var service = _fx.CreateService(context, new HistorianOptions { Enabled = false });

        var ingest = await service.IngestTelemetryAsync(Batch(
            Sample("cnc-1", "a", DateTime.UtcNow, 1)), null);
        Assert.False(ingest.Enabled);
        Assert.Equal(0, ingest.Accepted);
        Assert.Equal("disabled", ingest.Status);
        Assert.Equal(0, await repository.CountSamplesAsync(new TelemetrySampleQuery()));

        var page = await service.QuerySamplesAsync(new TelemetrySampleQuery());
        Assert.Empty(page.Items);

        var status = await service.GetStatusAsync();
        Assert.False(status.Enabled);
        Assert.False(status.RetentionEnabled);
        Assert.Equal(0, status.SampleDocumentCount);
    }

    [Fact]
    public async Task Performance_records_ingestion_throughput_and_query_latency_on_a_representative_dataset()
    {
        var context = _fx.CreateContext();
        var repository = _fx.CreateRepository(context);
        var service = _fx.CreateService(context, new HistorianOptions
        {
            Enabled = true,
            DefaultSamplingMode = "on-change-or-periodic",
            DefaultSamplingIntervalMilliseconds = 1,
            MaxSamplesPerMinutePerSource = 10_000_000,
            MaxBatchesPerMinutePerSource = 1_000_000,
        });
        await service.EnsureIndexesAsync();

        const int totalSamples = 20_000;
        const int batchSize = 500;
        const int signalCount = 20;
        var t0 = DateTime.UtcNow.AddHours(-4);

        var stopwatch = Stopwatch.StartNew();
        var accepted = 0;
        for (var offset = 0; offset < totalSamples; offset += batchSize)
        {
            var samples = new List<IngestTelemetrySampleRequest>(batchSize);
            for (var i = 0; i < batchSize; i++)
            {
                var index = offset + i;
                samples.Add(Sample(
                    $"equipment-{index % signalCount}",
                    $"signal.{index % signalCount}",
                    t0.AddMilliseconds(index * 100.0 / signalCount),
                    index));
            }
            var result = await service.IngestTelemetryAsync(Batch([.. samples]), null);
            accepted += result.Accepted;
        }
        stopwatch.Stop();

        var throughput = accepted / Math.Max(0.001, stopwatch.Elapsed.TotalSeconds);
        _output.WriteLine(
            $"ingested={accepted}/{totalSamples} in {stopwatch.Elapsed.TotalMilliseconds:F0} ms => {throughput:F0} samples/s");

        Assert.True(accepted > totalSamples / 2, "most representative samples must be stored");
        Assert.True(throughput > 100, $"ingestion throughput {throughput:F0} samples/s is below the documented floor");

        var latency = new List<double>();
        for (var i = 0; i < 50; i++)
        {
            var query = new TelemetrySampleQuery(
                EquipmentId: $"equipment-{i % signalCount}",
                SignalId: $"signal.{i % signalCount}",
                FromUtc: t0,
                ToUtc: t0.AddHours(4),
                Limit: 100);
            var sw = Stopwatch.StartNew();
            var page = await service.QuerySamplesAsync(query);
            sw.Stop();
            Assert.NotEmpty(page.Items);
            latency.Add(sw.Elapsed.TotalMilliseconds);
        }

        latency.Sort();
        var p95 = latency[(int)Math.Floor((latency.Count - 1) * 0.95)];
        _output.WriteLine(
            $"query latency ms: p50={latency[latency.Count / 2]:F2} p95={p95:F2} max={latency[^1]:F2} over {latency.Count} runs");

        var storage = await service.GetStatusAsync();
        _output.WriteLine($"storedDocuments={storage.SampleDocumentCount} estimatedStorageBytes={storage.EstimatedStorageBytes}");
        Assert.True(p95 < 500, $"p95 query latency {p95:F2} ms exceeds the documented 500 ms bound on the representative dataset");
    }

    [Fact]
    public async Task Reference_cell_session_batch_is_ingested_queried_and_mapped_to_timeline_kinds()
    {
        var context = _fx.CreateContext();
        var repository = _fx.CreateRepository(context);
        var service = _fx.CreateService(context);
        await service.EnsureIndexesAsync();

        var sessionId = "reference-cell-session-1";
        var t0 = DateTime.UtcNow.AddSeconds(-30);
        var referenceSignals = new (string EquipmentId, string SignalId, double Value)[]
        {
            ("robot-1", "robot.joint1.position", 0.5),
            ("cnc-1", "cnc.spindle.speed", 1450),
            ("cnc-1", "cnc.door.closed", 1),
            ("conveyor-1", "conveyor.speed", 0.2),
            ("safety-1", "safety.estop", 0),
        };

        var batch = new IngestTelemetryBatchRequest
        {
            SourceId = "reference-cell-simulator",
            Samples = referenceSignals
                .Select((signal, index) => Sample(
                    signal.EquipmentId, signal.SignalId, t0.AddMilliseconds(index * 100), signal.Value,
                    sessionId: sessionId, correlationId: $"reference-{index}"))
                .ToList(),
        };

        var ingest = await service.IngestTelemetryAsync(batch, null);
        Assert.Equal(5, ingest.Accepted);

        var stored = await service.QuerySamplesAsync(new TelemetrySampleQuery(SessionId: sessionId));
        Assert.Equal(5, stored.TotalCount);
        Assert.Contains(stored.Items, s => s.SignalId == "cnc.spindle.speed" && s.NumericValue == 1450);

        var events = await service.IngestEventsAsync(new IngestHistorizedEventBatchRequest
        {
            SourceId = "reference-cell-simulator",
            Events =
            [
                Event("state-transition", t0.AddSeconds(1), "info", "STATE.LOAD", "robot-1", sessionId),
                Event("alarm", t0.AddSeconds(2), "warning", "CNC.DOOR", "cnc-1", sessionId),
                Event("fault-action", t0.AddSeconds(3), "info", "FAULT.RETRY", "cnc-1", sessionId),
            ],
        }, null);
        Assert.Equal(3, events.Accepted);

        var transitions = await service.QueryEventsAsync(new HistorizedEventQuery(Kind: HistorianEventKind.StateTransition));
        var faults = await service.QueryEventsAsync(new HistorizedEventQuery(Kind: HistorianEventKind.Fault));
        Assert.Single(transitions.Items);
        Assert.Single(faults.Items);
        Assert.Equal(5, await repository.CountSamplesAsync(new TelemetrySampleQuery(SessionId: sessionId)));
    }

    private static TelemetrySample NewSample(string equipmentId, string signalId, DateTime timestampUtc, double value) => new()
    {
        TimestampUtc = timestampUtc,
        EquipmentId = equipmentId,
        SignalId = signalId,
        NumericValue = value,
        ValueType = SignalDataType.Float,
        Quality = SignalQuality.Good,
        Source = SignalSource.Simulated,
        Origin = SignalOrigin.Simulation,
    };

    private static HistorizedEvent NewEvent(DateTime timestampUtc, string code) => new()
    {
        TimestampUtc = timestampUtc,
        Kind = HistorianEventKind.Event,
        Severity = "info",
        Code = code,
        Payload = """{"detail":"seed"}""",
        Source = "simulation",
    };
}
