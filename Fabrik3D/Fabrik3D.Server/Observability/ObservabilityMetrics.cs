using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Globalization;
using System.Text;
using Fabrik3D.Infrastructure.Observability;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Observability;

/// <summary>Type of an aggregated metric family.</summary>
public enum MetricKind
{
    Counter,
    UpDownCounter,
    Histogram,
    Gauge,
}

/// <summary>A single aggregated metric series (one instrument + one tag set).</summary>
public sealed record MetricSeries(
    string Name,
    MetricKind Kind,
    IReadOnlyDictionary<string, string> Tags,
    double Value,
    long Count,
    double Sum,
    double Min,
    double Max);

/// <summary>
/// In-process, bounded metrics aggregator (S49).
/// </summary>
/// <remarks>
/// <para>
/// Every record method updates two things: the OpenTelemetry-compatible instrument on
/// <see cref="Fabrik3DTelemetry.Meter"/> (so an external OTLP listener sees the measurement) and a
/// bounded, thread-safe aggregate used by the authenticated diagnostics endpoint. The aggregate is
/// intentionally small and in-memory: it must never need a database, network or external collector.
/// </para>
/// <para>
/// Instrumentation is best-effort and non-invasive. A metrics failure can never fail a domain
/// operation, which is why record methods are synchronous and allocation-light.
/// </para>
/// </remarks>
public sealed class ObservabilityMetrics
{
    private readonly Fabrik3DObservabilityOptions _options;
    private readonly ILogger<ObservabilityMetrics> _log;
    private readonly ConcurrentDictionary<string, SeriesState> _series = new(StringComparer.Ordinal);
    private long _droppedSeries;

    private readonly Counter<long> _apiRequests;
    private readonly Histogram<double> _apiDuration;
    private readonly UpDownCounter<long> _signalRConnections;
    private readonly Counter<long> _signalRMessages;
    private readonly Counter<long> _connectorReconnects;
    private readonly Counter<long> _connectorUpdates;
    private readonly Counter<long> _connectorWriteAttempts;
    private readonly Counter<long> _signalUpdates;
    private readonly Counter<long> _historianWrites;
    private readonly Histogram<double> _historianWriteDuration;
    private readonly Counter<long> _authorityTransitions;
    private readonly Histogram<double> _simulatorFrameDuration;
    private readonly Histogram<long> _simulatorDrawCalls;

