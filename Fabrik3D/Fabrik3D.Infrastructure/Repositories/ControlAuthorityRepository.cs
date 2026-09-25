using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>
/// Persistence for control authority (S36). The scope is the document id, so exclusivity is enforced
/// by the unique <c>_id</c> index; transitions use optimistic concurrency on <c>Version</c> and the
/// audit trail is append-only.
/// </summary>
public class ControlAuthorityRepository
{
    private readonly MongoDbContext _ctx;

    public ControlAuthorityRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<ControlAuthority?> GetAsync(string scope) =>
        await _ctx.ControlAuthorities.Find(a => a.Id == scope).FirstOrDefaultAsync();

    /// <summary>Held external leases whose lease has expired.</summary>
    public async Task<List<ControlAuthority>> GetExpiredLeasesAsync(DateTime nowUtc) =>
        await _ctx.ControlAuthorities
            .Find(a => a.State == ControlAuthorityState.Held
                       && a.Mode == ControlAuthorityMode.ExternalController
                       && a.LeaseExpiresAtUtc != null
                       && a.LeaseExpiresAtUtc <= nowUtc)
            .ToListAsync();

    /// <summary>
    /// Inserts a new authority document. Returns false when another writer created it first, so the
    /// caller can reload and reject the acquisition as a structured conflict.
    /// </summary>
    public async Task<bool> TryCreateAsync(ControlAuthority authority)
    {
        try
        {
            await _ctx.ControlAuthorities.InsertOneAsync(authority);
            return true;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return false;
        }
    }

    /// <summary>Optimistic-concurrency replace; false when another writer won the race.</summary>
    public async Task<bool> ReplaceAsync(ControlAuthority authority)
    {
        var expectedVersion = authority.Version;
        authority.Version = expectedVersion + 1;
        var result = await _ctx.ControlAuthorities.ReplaceOneAsync(
            a => a.Id == authority.Id && a.Version == expectedVersion, authority);
        return result.MatchedCount > 0;
    }

    /// <summary>Appends an immutable audit entry.</summary>
    public Task AppendEventAsync(ControlAuthorityEvent entry) =>
        _ctx.ControlAuthorityEvents.InsertOneAsync(entry);

    public async Task<List<ControlAuthorityEvent>> GetEventsAsync(string scope, int limit)
    {
        var bounded = Math.Clamp(limit, 1, 500);
        // Newest first. The ObjectId tie-breaker keeps insertion order deterministic when two
        // transitions share the same timestamp (for example quiesce then acquire in one handover).
        return await _ctx.ControlAuthorityEvents
            .Find(e => e.Scope == scope)
            .SortByDescending(e => e.TimestampUtc)
            .ThenByDescending(e => e.Id)
            .Limit(bounded)
            .ToListAsync();
    }

    /// <summary>Creates the documented indexes; idempotent and safe to call repeatedly.</summary>
    public async Task EnsureIndexesAsync()
    {
        var events = _ctx.ControlAuthorityEvents;
        await events.Indexes.CreateOneAsync(new CreateIndexModel<ControlAuthorityEvent>(
            Builders<ControlAuthorityEvent>.IndexKeys
                .Ascending(e => e.Scope)
                .Descending(e => e.TimestampUtc),
            new CreateIndexOptions { Name = "scope_timestamp" }));

        await events.Indexes.CreateOneAsync(new CreateIndexModel<ControlAuthorityEvent>(
            Builders<ControlAuthorityEvent>.IndexKeys.Ascending(e => e.CorrelationId),
            new CreateIndexOptions { Name = "correlation" }));
    }
}
