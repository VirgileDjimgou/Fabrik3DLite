using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>
/// Tenant-scoped persistence for classes/cohorts (S43). Every read and write is filtered by the
/// ambient organization; cross-organization ids simply return null.
/// </summary>
public class TrainingClassRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public TrainingClassRepository(MongoDbContext ctx) : this(ctx, null) { }

    public TrainingClassRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<TrainingClass> Scope() => TenantQuery.For<TrainingClass>(_tenant?.Scope, c => c.OrganizationId);

    public async Task<List<TrainingClass>> GetAllAsync() =>
        await _ctx.TrainingClasses.Find(Scope() & Builders<TrainingClass>.Filter.Empty)
            .SortBy(c => c.Name)
            .ToListAsync();

    public async Task<TrainingClass?> GetByIdAsync(string id) =>
        await _ctx.TrainingClasses.Find(Scope() & Builders<TrainingClass>.Filter.Eq(c => c.Id, id))
            .FirstOrDefaultAsync();

    public async Task CreateAsync(TrainingClass trainingClass)
    {
        trainingClass.OrganizationId = TenantQuery.BackfillOrganizationId(trainingClass.OrganizationId, _tenant?.Scope);
        await _ctx.TrainingClasses.InsertOneAsync(trainingClass);
    }

    public async Task<bool> UpdateAsync(TrainingClass trainingClass)
    {
        var expectedVersion = trainingClass.Version;
        trainingClass.Version = expectedVersion + 1;
        trainingClass.UpdatedAtUtc = DateTime.UtcNow;
        var result = await _ctx.TrainingClasses.ReplaceOneAsync(
            Scope() & Builders<TrainingClass>.Filter.Eq(c => c.Id, trainingClass.Id)
                   & Builders<TrainingClass>.Filter.Eq(c => c.Version, expectedVersion),
            trainingClass);
        return result.MatchedCount > 0;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var result = await _ctx.TrainingClasses.DeleteOneAsync(
            Scope() & Builders<TrainingClass>.Filter.Eq(c => c.Id, id));
        return result.DeletedCount > 0;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _ctx.TrainingClasses.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingClass>(
                Builders<TrainingClass>.IndexKeys
                    .Ascending(c => c.OrganizationId)
                    .Ascending(c => c.Name),
                new CreateIndexOptions { Name = "organization_name" }),
            cancellationToken: ct);

        await _ctx.TrainingClasses.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingClass>(
                Builders<TrainingClass>.IndexKeys
                    .Ascending(c => c.OrganizationId)
                    .Ascending(c => c.LearnerSubjects),
                new CreateIndexOptions { Name = "organization_learners" }),
            cancellationToken: ct);
    }

    public async Task<List<string>> ListIndexNamesAsync(CancellationToken ct = default)
    {
        var names = new List<string>();
        using var cursor = await _ctx.TrainingClasses.Indexes.ListAsync(ct);
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
