using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class TaskRepository
{
    private readonly MongoDbContext _ctx;

    public TaskRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<List<MachiningTask>> GetByJobIdAsync(string jobId) =>
        await _ctx.Tasks.Find(t => t.JobId == jobId)
            .SortBy(t => t.SequenceOrder)
            .ToListAsync();

    public async Task<MachiningTask?> GetByIdAsync(string id) =>
        await _ctx.Tasks.Find(t => t.Id == id).FirstOrDefaultAsync();

    public async Task InsertManyAsync(IEnumerable<MachiningTask> tasks) =>
        await _ctx.Tasks.InsertManyAsync(tasks);

    public async Task UpdateAsync(MachiningTask task) =>
        await _ctx.Tasks.ReplaceOneAsync(t => t.Id == task.Id, task);

    public async Task DeleteByJobIdAsync(string jobId) =>
        await _ctx.Tasks.DeleteManyAsync(t => t.JobId == jobId);
}
