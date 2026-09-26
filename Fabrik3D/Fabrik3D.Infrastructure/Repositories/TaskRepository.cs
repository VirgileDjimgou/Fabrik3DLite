using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class TaskRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public TaskRepository(MongoDbContext ctx) : this(ctx, null) { }

    public TaskRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<MachiningTask> Scope() =>
        TenantQuery.For<MachiningTask>(_tenant?.Scope, t => t.OrganizationId);

    public async Task<List<MachiningTask>> GetByJobIdAsync(string jobId) =>
        await _ctx.Tasks.Find(Scope() & Builders<MachiningTask>.Filter.Eq(t => t.JobId, jobId))
            .SortBy(t => t.SequenceOrder)
            .ToListAsync();

    public async Task<MachiningTask?> GetByIdAsync(string id) =>
        await _ctx.Tasks.Find(Scope() & Builders<MachiningTask>.Filter.Eq(t => t.Id, id)).FirstOrDefaultAsync();

    public async Task InsertManyAsync(IEnumerable<MachiningTask> tasks)
    {
        var list = tasks.ToList();
        foreach (var task in list)
        {
            task.OrganizationId = TenantQuery.BackfillOrganizationId(task.OrganizationId, _tenant?.Scope);
        }
        await _ctx.Tasks.InsertManyAsync(list);
    }

    /// <summary>
    /// Optimistic-concurrency update; returns false when another writer won the race.
    /// </summary>
    public async Task<bool> UpdateAsync(MachiningTask task)
    {
        var expectedVersion = task.Version;
        task.Version = expectedVersion + 1;
        var result = await _ctx.Tasks.ReplaceOneAsync(
            Scope() & Builders<MachiningTask>.Filter.Eq(t => t.Id, task.Id)
                   & Builders<MachiningTask>.Filter.Eq(t => t.Version, expectedVersion), task);
        return result.MatchedCount > 0;
    }

    public async Task DeleteByJobIdAsync(string jobId) =>
        await _ctx.Tasks.DeleteManyAsync(Scope() & Builders<MachiningTask>.Filter.Eq(t => t.JobId, jobId));
}
