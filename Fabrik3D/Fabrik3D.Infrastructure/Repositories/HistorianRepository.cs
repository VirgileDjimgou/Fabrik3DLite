using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>
/// Persistence for the telemetry/event historian (S40). Append-only writes, deterministic
/// newest-first reads, intentional indexes and bounded pruning. Read methods can never issue
/// a command; there is no actuator dependency in this type. Reads are tenant-scoped (S43);
/// pruning and storage estimation remain global maintenance operations.
/// </summary>
public class HistorianRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public HistorianRepository(MongoDbContext ctx) : this(ctx, null) { }

    public HistorianRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<TelemetrySample> SampleScope() =>
        TenantQuery.For<TelemetrySample>(_tenant?.Scope, s => s.OrganizationId);

    private FilterDefinition<HistorizedEvent> EventScope() =>
        TenantQuery.For<HistorizedEvent>(_tenant?.Scope, e => e.OrganizationId);

    // ── Writes ──────────────────────────────────────────────────────

    public async Task InsertSamplesAsync(IReadOnlyCollection<TelemetrySample> samples, CancellationToken ct = default)
    {
        if (samples.Count == 0) return;
        foreach (var sample in samples)
        {
            sample.OrganizationId = TenantQuery.BackfillOrganizationId(sample.OrganizationId, _tenant?.Scope);
        }
        await _ctx.TelemetrySamples.InsertManyAsync(samples, cancellationToken: ct);
    }

    public async Task InsertEventsAsync(IReadOnlyCollection<HistorizedEvent> events, CancellationToken ct = default)
    {
        if (events.Count == 0) return;
        foreach (var entry in events)
        {
            entry.OrganizationId = TenantQuery.BackfillOrganizationId(entry.OrganizationId, _tenant?.Scope);
        }
        await _ctx.HistorizedEvents.InsertManyAsync(events, cancellationToken: ct);
    }

    // ── Reads ───────────────────────────────────────────────────────

    public async Task<List<TelemetrySample>> QuerySamplesAsync(TelemetrySampleQuery query, int maxPageSize)
    {
        var (skip, limit) = HistorianQueryBuilder.NormalizePage(query.Skip, query.Limit, maxPageSize);
        return await _ctx.TelemetrySamples
            .Find(SampleScope() & HistorianQueryBuilder.BuildTelemetryFilter(query))
            .SortByDescending(s => s.TimestampUtc)
            .ThenByDescending(s => s.Id)
            .Skip(skip)
            .Limit(limit)
            .ToListAsync();
    }

    public Task<long> CountSamplesAsync(TelemetrySampleQuery query) =>
        _ctx.TelemetrySamples.CountDocumentsAsync(
            SampleScope() & HistorianQueryBuilder.BuildTelemetryFilter(query));

    public async Task<List<HistorizedEvent>> QueryEventsAsync(HistorizedEventQuery query, int maxPageSize)
    {
        var (skip, limit) = HistorianQueryBuilder.NormalizePage(query.Skip, query.Limit, maxPageSize);
        return await _ctx.HistorizedEvents
            .Find(EventScope() & HistorianQueryBuilder.BuildEventFilter(query))
            .SortByDescending(e => e.TimestampUtc)
            .ThenByDescending(e => e.Id)
            .Skip(skip)
            .Limit(limit)
            .ToListAsync();
    }

    public Task<long> CountEventsAsync(HistorizedEventQuery query) =>
        _ctx.HistorizedEvents.CountDocumentsAsync(
            EventScope() & HistorianQueryBuilder.BuildEventFilter(query));

    /// <summary>
    /// Logical (uncompressed) size of both historian collections in bytes, read from collStats.
    /// Uses the logical <c>size</c> rather than WiredTiger's compressed <c>storageSize</c> so the
    /// number is representative before a checkpoint and stable across runs.
    /// </summary>
    public async Task<long> EstimateStorageBytesAsync(CancellationToken ct = default)
    {
        var samples = await _ctx.TelemetrySamples.Database.RunCommandAsync<BsonDocument>(
            new BsonDocument("collStats", Fabrik3D.Domain.Historian.HistorianSchema.TelemetrySampleCollection),
            cancellationToken: ct);
        var events = await _ctx.HistorizedEvents.Database.RunCommandAsync<BsonDocument>(
            new BsonDocument("collStats", Fabrik3D.Domain.Historian.HistorianSchema.HistorizedEventCollection),
            cancellationToken: ct);

        long Sum(BsonDocument doc)
        {
            if (doc.TryGetValue("size", out var size)) return size.ToInt64();
            return doc.TryGetValue("storageSize", out var storage) ? storage.ToInt64() : 0;
        }

        return Sum(samples) + Sum(events);
    }

    // ── Pruning ─────────────────────────────────────────────────────

    /// <summary>Deletes samples older than the cutoff. Returns the number deleted.</summary>
    public async Task<long> PruneSamplesByAgeAsync(DateTime cutoffUtc, CancellationToken ct = default)
    {
        if (cutoffUtc == DateTime.MinValue) return 0;
        var result = await _ctx.TelemetrySamples.DeleteManyAsync(
            Builders<TelemetrySample>.Filter.Lt(s => s.TimestampUtc, cutoffUtc), ct);
        return result.DeletedCount;
    }

    public async Task<long> PruneEventsByAgeAsync(DateTime cutoffUtc, CancellationToken ct = default)
    {
        if (cutoffUtc == DateTime.MinValue) return 0;
        var result = await _ctx.HistorizedEvents.DeleteManyAsync(
            Builders<HistorizedEvent>.Filter.Lt(e => e.TimestampUtc, cutoffUtc), ct);
        return result.DeletedCount;
    }

    /// <summary>
    /// Deletes the oldest telemetry samples so each equipment+signal keeps at most
    /// <paramref name="maxPerSignal"/> newest documents. Returns the number deleted.
    /// </summary>
    public async Task<long> PruneSamplesToPerSignalCapAsync(long maxPerSignal, CancellationToken ct = default)
    {
        if (maxPerSignal <= 0) return 0;

        // Field names are the driver's PascalCase property names (no camelCase convention is
        // registered). $sort then $group/$push preserves the sorted order inside the pushed array.
        var pipeline = new BsonDocument[]
        {
            new("$sort", new BsonDocument { { "TimestampUtc", -1 }, { "_id", -1 } }),
            new("$group", new BsonDocument
            {
                { "_id", new BsonDocument { { "EquipmentId", "$EquipmentId" }, { "SignalId", "$SignalId" } } },
                { "ids", new BsonDocument("$push", "$_id") },
            }),
            new("$project", new BsonDocument
            {
                { "_id", 0 },
                { "doomed", new BsonDocument("$slice", new BsonArray { "$ids", maxPerSignal, 1_000_000L }) },
            }),
        };

        var grouped = await _ctx.TelemetrySamples.Aggregate<BsonDocument>(pipeline).ToListAsync(ct);
        var doomed = new List<ObjectId>();
        foreach (var group in grouped)
        {
            if (!group.TryGetValue("doomed", out var value) || !value.IsBsonArray) continue;
            foreach (var id in value.AsBsonArray)
            {
                if (id.IsObjectId) doomed.Add(id.AsObjectId);
            }
        }

        if (doomed.Count == 0) return 0;
        var result = await _ctx.TelemetrySamples.DeleteManyAsync(
            Builders<TelemetrySample>.Filter.In("_id", doomed), ct);
        return result.DeletedCount;
    }

    /// <summary>Deletes the oldest events so at most <paramref name="maxEvents"/> remain.</summary>
    public async Task<long> PruneEventsToCapAsync(long maxEvents, CancellationToken ct = default)
    {
        if (maxEvents <= 0) return 0;

        var total = await _ctx.HistorizedEvents.CountDocumentsAsync(FilterDefinition<HistorizedEvent>.Empty, cancellationToken: ct);
        var overflow = total - maxEvents;
        if (overflow <= 0) return 0;

        var oldest = await _ctx.HistorizedEvents
            .Find(FilterDefinition<HistorizedEvent>.Empty)
            .SortBy(e => e.TimestampUtc)
            .ThenBy(e => e.Id)
            .Limit((int)Math.Min(overflow, int.MaxValue))
            .Project(e => e.Id)
            .ToListAsync(ct);

        if (oldest.Count == 0) return 0;
        var result = await _ctx.HistorizedEvents.DeleteManyAsync(
            Builders<HistorizedEvent>.Filter.In(e => e.Id, oldest), ct);
        return result.DeletedCount;
    }

    // ── Indexes ─────────────────────────────────────────────────────

    /// <summary>
    /// Creates the documented index set. Idempotent and safe to re-run; existing collections keep
    /// their documents. Index names are stable so tests and operators can assert them.
    /// </summary>
    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        var samples = _ctx.TelemetrySamples;
        await samples.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<TelemetrySample>(
                Builders<TelemetrySample>.IndexKeys
                    .Ascending(s => s.SessionId)
                    .Descending(s => s.TimestampUtc),
                new CreateIndexOptions { Name = "session_timestamp" }),
            new CreateIndexModel<TelemetrySample>(
                Builders<TelemetrySample>.IndexKeys
                    .Ascending(s => s.EquipmentId)
                    .Ascending(s => s.SignalId)
                    .Descending(s => s.TimestampUtc),
                new CreateIndexOptions { Name = "equipment_signal_timestamp" }),
            new CreateIndexModel<TelemetrySample>(
                Builders<TelemetrySample>.IndexKeys.Descending(s => s.TimestampUtc),
                new CreateIndexOptions { Name = "timestamp" }),
            new CreateIndexModel<TelemetrySample>(
                Builders<TelemetrySample>.IndexKeys.Ascending(s => s.CorrelationId),
                new CreateIndexOptions { Name = "correlation" }),
            new CreateIndexModel<TelemetrySample>(
                Builders<TelemetrySample>.IndexKeys
                    .Ascending(s => s.OrganizationId)
                    .Ascending(s => s.EquipmentId)
                    .Ascending(s => s.SignalId)
                    .Descending(s => s.TimestampUtc),
                new CreateIndexOptions { Name = "organization_equipment_signal_timestamp" }),
            new CreateIndexModel<TelemetrySample>(
                Builders<TelemetrySample>.IndexKeys
                    .Ascending(s => s.OrganizationId)
                    .Descending(s => s.TimestampUtc),
                new CreateIndexOptions { Name = "organization_timestamp" }),
        ], ct);

        var events = _ctx.HistorizedEvents;
        await events.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<HistorizedEvent>(
                Builders<HistorizedEvent>.IndexKeys
                    .Ascending(e => e.Kind)
                    .Descending(e => e.TimestampUtc),
                new CreateIndexOptions { Name = "kind_timestamp" }),
            new CreateIndexModel<HistorizedEvent>(
                Builders<HistorizedEvent>.IndexKeys
                    .Ascending(e => e.SessionId)
                    .Descending(e => e.TimestampUtc),
                new CreateIndexOptions { Name = "session_timestamp" }),
            new CreateIndexModel<HistorizedEvent>(
                Builders<HistorizedEvent>.IndexKeys
                    .Ascending(e => e.EquipmentId)
                    .Descending(e => e.TimestampUtc),
                new CreateIndexOptions { Name = "equipment_timestamp" }),
            new CreateIndexModel<HistorizedEvent>(
                Builders<HistorizedEvent>.IndexKeys
                    .Ascending(e => e.Severity)
                    .Descending(e => e.TimestampUtc),
                new CreateIndexOptions { Name = "severity_timestamp" }),
            new CreateIndexModel<HistorizedEvent>(
                Builders<HistorizedEvent>.IndexKeys.Descending(e => e.TimestampUtc),
                new CreateIndexOptions { Name = "timestamp" }),
            new CreateIndexModel<HistorizedEvent>(
                Builders<HistorizedEvent>.IndexKeys
                    .Ascending(e => e.OrganizationId)
                    .Descending(e => e.TimestampUtc),
                new CreateIndexOptions { Name = "organization_timestamp" }),
            new CreateIndexModel<HistorizedEvent>(
                Builders<HistorizedEvent>.IndexKeys
                    .Ascending(e => e.OrganizationId)
                    .Ascending(e => e.SessionId)
                    .Descending(e => e.TimestampUtc),
                new CreateIndexOptions { Name = "organization_session_timestamp" }),
        ], ct);
    }

    /// <summary>Returns the created index names for both historian collections.</summary>
    public async Task<Dictionary<string, List<string>>> ListIndexNamesAsync(CancellationToken ct = default)
    {
        async Task<List<string>> Names<T>(IMongoCollection<T> collection)
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

        return new Dictionary<string, List<string>>
        {
            ["telemetrySamples"] = await Names(_ctx.TelemetrySamples),
            ["historizedEvents"] = await Names(_ctx.HistorizedEvents),
        };
    }
}
