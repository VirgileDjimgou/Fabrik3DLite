using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class JobRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public JobRepository(MongoDbContext ctx) : this(ctx, null) { }

    public JobRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<Job> Scope() => TenantQuery.For<Job>(_tenant?.Scope, j => j.OrganizationId);

    public async Task<List<Job>> GetAllAsync() =>
        await _ctx.Jobs.Find(Scope())
            .SortByDescending(j => j.CreatedAtUtc)
            .ToListAsync();

    public async Task<Job?> GetByIdAsync(string id) =>
        await _ctx.Jobs.Find(Scope() & Builders<Job>.Filter.Eq(j => j.Id, id)).FirstOrDefaultAsync();

    public async Task CreateAsync(Job job)
    {
        job.OrganizationId = TenantQuery.BackfillOrganizationId(job.OrganizationId, _tenant?.Scope);
        await _ctx.Jobs.InsertOneAsync(job);
    }

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
            Scope() & Builders<Job>.Filter.Eq(j => j.Id, job.Id)
                   & Builders<Job>.Filter.Eq(j => j.Version, expectedVersion), job);
        return result.MatchedCount > 0;
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.Jobs.DeleteOneAsync(Scope() & Builders<Job>.Filter.Eq(j => j.Id, id));
}
