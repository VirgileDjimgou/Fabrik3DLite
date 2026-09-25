using Fabrik3D.Infrastructure.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Creates the historian indexes at startup and periodically runs the retention pruner (S40),
/// following the existing hosted-service pattern. Both steps are idempotent; a failure is logged
/// and never breaks live orchestration.
/// </summary>
public class HistorianRetentionService : BackgroundService
{
    private readonly HistorianService _historian;
    private readonly HistorianOptions _options;
    private readonly ILogger<HistorianRetentionService> _log;

    public HistorianRetentionService(
        HistorianService historian,
        IOptions<HistorianOptions> options,
        ILogger<HistorianRetentionService> log)
    {
        _historian = historian;
        _options = options.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            _log.LogInformation("[Historian] disabled; retention service idle");
            return;
        }

        try
        {
            await _historian.EnsureIndexesAsync(stoppingToken);
            _log.LogInformation("[Historian] indexes ensured");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogError(ex, "[Historian] index creation failed; queries may be slower but remain correct");
        }

        if (!_options.RetentionEnabled)
        {
            _log.LogInformation("[Historian] retention disabled; pruner idle");
            return;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, _options.RetentionCheckIntervalMinutes));
        using var timer = new PeriodicTimer(interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var result = await _historian.PruneAsync(DateTime.UtcNow, stoppingToken);
            if (result.Error is not null)
            {
                _log.LogWarning("[Historian] prune pass reported: {Error}", result.Error);
            }
        }
    }
}
