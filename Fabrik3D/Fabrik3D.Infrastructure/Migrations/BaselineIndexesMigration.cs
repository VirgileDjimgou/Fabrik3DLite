using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Migrations;

/// <summary>
/// Baseline migration (0001): ensures the documented core indexes exist. It is additive and
/// idempotent — running it against an existing repository dataset creates only the missing indexes
/// and never modifies documents. Index names match the tenancy initializer so the two paths are
/// interchangeable.
/// </summary>
public sealed class BaselineIndexesMigration : ISchemaMigration
{
    public string Version => "0001";

    public string Name => "baseline-core-indexes";

    public async Task ApplyAsync(MongoDbContext context, CancellationToken cancellationToken)
    {
        await context.Jobs.Indexes.CreateOneAsync(
            new CreateIndexModel<Job>(
                Builders<Job>.IndexKeys
                    .Ascending(j => j.OrganizationId)
                    .Descending(j => j.CreatedAtUtc),
                new CreateIndexOptions { Name = "organization_created" }),
            cancellationToken: cancellationToken);

        await context.Tasks.Indexes.CreateOneAsync(
            new CreateIndexModel<MachiningTask>(
                Builders<MachiningTask>.IndexKeys
                    .Ascending(t => t.OrganizationId)
                    .Ascending(t => t.JobId),
                new CreateIndexOptions { Name = "organization_job" }),
            cancellationToken: cancellationToken);

        await context.SimulationSessions.Indexes.CreateOneAsync(
            new CreateIndexModel<SimulationSession>(
                Builders<SimulationSession>.IndexKeys
                    .Ascending(s => s.OrganizationId)
                    .Descending(s => s.StartedAtUtc),
                new CreateIndexOptions { Name = "organization_started" }),
            cancellationToken: cancellationToken);

        await context.Alarms.Indexes.CreateOneAsync(
            new CreateIndexModel<Alarm>(
                Builders<Alarm>.IndexKeys
                    .Ascending(a => a.OrganizationId)
                    .Descending(a => a.CreatedAtUtc),
                new CreateIndexOptions { Name = "organization_created" }),
            cancellationToken: cancellationToken);

        await context.OperatorMessages.Indexes.CreateOneAsync(
            new CreateIndexModel<OperatorMessage>(
                Builders<OperatorMessage>.IndexKeys
                    .Ascending(m => m.OrganizationId)
                    .Descending(m => m.CreatedAtUtc),
                new CreateIndexOptions { Name = "organization_created" }),
            cancellationToken: cancellationToken);

        await context.CellTemplates.Indexes.CreateOneAsync(
            new CreateIndexModel<CellTemplate>(
                Builders<CellTemplate>.IndexKeys
                    .Ascending(t => t.OrganizationId)
                    .Ascending(t => t.Name),
                new CreateIndexOptions { Name = "organization_name" }),
            cancellationToken: cancellationToken);
    }
}
