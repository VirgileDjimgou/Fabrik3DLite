namespace Fabrik3D.Server.Observability;

/// <summary>
/// Observability configuration (section <c>"Observability"</c>, S49).
/// </summary>
/// <remarks>
/// Structured logs and in-process metrics/traces are always cheap and stay enabled by default so a
/// deployment is diagnosable out of the box. External export is <b>disabled by default</b>: no OTLP
/// endpoint, no collector and no network dependency is required for an on-prem install. The metrics
/// endpoint is authenticated and can be turned off entirely.
/// </remarks>
public sealed class Fabrik3DObservabilityOptions
{
    public const string SectionName = "Observability";

    /// <summary>Master switch for in-process traces, metrics and log enrichment.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Exposes the read-only Prometheus/JSON metrics snapshot endpoint. Authenticated.</summary>
    public bool MetricsEndpointEnabled { get; set; } = true;

    /// <summary>
    /// External exporter. Supported values: <c>None</c> (default) and <c>Console</c> (writes periodic
    /// snapshots through the logger for local diagnosis). <c>Otlp</c> is documented as wiring the
    /// framework-compatible OTLP exporter at deployment time; it is not enabled here so on-prem
    /// installs never require an external dependency.
    /// </summary>
    public string Exporter { get; set; } = Exporters.None;

    /// <summary>Optional OTLP endpoint hint recorded in the status endpoint for operators.</summary>
    public string? OtlpEndpoint { get; set; }

    /// <summary>Interval, in seconds, for console exporter snapshots when <see cref="Exporter"/> is Console.</summary>
    public int ConsoleExportIntervalSeconds { get; set; } = 60;

    /// <summary>Maximum number of distinct metric series retained in memory (bounded; prevents unbounded growth).</summary>
    public int MaxSeries { get; set; } = 500;

    /// <summary>
    /// Per-client, per-minute rate limit for simulator performance reports accepted by the
    /// diagnostics surface. Bounds a compromised or runaway client; the endpoint is a no-op when
    /// observability is disabled, so rejection is never a functional failure.
    /// </summary>
    public int SimulatorMetricsRateLimitPerMinute { get; set; } = 120;

    public static class Exporters
    {
        public const string None = "None";
        public const string Console = "Console";
        public const string Otlp = "Otlp";
    }

    public bool ResolveEnabled() => Enabled;

    public string NormalizedExporter()
    {
        var value = string.IsNullOrWhiteSpace(Exporter) ? Exporters.None : Exporter.Trim();
        return Exporters.None.Equals(value, StringComparison.OrdinalIgnoreCase) ? Exporters.None
            : Exporters.Console.Equals(value, StringComparison.OrdinalIgnoreCase) ? Exporters.Console
            : Exporters.Otlp.Equals(value, StringComparison.OrdinalIgnoreCase) ? Exporters.Otlp
            : Exporters.None;
    }
}
