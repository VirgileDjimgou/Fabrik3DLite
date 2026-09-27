using Fabrik3D.Infrastructure.Migrations;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Applies pending schema migrations once at startup. Failures are logged and never stop the host:
/// readiness reports the degraded dependency and the compatibility readers keep the server usable.
/// The runner is idempotent, so a restart after a partial failure simply resumes.
/// </summary>
public sealed class SchemaMigrationHostedService : IHostedService
{
    private readonly SchemaMigrationRunner _runner;
    private readonly ILogger<SchemaMigrationHostedService> _log;

    public SchemaMigrationHostedService(
        SchemaMigrationRunner runner,
        ILogger<SchemaMigrationHostedService> log)
    {
        _runner = runner;
        _log = log;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            var report = await _runner.RunAsync(cancellationToken);
            _log.LogInformation(
                "[Server][Migrations] Schema migrations complete applied={Applied} total={Total} alreadyUpToDate={UpToDate}",
                report.Applied.Count, report.TotalApplied, report.AlreadyUpToDate);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "[Server][Migrations] Schema migration pass failed; readiness will report the degraded dependency.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
