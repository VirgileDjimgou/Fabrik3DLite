using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Tenancy;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// One-time tenancy bootstrap (S43): ensures the deterministic default organization exists, creates
/// the tenant indexes, then runs the idempotent legacy-data migration. Failures are logged and never
/// stop the host: single-organization deployments keep working through the compatibility readers.
/// </summary>
public sealed class TenancyBootstrapService : IHostedService
{
    private readonly OrganizationRepository _organizations;
    private readonly TenantIndexInitializer _indexes;
    private readonly TenantMigrationService _migration;
    private readonly IOptions<TenancyOptions> _options;
    private readonly ILogger<TenancyBootstrapService> _log;

    public TenancyBootstrapService(
        OrganizationRepository organizations,
        TenantIndexInitializer indexes,
        TenantMigrationService migration,
        IOptions<TenancyOptions> options,
        ILogger<TenancyBootstrapService> log)
    {
        _organizations = organizations;
        _indexes = indexes;
        _migration = migration;
        _options = options;
        _log = log;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Value.Enabled) return;

        try
        {
            var organization = await _organizations.EnsureDefaultAsync();
            await _indexes.EnsureAllAsync(cancellationToken);
            var report = await _migration.MigrateAsync(cancellationToken);
            _log.LogInformation(
                "[Server][Tenancy] Bootstrap complete defaultOrganization={OrganizationId} alreadyMigrated={AlreadyMigrated} singleOrganization={SingleOrganization}",
                organization.Id, report.AlreadyMigrated, _options.Value.SingleOrganization);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "[Server][Tenancy] Bootstrap failed; compatibility readers keep the server usable.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
