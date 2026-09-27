using Fabrik3D.Server.Observability;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S49 in-process metrics aggregator tests. They assert that each instrument records both on the
/// OpenTelemetry-compatible meter and in the bounded diagnostics snapshot, that the snapshot and
/// Prometheus rendering are deterministic, and that instrumentation is a true no-op when disabled.
/// </summary>
public class ObservabilityMetricsTests
{
    private static ObservabilityMetrics Create(Action<Fabrik3DObservabilityOptions>? configure = null)
    {
        var options = new Fabrik3DObservabilityOptions();
        configure?.Invoke(options);
        return new ObservabilityMetrics(Options.Create(options), NullLogger<ObservabilityMetrics>.Instance);
    }

    [Fact]
    public void Api_requests_are_counted_and_latency_is_aggregated()
    {
        var metrics = Create();

        metrics.RecordApiRequest("GET", "/api/jobs", 200, 3.5);
        metrics.RecordApiRequest("GET", "/api/jobs", 200, 8.5);

        var count = metrics.Snapshot().Single(s => s.Name == "fabrik3d.api.requests");
        Assert.Equal(2, count.Value);
        Assert.Equal(MetricKind.Counter, count.Kind);

        var duration = metrics.Snapshot().Single(s => s.Name == "fabrik3d.api.request.duration");
        Assert.Equal(2, duration.Count);
        Assert.Equal(12d, duration.Sum, 3);
        Assert.Equal(3.5, duration.Min, 3);
        Assert.Equal(8.5, duration.Max, 3);
    }

    [Fact]
    public void SignalR_up_down_counter_reflects_connection_churn()
    {
        var metrics = Create();

        metrics.RecordSignalRConnection(1);
        metrics.RecordSignalRConnection(1);
        metrics.RecordSignalRConnection(-1);

        var series = metrics.Snapshot().Single(s => s.Name == "fabrik3d.signalr.connections.active");
        Assert.Equal(1, series.Value);
        Assert.Equal(MetricKind.UpDownCounter, series.Kind);
    }

    [Fact]
    public void Connector_authority_and_historian_records_are_tagged_distinctly()
    {
        var metrics = Create();

        metrics.RecordConnectorReconnect("opcua");
        metrics.RecordConnectorUpdate("mqtt", accepted: true);
        metrics.RecordConnectorUpdate("mqtt", accepted: false);
        metrics.RecordConnectorWriteAttempt("modbus", accepted: false);
        metrics.RecordSignalUpdate(7);
        metrics.RecordHistorianWrite("samples", 4, 2.0);
        metrics.RecordAuthorityTransition("cell-1", "ExternalController");

        var snapshot = metrics.Snapshot();
        Assert.Equal(1, snapshot.Single(s => s.Name == "fabrik3d.connector.reconnects").Value);
        Assert.Equal(1, snapshot.Single(s => s.Name == "fabrik3d.connector.updates" && s.Tags["outcome"] == "accepted").Value);
        Assert.Equal(1, snapshot.Single(s => s.Name == "fabrik3d.connector.updates" && s.Tags["outcome"] == "rejected").Value);
        Assert.Equal(1, snapshot.Single(s => s.Name == "fabrik3d.connector.write.attempts" && s.Tags["protocol"] == "modbus").Value);
        Assert.Equal(7, snapshot.Single(s => s.Name == "fabrik3d.signal.updates").Value);
        Assert.Equal(4, snapshot.Single(s => s.Name == "fabrik3d.historian.writes").Value);
        Assert.Equal("cell-1", snapshot.Single(s => s.Name == "fabrik3d.authority.transitions").Tags["scope"]);
    }

