using Fabrik3D.Server.Models.Entities;
using MongoDB.Driver;

namespace Fabrik3D.Server.Repositories;

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

    public async Task UpdateAsync(Job job) =>
        await _ctx.Jobs.ReplaceOneAsync(j => j.Id == job.Id, job);

    public async Task DeleteAsync(string id) =>
        await _ctx.Jobs.DeleteOneAsync(j => j.Id == id);
}
