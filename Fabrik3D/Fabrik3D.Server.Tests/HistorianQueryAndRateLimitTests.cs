using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Server.Services;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for historian rate limiting and deterministic query building (S40). These do not
/// require MongoDB.
/// </summary>
public class HistorianQueryAndRateLimitTests
{
    private static readonly DateTime Now = new(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Rate_limiter_allows_within_the_window_and_rejects_above_it()
    {
        var limiter = new HistorianRateLimiter();

        Assert.True(limiter.TryConsume("sim-1", 10, 2, 100, Now).Allowed);
        Assert.True(limiter.TryConsume("sim-1", 10, 2, 100, Now.AddSeconds(1)).Allowed);

        var batches = limiter.TryConsume("sim-1", 10, 2, 100, Now.AddSeconds(2));
        Assert.False(batches.Allowed);
        Assert.Contains("batches/minute", batches.Reason);

        var samples = limiter.TryConsume("sim-2", 101, 100, 100, Now);
        Assert.False(samples.Allowed);
        Assert.Contains("samples/minute", samples.Reason);
    }

    [Fact]
    public void Rate_limiter_resets_after_a_minute_and_evicts_idle_sources()
    {
        var limiter = new HistorianRateLimiter();
        Assert.True(limiter.TryConsume("sim-1", 100, 1, 0, Now).Allowed);
        Assert.False(limiter.TryConsume("sim-1", 1, 1, 0, Now.AddSeconds(30)).Allowed);
        Assert.True(limiter.TryConsume("sim-1", 1, 1, 0, Now.AddSeconds(61)).Allowed);

        Assert.Equal(1, limiter.TrackedSourceCount);
        limiter.EvictExpired(Now.AddMinutes(10));
        Assert.Equal(0, limiter.TrackedSourceCount);
    }

    [Fact]
    public void Page_window_is_clamped_to_documented_bounds()
    {
        Assert.Equal((0, 100), HistorianQueryBuilder.NormalizePage(-5, 100, 500));
        Assert.Equal((10, 500), HistorianQueryBuilder.NormalizePage(10, 99999, 500));
        Assert.Equal((3, 1), HistorianQueryBuilder.NormalizePage(3, 0, 500));
    }

    [Fact]
    public void Telemetry_filter_contains_every_requested_predicate()
    {
        var filter = HistorianQueryBuilder.BuildTelemetryFilter(new TelemetrySampleQuery(
            SessionId: "session-1",
            EquipmentId: "cnc-1",
            SignalId: "cnc.spindle.speed",
            FromUtc: Now.AddHours(-1),
            ToUtc: Now,
            Quality: SignalQuality.Good,
            Source: SignalSource.Simulated,
            CorrelationId: "corr-1"));

        var rendered = Render(filter);
        var json = rendered.ToJson();

        Assert.Contains("SessionId", json);
        Assert.Contains("EquipmentId", json);
        Assert.Contains("SignalId", json);
        Assert.Contains("TimestampUtc", json);
        Assert.Contains("$gte", json);
        Assert.Contains("$lte", json);
        Assert.Contains("Quality", json);
        Assert.Contains("Source", json);
        Assert.Contains("CorrelationId", json);
    }

    [Fact]
    public void Empty_telemetry_filter_renders_to_an_empty_document()
    {
        var rendered = Render(HistorianQueryBuilder.BuildTelemetryFilter(new TelemetrySampleQuery()));
        Assert.Empty(rendered);
    }

    [Fact]
    public void Event_filter_contains_kind_severity_and_time_predicates()
    {
        var filter = HistorianQueryBuilder.BuildEventFilter(new HistorizedEventQuery(
            SessionId: "session-1",
            Kind: HistorianEventKind.Alarm,
            Severity: "critical",
            Code: "A001",
            FromUtc: Now.AddHours(-2),
            ToUtc: Now));

        var json = Render(filter).ToJson();

        Assert.Contains("Kind", json);
        Assert.Contains("Alarm", json);
        Assert.Contains("Severity", json);
        Assert.Contains("Code", json);
        Assert.Contains("TimestampUtc", json);
    }

    private static BsonDocument Render<T>(MongoDB.Driver.FilterDefinition<T> filter) =>
        filter.Render(new MongoDB.Driver.RenderArgs<T>(
            BsonSerializer.SerializerRegistry.GetSerializer<T>(),
            BsonSerializer.SerializerRegistry));
}
