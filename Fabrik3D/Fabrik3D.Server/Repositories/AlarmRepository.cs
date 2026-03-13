using Fabrik3D.Server.Models.Entities;
using MongoDB.Driver;

namespace Fabrik3D.Server.Repositories;

public class AlarmRepository
{
    private readonly MongoDbContext _ctx;

    public AlarmRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<List<Alarm>> GetAllAsync(int limit = 100) =>
        await _ctx.Alarms.Find(_ => true)
            .SortByDescending(a => a.CreatedAtUtc)
            .Limit(limit)
            .ToListAsync();

    public async Task<List<Alarm>> GetActiveAsync() =>
        await _ctx.Alarms.Find(a => !a.Acknowledged)
            .SortByDescending(a => a.CreatedAtUtc)
            .ToListAsync();

    public async Task CreateAsync(Alarm alarm) =>
        await _ctx.Alarms.InsertOneAsync(alarm);

    public async Task UpdateAsync(Alarm alarm) =>
        await _ctx.Alarms.ReplaceOneAsync(a => a.Id == alarm.Id, alarm);
}