    public ObservabilityMetrics(IOptions<Fabrik3DObservabilityOptions> options, ILogger<ObservabilityMetrics> log)
    {
        _options = options.Value;
        _log = log;

        _apiRequests = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.ApiRequestCount, "requests", "Total HTTP requests handled.");
        _apiDuration = Fabrik3DTelemetry.Meter.CreateHistogram<double>(
            Fabrik3DTelemetry.ApiRequestDuration, "ms", "HTTP request duration in milliseconds.");
        _signalRConnections = Fabrik3DTelemetry.Meter.CreateUpDownCounter<long>(
            Fabrik3DTelemetry.SignalRConnections, "connections", "Active SignalR connections.");
        _signalRMessages = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.SignalRMessages, "messages", "SignalR messages pushed to clients.");
        _connectorReconnects = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.ConnectorReconnects, "reconnects", "Connector reconnect attempts.");
        _connectorUpdates = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.ConnectorUpdates, "updates", "Connector signal updates by outcome.");
        _connectorWriteAttempts = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.ConnectorWriteAttempts, "writes", "Connector write attempts by outcome.");
        _signalUpdates = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.SignalUpdates, "updates", "Accepted signal mirror updates.");
        _historianWrites = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.HistorianWrites, "writes", "Historian documents written.");
        _historianWriteDuration = Fabrik3DTelemetry.Meter.CreateHistogram<double>(
            Fabrik3DTelemetry.HistorianWriteDuration, "ms", "Historian write duration in milliseconds.");
        _authorityTransitions = Fabrik3DTelemetry.Meter.CreateCounter<long>(
            Fabrik3DTelemetry.AuthorityTransitions, "transitions", "Control authority transitions.");
        _simulatorFrameDuration = Fabrik3DTelemetry.Meter.CreateHistogram<double>(
            Fabrik3DTelemetry.SimulatorFrameDuration, "ms", "Simulator reported frame duration.");
        _simulatorDrawCalls = Fabrik3DTelemetry.Meter.CreateHistogram<long>(
            Fabrik3DTelemetry.SimulatorDrawCalls, "drawcalls", "Simulator reported draw calls per frame.");
    }

    public bool Enabled => _options.Enabled;

    /// <summary>Number of distinct series retained; exposed for diagnostics and bounded-growth tests.</summary>
    public int SeriesCount => _series.Count;

    public long DroppedSeries => Interlocked.Read(ref _droppedSeries);

    // ── Recording API ──────────────────────────────────────────────────

    public void RecordApiRequest(string method, string route, int statusCode, double elapsedMs)
    {
        if (!_options.Enabled) return;
        var tags = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["method"] = method,
            ["route"] = route,
            ["status"] = statusCode.ToString(CultureInfo.InvariantCulture),
        };
        _apiRequests.Add(1, new KeyValuePair<string, object?>("method", method),
            new KeyValuePair<string, object?>("route", route),
            new KeyValuePair<string, object?>("status", statusCode));
        AddSeries(Fabrik3DTelemetry.ApiRequestCount, MetricKind.Counter, tags, 1);
        _apiDuration.Record(elapsedMs, new KeyValuePair<string, object?>("route", route));
        AddSeries(Fabrik3DTelemetry.ApiRequestDuration, MetricKind.Histogram, tags, elapsedMs);
    }

    public void RecordSignalRConnection(long delta)
    {
        if (!_options.Enabled) return;
        _signalRConnections.Add(delta);
        AddSeries(Fabrik3DTelemetry.SignalRConnections, MetricKind.UpDownCounter,
            EmptyTags, delta);
    }

    public void RecordSignalRMessage(string eventName)
    {
        if (!_options.Enabled) return;
        _signalRMessages.Add(1, new KeyValuePair<string, object?>("event", eventName));
        AddSeries(Fabrik3DTelemetry.SignalRMessages, MetricKind.Counter,
            new Dictionary<string, string>(StringComparer.Ordinal) { ["event"] = eventName }, 1);
    }

    public void RecordConnectorReconnect(string protocol)
    {
        if (!_options.Enabled) return;
        _connectorReconnects.Add(1, new KeyValuePair<string, object?>("protocol", protocol));
        AddSeries(Fabrik3DTelemetry.ConnectorReconnects, MetricKind.Counter,
            ProtocolTags(protocol), 1);
    }

    public void RecordConnectorUpdate(string protocol, bool accepted)
    {
        if (!_options.Enabled) return;
        _connectorUpdates.Add(1, new KeyValuePair<string, object?>("protocol", protocol),
            new KeyValuePair<string, object?>("outcome", accepted ? "accepted" : "rejected"));
        var tags = ProtocolTags(protocol);
        tags["outcome"] = accepted ? "accepted" : "rejected";
        AddSeries(Fabrik3DTelemetry.ConnectorUpdates, MetricKind.Counter, tags, 1);
    }

    public void RecordConnectorWriteAttempt(string protocol, bool accepted)
    {
        if (!_options.Enabled) return;
        _connectorWriteAttempts.Add(1, new KeyValuePair<string, object?>("protocol", protocol),
            new KeyValuePair<string, object?>("outcome", accepted ? "accepted" : "rejected"));
        var tags = ProtocolTags(protocol);
        tags["outcome"] = accepted ? "accepted" : "rejected";
        AddSeries(Fabrik3DTelemetry.ConnectorWriteAttempts, MetricKind.Counter, tags, 1);
    }

    public void RecordSignalUpdate(int count)
    {
        if (!_options.Enabled || count <= 0) return;
        _signalUpdates.Add(count);
        AddSeries(Fabrik3DTelemetry.SignalUpdates, MetricKind.Counter, EmptyTags, count);
    }

    public void RecordHistorianWrite(string kind, int count, double elapsedMs)
    {
        if (!_options.Enabled || count <= 0) return;
        _historianWrites.Add(count, new KeyValuePair<string, object?>("kind", kind));
        var tags = new Dictionary<string, string>(StringComparer.Ordinal) { ["kind"] = kind };
        AddSeries(Fabrik3DTelemetry.HistorianWrites, MetricKind.Counter, tags, count);
        _historianWriteDuration.Record(elapsedMs, new KeyValuePair<string, object?>("kind", kind));
        AddSeries(Fabrik3DTelemetry.HistorianWriteDuration, MetricKind.Histogram, tags, elapsedMs);
    }

    public void RecordAuthorityTransition(string scope, string mode)
    {
        if (!_options.Enabled) return;
        _authorityTransitions.Add(1, new KeyValuePair<string, object?>("scope", scope),
            new KeyValuePair<string, object?>("mode", mode));
        var tags = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["scope"] = scope,
            ["mode"] = mode,
        };
        AddSeries(Fabrik3DTelemetry.AuthorityTransitions, MetricKind.Counter, tags, 1);
    }

    public void RecordSimulatorFrame(double frameMs, long drawCalls, int triangles, long textureBytes, long heapBytes)
    {
        if (!_options.Enabled) return;
        _simulatorFrameDuration.Record(frameMs);
        AddSeries(Fabrik3DTelemetry.SimulatorFrameDuration, MetricKind.Histogram, EmptyTags, frameMs);
        _simulatorDrawCalls.Record(drawCalls);
        AddSeries(Fabrik3DTelemetry.SimulatorDrawCalls, MetricKind.Histogram, EmptyTags, drawCalls);

        SetGauge("fabrik3d.simulator.triangles", triangles);
        SetGauge("fabrik3d.simulator.texture.bytes", textureBytes);
        SetGauge("fabrik3d.simulator.heap.bytes", heapBytes);
    }

    /// <summary>Sets a last-value gauge (for exporter/simulator-reported measurements).</summary>
    public void SetGauge(string name, double value)
    {
        if (!_options.Enabled) return;
        AddSeries(name, MetricKind.Gauge, EmptyTags, value);
    }

    /// <summary>Immutable, deterministically ordered snapshot for diagnostics and tests.</summary>
    public IReadOnlyList<MetricSeries> Snapshot()
    {
        return _series.Values
            .Select(state => state.ToSeries())
            .OrderBy(series => series.Name, StringComparer.Ordinal)
            .ThenBy(series => RenderTags(series.Tags), StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Renders the snapshot in Prometheus text exposition format (version 0.0.4).</summary>
    public string RenderPrometheus(IEnumerable<MetricSeries>? additional = null)
    {
        var builder = new StringBuilder();
        var series = additional is null ? Snapshot() : Snapshot().Concat(additional).ToList();
        foreach (var seriesEntry in series)
        {
            var name = ToPrometheusName(seriesEntry.Name);
            builder.Append("# TYPE ").Append(name).Append(' ').Append(ToPrometheusType(seriesEntry.Kind)).Append('\n');
            builder.Append(name).Append(RenderTags(seriesEntry.Tags)).Append(' ').Append(Format(seriesEntry.Value)).Append('\n');
            if (seriesEntry.Kind == MetricKind.Histogram)
            {
                builder.Append(name).Append("_count").Append(RenderTags(seriesEntry.Tags)).Append(' ')
                    .Append(seriesEntry.Count.ToString(CultureInfo.InvariantCulture)).Append('\n');
                builder.Append(name).Append("_sum").Append(RenderTags(seriesEntry.Tags)).Append(' ')
                    .Append(Format(seriesEntry.Sum)).Append('\n');
            }
        }

        builder.Append("fabrik3d.metrics.dropped_series ").Append(DroppedSeries.ToString(CultureInfo.InvariantCulture)).Append('\n');
        return builder.ToString();
    }

    // ── Aggregation internals ──────────────────────────────────────────

    private static readonly IReadOnlyDictionary<string, string> EmptyTags =
        new Dictionary<string, string>(StringComparer.Ordinal);

    private static Dictionary<string, string> ProtocolTags(string protocol) =>
        new(StringComparer.Ordinal) { ["protocol"] = protocol };

    private void AddSeries(string name, MetricKind kind, IReadOnlyDictionary<string, string> tags, double value)
    {
        var key = name + "\u0001" + RenderTags(tags);
        if (_series.TryGetValue(key, out var state))
        {
            state.Add(kind, value);
            return;
        }

        var max = _options.MaxSeries > 0 ? _options.MaxSeries : 500;
        if (_series.Count >= max)
        {
            // Bounded cardinality: drop new series instead of growing without limit.
            if (Interlocked.Increment(ref _droppedSeries) == 1)
            {
                _log.LogWarning(
                    "[Server][Observability] Metric series limit ({Max}) reached; new series are dropped. " +
                    "Increase Observability:MaxSeries or reduce tag cardinality.", max);
            }
            return;
        }

        state = _series.GetOrAdd(key, _ => new SeriesState(name, kind, tags));
        state.Add(kind, value);
    }

    private static string Format(double value) => value.ToString("0.######", CultureInfo.InvariantCulture);

    private static string ToPrometheusName(string name) => name.Replace('.', '_').Replace('-', '_');

    private static string ToPrometheusType(MetricKind kind) => kind switch
    {
        MetricKind.Counter => "counter",
        MetricKind.UpDownCounter => "gauge",
        MetricKind.Histogram => "histogram",
        _ => "gauge",
    };

    private static string RenderTags(IReadOnlyDictionary<string, string> tags)
    {
        if (tags.Count == 0) return string.Empty;
        var builder = new StringBuilder("{");
        var first = true;
        foreach (var (key, value) in tags.OrderBy(pair => pair.Key, StringComparer.Ordinal))
        {
            if (!first) builder.Append(',');
            first = false;
            builder.Append(ToPrometheusName(key)).Append("=\"").Append(EscapeLabel(value)).Append('"');
        }
        return builder.Append('}').ToString();
    }

    private static string EscapeLabel(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);

    private sealed class SeriesState
    {
        private readonly object _gate = new();
        private double _value;
        private long _count;
        private double _sum;
        private double _min = double.PositiveInfinity;
        private double _max = double.NegativeInfinity;

        public SeriesState(string name, MetricKind kind, IReadOnlyDictionary<string, string> tags)
        {
            Name = name;
            Kind = kind;
            Tags = new Dictionary<string, string>(tags, StringComparer.Ordinal);
        }

        public string Name { get; }
        public MetricKind Kind { get; }
        public IReadOnlyDictionary<string, string> Tags { get; }

        public void Add(MetricKind kind, double value)
        {
            lock (_gate)
            {
                switch (kind)
                {
                    case MetricKind.Histogram:
                        _count += 1;
                        _sum += value;
                        _min = Math.Min(_min, value);
                        _max = Math.Max(_max, value);
                        _value = value;
                        break;
                    case MetricKind.Gauge:
                        _value = value;
                        _count += 1;
                        _sum += value;
                        _min = Math.Min(_min, value);
                        _max = Math.Max(_max, value);
                        break;
                    default:
                        _value += value;
                        _count += 1;
                        _sum += value;
                        break;
                }
            }
        }

        public MetricSeries ToSeries()
        {
            lock (_gate)
            {
                var min = double.IsPositiveInfinity(_min) ? 0 : _min;
                var max = double.IsNegativeInfinity(_max) ? 0 : _max;
                return new MetricSeries(Name, Kind, Tags, _value, _count, _sum, min, max);
            }
        }
    }
}
