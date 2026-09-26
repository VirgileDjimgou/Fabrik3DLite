using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>
/// Tenant-scoped persistence for training-resource assignments (S43): scenarios, cell templates and
/// template files assigned to an organization or one of its classes.
/// </summary>
public class TrainingResourceRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public TrainingResourceRepository(MongoDbContext ctx) : this(ctx, null) { }

    public TrainingResourceRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<TrainingResourceAssignment> Scope() =>
        TenantQuery.For<TrainingResourceAssignment>(_tenant?.Scope, r => r.OrganizationId);

    public async Task<List<TrainingResourceAssignment>> GetAllAsync(string? classId = null)
    {
        var filter = Scope();
        if (!string.IsNullOrWhiteSpace(classId))
        {
            filter &= Builders<TrainingResourceAssignment>.Filter.Eq(r => r.ClassId, classId);
        }

        return await _ctx.TrainingResourceAssignments.Find(filter)
            .SortBy(r => r.ResourceId)
            .ToListAsync();
    }

    public async Task<TrainingResourceAssignment?> GetByIdAsync(string id) =>
        await _ctx.TrainingResourceAssignments
            .Find(Scope() & Builders<TrainingResourceAssignment>.Filter.Eq(r => r.Id, id))
            .FirstOrDefaultAsync();

    public async Task CreateAsync(TrainingResourceAssignment assignment)
    {
        assignment.OrganizationId = TenantQuery.BackfillOrganizationId(assignment.OrganizationId, _tenant?.Scope);
        await _ctx.TrainingResourceAssignments.InsertOneAsync(assignment);
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var result = await _ctx.TrainingResourceAssignments.DeleteOneAsync(
            Scope() & Builders<TrainingResourceAssignment>.Filter.Eq(r => r.Id, id));
        return result.DeletedCount > 0;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _ctx.TrainingResourceAssignments.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingResourceAssignment>(
                Builders<TrainingResourceAssignment>.IndexKeys
                    .Ascending(r => r.OrganizationId)
                    .Ascending(r => r.Kind)
                    .Ascending(r => r.ResourceId),
                new CreateIndexOptions { Name = "organization_kind_resource" }),
            cancellationToken: ct);

        await _ctx.TrainingResourceAssignments.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingResourceAssignment>(
                Builders<TrainingResourceAssignment>.IndexKeys
                    .Ascending(r => r.OrganizationId)
                    .Ascending(r => r.ClassId),
                new CreateIndexOptions { Name = "organization_class" }),
            cancellationToken: ct);
    }

    public async Task<List<string>> ListIndexNamesAsync(CancellationToken ct = default)
    {
        var names = new List<string>();
        using var cursor = await _ctx.TrainingResourceAssignments.Indexes.ListAsync(ct);
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
