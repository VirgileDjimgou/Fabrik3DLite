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

    public async Task CreateAsync(SimulationSession session) =>
        await _ctx.SimulationSessions.InsertOneAsync(session);

    public async Task UpdateAsync(SimulationSession session) =>
        await _ctx.SimulationSessions.ReplaceOneAsync(s => s.Id == session.Id, session);
}
