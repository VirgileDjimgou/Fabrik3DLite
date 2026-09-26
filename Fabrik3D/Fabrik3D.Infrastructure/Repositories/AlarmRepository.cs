using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class AlarmRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public AlarmRepository(MongoDbContext ctx) : this(ctx, null) { }

    public AlarmRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<Alarm> Scope() => TenantQuery.For<Alarm>(_tenant?.Scope, a => a.OrganizationId);

    public async Task<List<Alarm>> GetAllAsync(int limit = 100) =>
        await _ctx.Alarms.Find(Scope())
            .SortByDescending(a => a.CreatedAtUtc)
            .Limit(limit)
            .ToListAsync();

    public async Task<Alarm?> GetByIdAsync(string id) =>
        await _ctx.Alarms.Find(Scope() & Builders<Alarm>.Filter.Eq(a => a.Id, id)).FirstOrDefaultAsync();

    public async Task<List<Alarm>> GetActiveAsync() =>
        await _ctx.Alarms.Find(Scope() & Builders<Alarm>.Filter.Where(a =>
                a.LifecycleState != Fabrik3D.Contracts.Enums.AlarmLifecycleState.Closed &&
                a.LifecycleState != Fabrik3D.Contracts.Enums.AlarmLifecycleState.Shelved))
            .SortByDescending(a => a.CreatedAtUtc)
            .ToListAsync();

    public async Task CreateAsync(Alarm alarm)
    {
        alarm.OrganizationId = TenantQuery.BackfillOrganizationId(alarm.OrganizationId, _tenant?.Scope);
        await _ctx.Alarms.InsertOneAsync(alarm);
    }

    public async Task UpdateAsync(Alarm alarm) =>
        await _ctx.Alarms.ReplaceOneAsync(
            Scope() & Builders<Alarm>.Filter.Eq(a => a.Id, alarm.Id), alarm);
}
