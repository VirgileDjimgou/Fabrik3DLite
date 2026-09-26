using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>
/// Persistence for memberships (S43). Membership resolution is the only source of truth for which
/// organizations a principal may act in; a client-supplied organization id is valid only when an
/// active membership row exists.
/// </summary>
public class MembershipRepository
{
    private readonly MongoDbContext _ctx;

    public MembershipRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<List<Membership>> GetAllAsync() =>
        await _ctx.Memberships.Find(_ => true).SortBy(m => m.Subject).ToListAsync();

    public async Task<List<Membership>> GetBySubjectAsync(string subject) =>
        await _ctx.Memberships.Find(m => m.Subject == subject)
            .SortBy(m => m.OrganizationId)
            .ToListAsync();

    public async Task<List<Membership>> GetActiveBySubjectAsync(string subject) =>
        await _ctx.Memberships
            .Find(m => m.Subject == subject && m.Status == MembershipStatus.Active)
            .SortBy(m => m.OrganizationId)
            .ToListAsync();

    public async Task<List<Membership>> GetByOrganizationAsync(string organizationId) =>
        await _ctx.Memberships.Find(m => m.OrganizationId == organizationId)
            .SortBy(m => m.Subject)
            .ToListAsync();

    public async Task<Membership?> GetAsync(string organizationId, string subject) =>
        await _ctx.Memberships
            .Find(m => m.OrganizationId == organizationId && m.Subject == subject)
            .FirstOrDefaultAsync();

    public async Task<Membership?> GetByIdAsync(string id) =>
        await _ctx.Memberships.Find(m => m.Id == id).FirstOrDefaultAsync();

    public async Task CreateAsync(Membership membership) =>
        await _ctx.Memberships.InsertOneAsync(membership);

    public async Task<bool> UpdateAsync(Membership membership)
    {
        var expectedVersion = membership.Version;
        membership.Version = expectedVersion + 1;
        var result = await _ctx.Memberships.ReplaceOneAsync(
            m => m.Id == membership.Id && m.Version == expectedVersion, membership);
        return result.MatchedCount > 0;
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.Memberships.DeleteOneAsync(m => m.Id == id);

    /// <summary>
    /// Idempotent upsert by (organizationId, subject). Returns the persisted document.
    /// </summary>
    public async Task<Membership> UpsertAsync(string organizationId, string subject, string role, MembershipStatus status)
    {
        var existing = await GetAsync(organizationId, subject);
        if (existing is null)
        {
            var created = new Membership
            {
                OrganizationId = organizationId,
                Subject = subject,
                Role = role,
                Status = status,
            };
            await CreateAsync(created);
            return created;
        }

        existing.Role = role;
        existing.Status = status;
        existing.UpdatedAtUtc = DateTime.UtcNow;
        await UpdateAsync(existing);
        return existing;
    }

    /// <summary>Creates the documented membership indexes; idempotent and safe to re-run.</summary>
    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _ctx.Memberships.Indexes.CreateOneAsync(
            new CreateIndexModel<Membership>(
                Builders<Membership>.IndexKeys
                    .Ascending(m => m.OrganizationId)
                    .Ascending(m => m.Subject),
                new CreateIndexOptions { Name = "organization_subject_unique", Unique = true }),
            cancellationToken: ct);

        await _ctx.Memberships.Indexes.CreateOneAsync(
            new CreateIndexModel<Membership>(
                Builders<Membership>.IndexKeys.Ascending(m => m.Subject),
                new CreateIndexOptions { Name = "subject" }),
            cancellationToken: ct);
    }

    public async Task<List<string>> ListIndexNamesAsync(CancellationToken ct = default)
    {
        var names = new List<string>();
        using var cursor = await _ctx.Memberships.Indexes.ListAsync(ct);
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
