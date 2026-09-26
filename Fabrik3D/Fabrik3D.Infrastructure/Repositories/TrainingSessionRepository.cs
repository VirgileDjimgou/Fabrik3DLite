using Fabrik3D.Domain.Organizations;
using Fabrik3D.Domain.Training;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>Filter/query for the training-session list endpoint (S44). All bounds are normalized.</summary>
public sealed record TrainingSessionQuery(
    string? ClassId = null,
    string? LearnerSubject = null,
    string? ScenarioId = null,
    TrainingSessionStatus? Status = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    int Skip = 0,
    int Limit = 100);

/// <summary>
/// Tenant-scoped persistence for training sessions (S44). Every read and write applies the ambient
/// organization filter through <see cref="TenantQuery"/>, so cross-tenant access is rejected at the
/// persistence layer where it is enforced, not by client filtering.
/// </summary>
public class TrainingSessionRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public TrainingSessionRepository(MongoDbContext ctx) : this(ctx, null) { }

    public TrainingSessionRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<TrainingSession> Scope() =>
        TenantQuery.For<TrainingSession>(_tenant?.Scope, s => s.OrganizationId);

    public async Task CreateAsync(TrainingSession session, CancellationToken ct = default)
    {
        session.OrganizationId = TenantQuery.BackfillOrganizationId(session.OrganizationId, _tenant?.Scope);
        await _ctx.TrainingSessions.InsertOneAsync(session, cancellationToken: ct);
    }

    public async Task<TrainingSession?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        if (!MongoDB.Bson.ObjectId.TryParse(id, out var objectId)) return null;
        return await _ctx.TrainingSessions
            .Find(Scope() & Builders<TrainingSession>.Filter.Eq(s => s.Id, objectId.ToString()))
            .FirstOrDefaultAsync(ct);
    }

    public async Task<List<TrainingSession>> QueryAsync(
        TrainingSessionQuery query, int maxPageSize, CancellationToken ct = default)
    {
        var limit = Math.Clamp(query.Limit <= 0 ? maxPageSize : query.Limit, 1, maxPageSize);
        var skip = Math.Max(0, query.Skip);

        return await _ctx.TrainingSessions
            .Find(Scope() & BuildFilter(query))
            .SortByDescending(s => s.StartedAtUtc)
            .ThenBy(s => s.Id)
            .Skip(skip)
            .Limit(limit)
            .ToListAsync(ct);
    }

    public async Task<long> CountAsync(TrainingSessionQuery query, CancellationToken ct = default) =>
        await _ctx.TrainingSessions.CountDocumentsAsync(Scope() & BuildFilter(query), cancellationToken: ct);

    /// <summary>
    /// Optimistic update. A cross-tenant document can never match the scoped version filter, so a
    /// foreign session is reported as not updated rather than silently written.
    /// </summary>
    public async Task<bool> UpdateAsync(TrainingSession session, CancellationToken ct = default)
    {
        var expectedVersion = session.Version;
        session.Version = expectedVersion + 1;
        session.UpdatedAtUtc = DateTime.UtcNow;
        var result = await _ctx.TrainingSessions.ReplaceOneAsync(
            Scope() & Builders<TrainingSession>.Filter.Eq(s => s.Id, session.Id)
                & Builders<TrainingSession>.Filter.Eq(s => s.Version, expectedVersion),
            session,
            cancellationToken: ct);
        return result.MatchedCount > 0;
    }

    private static FilterDefinition<TrainingSession> BuildFilter(TrainingSessionQuery query)
    {
        var builder = Builders<TrainingSession>.Filter;
        var filter = builder.Empty;

        if (!string.IsNullOrWhiteSpace(query.ClassId))
        {
            // Class id is stored as an ObjectId; a malformed client value must not raise and must not
            // fall back to an unfiltered query.
            filter &= MongoDB.Bson.ObjectId.TryParse(query.ClassId, out var classId)
                ? builder.Eq(s => s.ClassId, classId.ToString())
                : builder.Eq(s => s.Id, (string?)null);
        }

        if (!string.IsNullOrWhiteSpace(query.LearnerSubject))
        {
            filter &= builder.Eq(s => s.LearnerSubject, query.LearnerSubject);
        }

        if (!string.IsNullOrWhiteSpace(query.ScenarioId))
        {
            filter &= builder.Eq(s => s.ScenarioId, query.ScenarioId);
        }

        if (query.Status is { } status)
        {
            filter &= builder.Eq(s => s.Status, status);
        }

        if (query.FromUtc is { } from)
        {
            filter &= builder.Gte(s => s.StartedAtUtc, from);
        }

        if (query.ToUtc is { } to)
        {
            filter &= builder.Lte(s => s.StartedAtUtc, to);
        }

        return filter;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        // Organization + class + learner: the instructor enumeration path.
        await _ctx.TrainingSessions.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingSession>(
                Builders<TrainingSession>.IndexKeys
                    .Ascending(s => s.OrganizationId)
                    .Ascending(s => s.ClassId)
                    .Ascending(s => s.LearnerSubject),
                new CreateIndexOptions { Name = "organization_class_learner" }),
            cancellationToken: ct);

        // Organization + scenario + start date: the scenario/date filter path.
        await _ctx.TrainingSessions.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingSession>(
                Builders<TrainingSession>.IndexKeys
                    .Ascending(s => s.OrganizationId)
                    .Ascending(s => s.ScenarioId)
                    .Descending(s => s.StartedAtUtc),
                new CreateIndexOptions { Name = "organization_scenario_started" }),
            cancellationToken: ct);

        // Organization + status + start date: the "running/awaiting assessment" path.
        await _ctx.TrainingSessions.Indexes.CreateOneAsync(
            new CreateIndexModel<TrainingSession>(
                Builders<TrainingSession>.IndexKeys
                    .Ascending(s => s.OrganizationId)
                    .Ascending(s => s.Status)
                    .Descending(s => s.StartedAtUtc),
                new CreateIndexOptions { Name = "organization_status_started" }),
            cancellationToken: ct);
    }

    public async Task<List<string>> ListIndexNamesAsync(CancellationToken ct = default)
    {
        var names = new List<string>();
        using var cursor = await _ctx.TrainingSessions.Indexes.ListAsync(ct);
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
