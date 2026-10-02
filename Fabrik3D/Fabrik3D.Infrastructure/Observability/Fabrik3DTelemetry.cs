using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace Fabrik3D.Infrastructure.Observability;

/// <summary>
/// Process-wide OpenTelemetry-compatible instrumentation primitives (S49).
/// </summary>
/// <remarks>
/// <para>
/// The <see cref="ActivitySource"/> and <see cref="Meter"/> APIs are the same primitives consumed by
/// the OpenTelemetry .NET SDK. Fabrik3D deliberately depends on the framework-provided
/// <c>System.Diagnostics.DiagnosticSource</c> rather than shipping an exporter: on-prem installs must
/// never require an external collector. A deployment that wants OpenTelemetry export wires the
/// standard OTLP exporter to the source/meter names below without any change to domain code.
/// </para>
/// <para>
/// Instrumentation is non-invasive: spans and instruments are additive and never change domain
/// semantics or the data that flows through the adapters.
/// </para>
/// </remarks>
public static class Fabrik3DTelemetry
{
    public const string ServiceName = "Fabrik3D.Server";
    public const string ServiceVersion = "1.0.0";

    /// <summary>Logical source for every Fabrik3D trace. OTel listeners subscribe to this name.</summary>
    public static readonly ActivitySource ActivitySource = new(ServiceName, ServiceVersion);

    /// <summary>Logical meter for every Fabrik3D metric. OTel listeners subscribe to this name.</summary>
    public static readonly Meter Meter = new(ServiceName, ServiceVersion);

    // ── Instrument names (stable; dashboards and alert rules depend on them) ──
    public const string ApiRequestCount = "fabrik3d.api.requests";
    public const string ApiRequestDuration = "fabrik3d.api.request.duration";
    public const string SignalRConnections = "fabrik3d.signalr.connections.active";
    public const string SignalRMessages = "fabrik3d.signalr.messages";
    public const string ConnectorReconnects = "fabrik3d.connector.reconnects";
    public const string ConnectorUpdates = "fabrik3d.connector.updates";
    public const string ConnectorWriteAttempts = "fabrik3d.connector.write.attempts";
    public const string SignalUpdates = "fabrik3d.signal.updates";
    public const string HistorianWrites = "fabrik3d.historian.writes";
    public const string HistorianWriteDuration = "fabrik3d.historian.write.duration";
    public const string AuthorityTransitions = "fabrik3d.authority.transitions";
    public const string SimulatorFrameDuration = "fabrik3d.simulator.frame.duration";
    public const string SimulatorDrawCalls = "fabrik3d.simulator.draw.calls";
    /// <summary>Bounded public-demo resets performed (S63), tagged by outcome.</summary>
    public const string DemoResets = "fabrik3d.demo.resets";

    // ── Span names ──
    public const string ApiRequestSpan = "fabrik3d.http.request";
    public const string SignalRSendSpan = "fabrik3d.signalr.send";
    public const string HistorianWriteSpan = "fabrik3d.historian.write";
    public const string ConnectorOperationSpan = "fabrik3d.connector.operation";

    /// <summary>Starts a span, returning <c>null</c> when nothing is listening (zero cost path).</summary>
    public static Activity? StartActivity(
        string name,
        ActivityKind kind = ActivityKind.Internal,
        IDictionary<string, object?>? tags = null)
    {
        var activity = ActivitySource.StartActivity(name, kind);
        if (activity is null || tags is null)
        {
            return activity;
        }

        foreach (var (key, value) in tags)
        {
            if (value is not null)
            {
                activity.SetTag(key, value);
            }
        }

        return activity;
    }
}