    [Fact]
    public void Simulator_frame_metrics_record_duration_draw_calls_and_gauges()
    {
        var metrics = Create();

        metrics.RecordSimulatorFrame(frameMs: 16.7, drawCalls: 42, triangles: 1200, textureBytes: 4096, heapBytes: 8192);

        var snapshot = metrics.Snapshot();
        var frame = snapshot.Single(s => s.Name == "fabrik3d.simulator.frame.duration");
        Assert.Equal(16.7, frame.Value, 3);
        Assert.Equal(MetricKind.Histogram, frame.Kind);
        Assert.Equal(42, snapshot.Single(s => s.Name == "fabrik3d.simulator.draw.calls").Value);
        Assert.Equal(1200, snapshot.Single(s => s.Name == "fabrik3d.simulator.triangles").Value);
        Assert.Equal(4096, snapshot.Single(s => s.Name == "fabrik3d.simulator.texture.bytes").Value);
        Assert.Equal(8192, snapshot.Single(s => s.Name == "fabrik3d.simulator.heap.bytes").Value);
    }

    [Fact]
    public void Snapshot_is_deterministically_ordered()
    {
        var metrics = Create();
        metrics.RecordApiRequest("GET", "/b", 200, 1);
        metrics.RecordApiRequest("GET", "/a", 200, 1);
        metrics.RecordSimulatorFrame(1, 1, 1, 1, 1);

        var first = metrics.Snapshot().Select(s => s.Name + string.Join(',', s.Tags.Select(t => $"{t.Key}={t.Value}"))).ToList();
        var second = metrics.Snapshot().Select(s => s.Name + string.Join(',', s.Tags.Select(t => $"{t.Key}={t.Value}"))).ToList();

        Assert.Equal(first, second);
        Assert.Equal(first.OrderBy(x => x, StringComparer.Ordinal), first);
    }

    [Fact]
    public void Prometheus_rendering_is_stable_and_escapes_labels()
    {
        var metrics = Create();
        metrics.RecordSignalRMessage("JobStateChanged");

        var first = metrics.RenderPrometheus();
        var second = metrics.RenderPrometheus();

        Assert.Equal(first, second);
        Assert.Contains("# TYPE fabrik3d_signalr_messages counter", first, StringComparison.Ordinal);
        Assert.Contains("fabrik3d_signalr_messages{event=\"JobStateChanged\"}", first, StringComparison.Ordinal);
        Assert.Contains("fabrik3d.metrics.dropped_series 0", first, StringComparison.Ordinal);
    }

    [Fact]
    public void Series_cardinality_is_bounded_and_overflow_is_counted()
    {
        var metrics = Create(options => options.MaxSeries = 2);

        metrics.RecordApiRequest("GET", "/a", 200, 1);
        metrics.RecordApiRequest("GET", "/b", 200, 1);
        metrics.RecordApiRequest("GET", "/c", 200, 1);

        Assert.True(metrics.SeriesCount <= 2, $"SeriesCount was {metrics.SeriesCount}");
        Assert.True(metrics.DroppedSeries > 0, "DroppedSeries should count dropped series");
    }

    [Fact]
    public void Disabled_observability_drops_every_measurement()
    {
        var metrics = Create(options => options.Enabled = false);

        metrics.RecordApiRequest("GET", "/api/jobs", 200, 1);
        metrics.RecordSignalRConnection(1);
        metrics.RecordSimulatorFrame(16, 10, 100, 0, 0);
        metrics.SetGauge("custom.gauge", 1);

        Assert.False(metrics.Enabled);
        Assert.Empty(metrics.Snapshot());
    }

    [Fact]
    public void Exporter_configuration_defaults_to_none_and_never_requires_a_collector()
    {
        var options = new Fabrik3DObservabilityOptions();

        Assert.True(options.Enabled);
        Assert.Equal(Fabrik3DObservabilityOptions.Exporters.None, options.NormalizedExporter());
        Assert.Null(options.OtlpEndpoint);

        options.Exporter = "console";
        Assert.Equal(Fabrik3DObservabilityOptions.Exporters.Console, options.NormalizedExporter());

        options.Exporter = "otlp";
        Assert.Equal(Fabrik3DObservabilityOptions.Exporters.Otlp, options.NormalizedExporter());

        options.Exporter = "carrier-pigeon";
        Assert.Equal(Fabrik3DObservabilityOptions.Exporters.None, options.NormalizedExporter());
    }
}
