using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class CellTemplateRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public CellTemplateRepository(MongoDbContext ctx) : this(ctx, null) { }

    public CellTemplateRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<CellTemplate> Scope() =>
        TenantQuery.For<CellTemplate>(_tenant?.Scope, t => t.OrganizationId);

    public async Task<List<CellTemplate>> GetAllAsync() =>
        await _ctx.CellTemplates.Find(Scope())
            .SortBy(t => t.Name)
            .ToListAsync();

    public async Task<CellTemplate?> GetByIdAsync(string id) =>
        await _ctx.CellTemplates.Find(Scope() & Builders<CellTemplate>.Filter.Eq(t => t.Id, id))
            .FirstOrDefaultAsync();

    public async Task CreateAsync(CellTemplate template)
    {
        template.OrganizationId = TenantQuery.BackfillOrganizationId(template.OrganizationId, _tenant?.Scope);
        await _ctx.CellTemplates.InsertOneAsync(template);
    }

    public async Task<bool> UpdateAsync(CellTemplate template)
    {
        var expectedVersion = template.Version;
        template.Version = expectedVersion + 1;
        var result = await _ctx.CellTemplates.ReplaceOneAsync(
            Scope() & Builders<CellTemplate>.Filter.Eq(t => t.Id, template.Id)
                   & Builders<CellTemplate>.Filter.Eq(t => t.Version, expectedVersion), template);
        return result.MatchedCount > 0;
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.CellTemplates.DeleteOneAsync(Scope() & Builders<CellTemplate>.Filter.Eq(t => t.Id, id));

    /// <summary>Creates the documented tenant-scoped template indexes; idempotent.</summary>
    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _ctx.CellTemplates.Indexes.CreateOneAsync(
            new CreateIndexModel<CellTemplate>(
                Builders<CellTemplate>.IndexKeys
                    .Ascending(t => t.OrganizationId)
                    .Ascending(t => t.Name),
                new CreateIndexOptions { Name = "organization_name" }),
            cancellationToken: ct);
    }
}
