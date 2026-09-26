using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>
/// Persistence for organizations (S43). Organization documents are the tenant boundary and are
/// intentionally not tenant-scoped themselves: only administrators manage them.
/// </summary>
public class OrganizationRepository
{
    private readonly MongoDbContext _ctx;

    public OrganizationRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<List<Organization>> GetAllAsync() =>
        await _ctx.Organizations.Find(_ => true).SortBy(o => o.Name).ToListAsync();

    public async Task<Organization?> GetByIdAsync(string id) =>
        await _ctx.Organizations.Find(o => o.Id == id).FirstOrDefaultAsync();

    public async Task<Organization?> GetBySlugAsync(string slug) =>
        await _ctx.Organizations.Find(o => o.Slug == slug).FirstOrDefaultAsync();

    public async Task CreateAsync(Organization organization) =>
        await _ctx.Organizations.InsertOneAsync(organization);

    public async Task<bool> UpdateAsync(Organization organization)
    {
        var expectedVersion = organization.Version;
        organization.Version = expectedVersion + 1;
        var result = await _ctx.Organizations.ReplaceOneAsync(
            o => o.Id == organization.Id && o.Version == expectedVersion, organization);
        return result.MatchedCount > 0;
    }

    /// <summary>
    /// Ensures the deterministic default organization exists. Idempotent: an existing document is
    /// left untouched so operator edits (name/settings) survive restarts.
    /// </summary>
    public async Task<Organization> EnsureDefaultAsync()
    {
        var existing = await GetByIdAsync(TenantSchema.DefaultOrganizationId);
        if (existing is not null) return existing;

        var organization = new Organization
        {
            Id = TenantSchema.DefaultOrganizationId,
            Name = TenantSchema.DefaultOrganizationName,
            Slug = TenantSchema.DefaultOrganizationSlug,
        };

        try
        {
            await CreateAsync(organization);
            return organization;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // Another process created it concurrently; return the persisted document.
            return (await GetByIdAsync(TenantSchema.DefaultOrganizationId))!;
        }
    }

    /// <summary>Creates the documented organization indexes; idempotent and safe to re-run.</summary>
    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _ctx.Organizations.Indexes.CreateOneAsync(
            new CreateIndexModel<Organization>(
                Builders<Organization>.IndexKeys.Ascending(o => o.Slug),
                new CreateIndexOptions { Name = "slug_unique", Unique = true }),
            cancellationToken: ct);

        await _ctx.Organizations.Indexes.CreateOneAsync(
            new CreateIndexModel<Organization>(
                Builders<Organization>.IndexKeys.Ascending(o => o.Name),
                new CreateIndexOptions { Name = "name" }),
            cancellationToken: ct);
    }

    /// <summary>Returns the created organization index names (test/diagnostic helper).</summary>
    public async Task<List<string>> ListIndexNamesAsync(CancellationToken ct = default)
    {
        var names = new List<string>();
        using var cursor = await _ctx.Organizations.Indexes.ListAsync(ct);
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
