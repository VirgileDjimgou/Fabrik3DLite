using Fabrik3D.Server.Observability;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Optional console exporter (S49). When <c>Observability:Exporter=Console</c> it periodically logs a
/// compact metrics snapshot so an operator can diagnose a local install without a collector. It is
/// disabled by default and never blocks startup or request handling.
/// </summary>
public sealed class ObservabilityConsoleExporter : BackgroundService
{
    private readonly ObservabilityMetrics _metrics;
    private readonly Fabrik3DObservabilityOptions _options;
    private readonly ILogger<ObservabilityConsoleExporter> _log;

    public ObservabilityConsoleExporter(
        ObservabilityMetrics metrics,
        Microsoft.Extensions.Options.IOptions<Fabrik3DObservabilityOptions> options,
        ILogger<ObservabilityConsoleExporter> log)
    {
        _metrics = metrics;
        _options = options.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled
            || !string.Equals(_options.NormalizedExporter(), Fabrik3DObservabilityOptions.Exporters.Console, StringComparison.Ordinal))
        {
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(_options.ConsoleExportIntervalSeconds, 5, 3600));
        using var timer = new PeriodicTimer(interval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
                _log.LogInformation(
                    "[Server][Observability] metrics\n{Snapshot}",
                    _metrics.RenderPrometheus());
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
