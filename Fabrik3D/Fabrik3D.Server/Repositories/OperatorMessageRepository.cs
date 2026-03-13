using Fabrik3D.Server.Models.Entities;
using MongoDB.Driver;

namespace Fabrik3D.Server.Repositories;

public class OperatorMessageRepository
{
    private readonly MongoDbContext _ctx;

    public OperatorMessageRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<List<OperatorMessage>> GetAllAsync(int limit = 100) =>
        await _ctx.OperatorMessages.Find(_ => true)
            .SortByDescending(m => m.CreatedAtUtc)
            .Limit(limit)
            .ToListAsync();

    public async Task CreateAsync(OperatorMessage message) =>
        await _ctx.OperatorMessages.InsertOneAsync(message);

    public async Task UpdateAsync(OperatorMessage message) =>
        await _ctx.OperatorMessages.ReplaceOneAsync(m => m.Id == message.Id, message);
}
