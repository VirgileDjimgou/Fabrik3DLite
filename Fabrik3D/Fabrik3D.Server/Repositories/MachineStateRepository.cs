using Fabrik3D.Server.Models.Entities;
using MongoDB.Driver;

namespace Fabrik3D.Server.Repositories;

public class MachineStateRepository
{
    private readonly MongoDbContext _ctx;

    public MachineStateRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<MachineState?> GetCurrentAsync() =>
        await _ctx.MachineStates.Find(_ => true)
            .SortByDescending(m => m.LastUpdatedAtUtc)
            .FirstOrDefaultAsync();

    public async Task UpsertAsync(MachineState state)
    {
        var existing = await _ctx.MachineStates.Find(m => m.Id == state.Id).FirstOrDefaultAsync();
        if (existing is null)
            await _ctx.MachineStates.InsertOneAsync(state);
        else
            await _ctx.MachineStates.ReplaceOneAsync(m => m.Id == state.Id, state);
    }
}
