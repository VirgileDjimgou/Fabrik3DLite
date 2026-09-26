using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Tenancy;

/// <summary>Result of one migration pass (idempotent: a second pass reports zero migrated documents).</summary>
public sealed record TenantMigrationReport(
    string OrganizationId,
    bool AlreadyMigrated,
    IReadOnlyDictionary<string, long> MigratedDocuments,
    DateTime CompletedAtUtc);

/// <summary>
/// Deterministic, idempotent tenancy migration (S43). Existing documents without an
/// <c>OrganizationId</c> are assigned to the default organization; a second run migrates nothing.
/// Compatibility readers additionally treat a missing organization id as the default organization,
/// so the migration is never on the critical read path.
/// </summary>
public class TenantMigrationService
{
    private readonly MongoDbContext _ctx;
    private readonly OrganizationRepository _organizations;

    public TenantMigrationService(MongoDbContext ctx, OrganizationRepository organizations)
    {
        _ctx = ctx;
        _organizations = organizations;
    }

    public async Task<TenantMigrationReport> MigrateAsync(CancellationToken ct = default)
    {
        await _organizations.EnsureDefaultAsync();

        var counts = new Dictionary<string, long>(StringComparer.Ordinal)
        {
            ["organizations"] = 0,
            ["memberships"] = await BackfillAsync(_ctx.Memberships, ct),
            ["trainingClasses"] = await BackfillAsync(_ctx.TrainingClasses, ct),
            ["trainingResourceAssignments"] = await BackfillAsync(_ctx.TrainingResourceAssignments, ct),
            ["jobs"] = await BackfillAsync(_ctx.Jobs, ct),
            ["tasks"] = await BackfillAsync(_ctx.Tasks, ct),
            ["simulationSessions"] = await BackfillAsync(_ctx.SimulationSessions, ct),
            ["alarms"] = await BackfillAsync(_ctx.Alarms, ct),
            ["operatorMessages"] = await BackfillAsync(_ctx.OperatorMessages, ct),
            ["cellTemplates"] = await BackfillAsync(_ctx.CellTemplates, ct),
            ["telemetrySamples"] = await BackfillAsync(_ctx.TelemetrySamples, ct),
            ["historizedEvents"] = await BackfillAsync(_ctx.HistorizedEvents, ct),
            ["trainingSessions"] = await BackfillAsync(_ctx.TrainingSessions, ct),
            ["trainingActions"] = await BackfillAsync(_ctx.TrainingActions, ct),
        };

        var alreadyMigrated = counts.Values.All(count => count == 0);
        return new TenantMigrationReport(
            TenantSchema.DefaultOrganizationId,
            alreadyMigrated,
            counts,
            DateTime.UtcNow);
    }

    private static async Task<long> BackfillAsync<T>(IMongoCollection<T> collection, CancellationToken ct)
    {
        // Authored as a raw BsonDocument so the literal null and missing-field semantics are explicit;
        // `{ OrganizationId: null }` matches both a null value and a missing field in MongoDB.
        var legacy = new BsonDocument("$or", new BsonArray
        {
            new BsonDocument("OrganizationId", BsonNull.Value),
            new BsonDocument("OrganizationId", string.Empty),
            new BsonDocument("OrganizationId", new BsonDocument("$exists", false)),
        });

        var update = new BsonDocument("$set", new BsonDocument("OrganizationId", TenantSchema.DefaultOrganizationId));
        var result = await collection.UpdateManyAsync(
            new BsonDocumentFilterDefinition<T>(legacy),
            new BsonDocumentUpdateDefinition<T>(update),
            cancellationToken: ct);
        return result.ModifiedCount;
    }
}
