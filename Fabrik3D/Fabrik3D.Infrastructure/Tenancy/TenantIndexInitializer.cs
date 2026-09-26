using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Repositories;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Tenancy;

/// <summary>
/// Creates the documented tenant-scoped indexes (S43) so tenant filters never fall back to a full
/// collection scan. Idempotent and safe to run on every startup; existing indexes and documents are
/// preserved.
/// </summary>
public class TenantIndexInitializer
{
    private readonly MongoDbContext _ctx;
    private readonly OrganizationRepository _organizations;
    private readonly MembershipRepository _memberships;
    private readonly TrainingClassRepository _classes;
    private readonly TrainingResourceRepository _resources;
    private readonly TrainingSessionRepository _trainingSessions;
    private readonly TrainingActionRepository _trainingActions;

    public TenantIndexInitializer(
        MongoDbContext ctx,
        OrganizationRepository organizations,
        MembershipRepository memberships,
        TrainingClassRepository classes,
        TrainingResourceRepository resources,
        TrainingSessionRepository trainingSessions,
        TrainingActionRepository trainingActions)
    {
        _ctx = ctx;
        _organizations = organizations;
        _memberships = memberships;
        _classes = classes;
        _resources = resources;
        _trainingSessions = trainingSessions;
        _trainingActions = trainingActions;
    }

    /// <summary>Creates every tenant index. Returns the created/confirmed index names per collection.</summary>
    public async Task<Dictionary<string, List<string>>> EnsureAllAsync(CancellationToken ct = default)
    {
        await _organizations.EnsureIndexesAsync(ct);
        await _memberships.EnsureIndexesAsync(ct);
        await _classes.EnsureIndexesAsync(ct);
        await _resources.EnsureIndexesAsync(ct);
        await _trainingSessions.EnsureIndexesAsync(ct);
        await _trainingActions.EnsureIndexesAsync(ct);

        await _ctx.Jobs.Indexes.CreateOneAsync(
            new CreateIndexModel<Job>(
                Builders<Job>.IndexKeys
                    .Ascending(j => j.OrganizationId)
                    .Descending(j => j.CreatedAtUtc),
                new CreateIndexOptions { Name = "organization_created" }),
            cancellationToken: ct);

        await _ctx.Tasks.Indexes.CreateOneAsync(
            new CreateIndexModel<MachiningTask>(
                Builders<MachiningTask>.IndexKeys
                    .Ascending(t => t.OrganizationId)
                    .Ascending(t => t.JobId),
                new CreateIndexOptions { Name = "organization_job" }),
            cancellationToken: ct);

        await _ctx.SimulationSessions.Indexes.CreateOneAsync(
            new CreateIndexModel<SimulationSession>(
                Builders<SimulationSession>.IndexKeys
                    .Ascending(s => s.OrganizationId)
                    .Descending(s => s.StartedAtUtc),
                new CreateIndexOptions { Name = "organization_started" }),
            cancellationToken: ct);

        await _ctx.Alarms.Indexes.CreateOneAsync(
            new CreateIndexModel<Alarm>(
                Builders<Alarm>.IndexKeys
                    .Ascending(a => a.OrganizationId)
                    .Descending(a => a.CreatedAtUtc),
                new CreateIndexOptions { Name = "organization_created" }),
            cancellationToken: ct);

        await _ctx.OperatorMessages.Indexes.CreateOneAsync(
            new CreateIndexModel<OperatorMessage>(
                Builders<OperatorMessage>.IndexKeys
                    .Ascending(m => m.OrganizationId)
                    .Descending(m => m.CreatedAtUtc),
                new CreateIndexOptions { Name = "organization_created" }),
            cancellationToken: ct);

        await _ctx.CellTemplates.Indexes.CreateOneAsync(
            new CreateIndexModel<CellTemplate>(
                Builders<CellTemplate>.IndexKeys
                    .Ascending(t => t.OrganizationId)
                    .Ascending(t => t.Name),
                new CreateIndexOptions { Name = "organization_name" }),
            cancellationToken: ct);

        return new Dictionary<string, List<string>>
        {
            ["organizations"] = await _organizations.ListIndexNamesAsync(ct),
            ["memberships"] = await _memberships.ListIndexNamesAsync(ct),
            ["trainingClasses"] = await _classes.ListIndexNamesAsync(ct),
            ["trainingResourceAssignments"] = await _resources.ListIndexNamesAsync(ct),
            ["trainingSessions"] = await _trainingSessions.ListIndexNamesAsync(ct),
            ["trainingActions"] = await _trainingActions.ListIndexNamesAsync(ct),
            ["jobs"] = await ListNamesAsync(_ctx.Jobs, ct),
            ["tasks"] = await ListNamesAsync(_ctx.Tasks, ct),
            ["simulationSessions"] = await ListNamesAsync(_ctx.SimulationSessions, ct),
            ["alarms"] = await ListNamesAsync(_ctx.Alarms, ct),
            ["operatorMessages"] = await ListNamesAsync(_ctx.OperatorMessages, ct),
        };
    }

    private static async Task<List<string>> ListNamesAsync<T>(IMongoCollection<T> collection, CancellationToken ct)
    {
        var names = new List<string>();
        using var cursor = await collection.Indexes.ListAsync(ct);
        while (await cursor.MoveNextAsync(ct))
        {
            foreach (var index in cursor.Current)
            {
                names.Add(index.GetValue("name", string.Empty).AsString);
            }
        }
        return names;
    }
}
