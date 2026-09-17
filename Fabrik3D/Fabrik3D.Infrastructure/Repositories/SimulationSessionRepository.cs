using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class SimulationSessionRepository
{
    private readonly MongoDbContext _ctx;

    public SimulationSessionRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<SimulationSession?> GetByIdAsync(string id) =>
        await _ctx.SimulationSessions.Find(s => s.Id == id).FirstOrDefaultAsync();

    public async Task<SimulationSession?> GetByJobIdAsync(string jobId) =>
        await _ctx.SimulationSessions.Find(s => s.JobId == jobId)
            .SortByDescending(s => s.StartedAtUtc)
            .FirstOrDefaultAsync();

    public async Task<List<SimulationSession>> GetStaleAsync(
        DateTime olderThanUtc, IEnumerable<SimulationStatus> statuses)
    {
        var statusList = statuses.ToList();
        return await _ctx.SimulationSessions
            .Find(s => statusList.Contains(s.Status) && s.LastHeartbeatUtc < olderThanUtc)
            .ToListAsync();
    }

    public async Task CreateAsync(SimulationSession session) =>
        await _ctx.SimulationSessions.InsertOneAsync(session);

    /// <summary>
    /// Optimistic-concurrency update; returns false when another writer won the race.
    /// </summary>
    public async Task<bool> UpdateAsync(SimulationSession session)
    {
        var expectedVersion = session.Version;
        session.Version = expectedVersion + 1;
        var result = await _ctx.SimulationSessions.ReplaceOneAsync(
            s => s.Id == session.Id && s.Version == expectedVersion, session);
        return result.MatchedCount > 0;
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.SimulationSessions.DeleteOneAsync(s => s.Id == id);
}
