using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class JobRepository
{
    private readonly MongoDbContext _ctx;

    public JobRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<List<Job>> GetAllAsync() =>
        await _ctx.Jobs.Find(_ => true)
            .SortByDescending(j => j.CreatedAtUtc)
            .ToListAsync();

    public async Task<Job?> GetByIdAsync(string id) =>
        await _ctx.Jobs.Find(j => j.Id == id).FirstOrDefaultAsync();

    public async Task CreateAsync(Job job) =>
        await _ctx.Jobs.InsertOneAsync(job);

    /// <summary>
    /// Optimistic-concurrency update: replaces the document only when the
    /// stored version matches the entity version, then bumps the version.
    /// Returns false when another writer won the race.
    /// </summary>
    public async Task<bool> UpdateAsync(Job job)
    {
        var expectedVersion = job.Version;
        job.Version = expectedVersion + 1;
        var result = await _ctx.Jobs.ReplaceOneAsync(
            j => j.Id == job.Id && j.Version == expectedVersion, job);
        return result.MatchedCount > 0;
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.Jobs.DeleteOneAsync(j => j.Id == id);
}
