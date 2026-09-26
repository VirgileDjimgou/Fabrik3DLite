using Fabrik3D.Domain.Organizations;
using Fabrik3D.Domain.Training;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>Outcome of one idempotent action batch.</summary>
/// <param name="Inserted">Newly stored records.</param>
/// <param name="Duplicates">Records already present (same action id) and therefore skipped.</param>
public sealed record TrainingIngestionResult(int Inserted, int Duplicates);

/// <summary>
/// Tenant-scoped, append-only persistence for reported training actions (S44). The unique
/// (organization, session, action id) index makes ingestion idempotent: a reconnecting simulator can
/// retry a batch and duplicate actions are silently skipped, never stored twice.
/// </summary>
public class TrainingActionRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public TrainingActionRepository(MongoDbContext ctx) : this(ctx, null) { }

    public TrainingActionRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<TrainingActionRecord> Scope() =>
        TenantQuery.For<TrainingActionRecord>(_tenant?.Scope, a => a.OrganizationId);

    /// <summary>
    /// Inserts a batch idempotently. Actions whose (session, action id) already exists are skipped;
    /// the returned counts distinguish new records from duplicates so the caller can report progress.
    /// </summary>
    public async Task<TrainingIngestionResult> InsertBatchAsync(
        IReadOnlyCollection<TrainingActionRecord> actions, CancellationToken ct = default)
    {
        if (actions.Count == 0) return new TrainingIngestionResult(0, 0);

        foreach (var action in actions)
        {
            action.OrganizationId = TenantQuery.BackfillOrganizationId(action.OrganizationId, _tenant?.Scope);
        }

        try
        {
            await _ctx.TrainingActions.InsertManyAsync(
                actions, new InsertManyOptions { IsOrdered = false }, ct);
            return new TrainingIngestionResult(actions.Count, 0);
        }
        catch (MongoBulkWriteException<TrainingActionRecord> ex)
        {
            var duplicates = ex.WriteErrors.Count(error => IsDuplicateKey(error));
            var otherFailures = ex.WriteErrors.Count(error => !IsDuplicateKey(error));

            if (otherFailures > 0)
            {
                // A genuine persistence failure is never masked as a successful idempotent retry.
                throw;
            }

            var inserted = actions.Count - duplicates;
            return new TrainingIngestionResult(inserted, duplicates);
        }
    }

    public async Task<List<TrainingActionRecord>> GetBySessionAsync(
        string sessionId, CancellationToken ct = default) =>
        await _ctx.TrainingActions
            .Find(Scope() & Builders<TrainingActionRecord>.Filter.Eq(a => a.SessionId, sessionId))
            .SortBy(a => a.Sequence)
            .ThenBy(a => a.ActionId)
            .ToListAsync(ct);

    /// <summary>
    /// Fetches the typed evidence for a bounded set of in-tenant sessions (S45 instructor aggregates).
    /// The tenant filter is still applied, so a session id from another organization contributes no
    /// evidence even if it is passed by mistake.
    /// </summary>
    public async Task<List<TrainingActionRecord>> GetBySessionIdsAsync(
        IReadOnlyCollection<string> sessionIds, CancellationToken ct = default)
    {
        if (sessionIds.Count == 0) return [];

        var filter = Scope() & Builders<TrainingActionRecord>.Filter.In(a => a.SessionId, sessionIds);
        return await _ctx.TrainingActions
            .Find(filter)
            .SortBy(a => a.SessionId)
            .ThenBy(a => a.Sequence)
            .ThenBy(a => a.ActionId)
            .ToListAsync(ct);
    }

    public async Task<long> CountBySessionAsync(string sessionId, CancellationToken ct = default) =>
        await _ctx.TrainingActions.CountDocumentsAsync(
            Scope() & Builders<TrainingActionRecord>.Filter.Eq(a => a.SessionId, sessionId),
            cancellationToken: ct);

    public async Task<long> DeleteBySessionAsync(string sessionId, CancellationToken ct = default)
    {
        var result = await _ctx.TrainingActions.DeleteManyAsync(
            Scope() & Builders<TrainingActionRecord>.Filter.Eq(a => a.SessionId, sessionId), ct);
        return result.DeletedCount;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _ctx.TrainingActions.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingActionRecord>(
                Builders<TrainingActionRecord>.IndexKeys
                    .Ascending(a => a.OrganizationId)
                    .Ascending(a => a.SessionId)
                    .Ascending(a => a.ActionId),
                new CreateIndexOptions { Name = "session_action_unique", Unique = true }),
            cancellationToken: ct);

        await _ctx.TrainingActions.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingActionRecord>(
                Builders<TrainingActionRecord>.IndexKeys
                    .Ascending(a => a.OrganizationId)
                    .Ascending(a => a.SessionId)
                    .Ascending(a => a.Sequence),
                new CreateIndexOptions { Name = "session_sequence" }),
            cancellationToken: ct);
    }

    public async Task<List<string>> ListIndexNamesAsync(CancellationToken ct = default)
    {
        var names = new List<string>();
        using var cursor = await _ctx.TrainingActions.Indexes.ListAsync(ct);
        while (await cursor.MoveNextAsync(ct))
        {
            foreach (var index in cursor.Current)
            {
                names.Add(index.GetValue("name", string.Empty).AsString);
            }
        }
        return names;
    }

    private static bool IsDuplicateKey(WriteError error) =>
        error.Code == 11000 || error.Category == ServerErrorCategory.DuplicateKey;
}
