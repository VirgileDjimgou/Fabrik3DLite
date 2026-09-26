using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class SimulationSessionRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public SimulationSessionRepository(MongoDbContext ctx) : this(ctx, null) { }

    public SimulationSessionRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<SimulationSession> Scope() =>
        TenantQuery.For<SimulationSession>(_tenant?.Scope, s => s.OrganizationId);

    public async Task<SimulationSession?> GetByIdAsync(string id) =>
        await _ctx.SimulationSessions.Find(Scope() & Builders<SimulationSession>.Filter.Eq(s => s.Id, id))
            .FirstOrDefaultAsync();

    public async Task<SimulationSession?> GetByJobIdAsync(string jobId) =>
        await _ctx.SimulationSessions.Find(Scope() & Builders<SimulationSession>.Filter.Eq(s => s.JobId, jobId))
            .SortByDescending(s => s.StartedAtUtc)
            .FirstOrDefaultAsync();

    /// <summary>
    /// Stale sessions across every organization. This is a background-maintenance query invoked by
    /// the heartbeat monitor, which is not tenant-scoped by design (it recovers all sessions).
    /// </summary>
    public async Task<List<SimulationSession>> GetStaleAsync(
        DateTime olderThanUtc, IEnumerable<SimulationStatus> statuses)
    {
        var statusList = statuses.ToList();
        return await _ctx.SimulationSessions
            .Find(s => statusList.Contains(s.Status) && s.LastHeartbeatUtc < olderThanUtc)
            .ToListAsync();
    }

    public async Task CreateAsync(SimulationSession session)
    {
        session.OrganizationId = TenantQuery.BackfillOrganizationId(session.OrganizationId, _tenant?.Scope);
        await _ctx.SimulationSessions.InsertOneAsync(session);
    }

    /// <summary>
    /// Optimistic-concurrency update; returns false when another writer won the race.
    /// </summary>
    public async Task<bool> UpdateAsync(SimulationSession session)
    {
        var expectedVersion = session.Version;
        session.Version = expectedVersion + 1;
        var result = await _ctx.SimulationSessions.ReplaceOneAsync(
            Scope() & Builders<SimulationSession>.Filter.Eq(s => s.Id, session.Id)
                   & Builders<SimulationSession>.Filter.Eq(s => s.Version, expectedVersion), session);
        return result.MatchedCount > 0;
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.SimulationSessions.DeleteOneAsync(Scope() & Builders<SimulationSession>.Filter.Eq(s => s.Id, id));
}
