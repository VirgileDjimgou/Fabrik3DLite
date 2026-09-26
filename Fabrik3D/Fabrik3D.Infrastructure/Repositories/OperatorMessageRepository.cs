using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class OperatorMessageRepository
{
    private readonly MongoDbContext _ctx;
    private readonly ITenantContext? _tenant;

    public OperatorMessageRepository(MongoDbContext ctx) : this(ctx, null) { }

    public OperatorMessageRepository(MongoDbContext ctx, ITenantContext? tenant)
    {
        _ctx = ctx;
        _tenant = tenant;
    }

    private FilterDefinition<OperatorMessage> Scope() =>
        TenantQuery.For<OperatorMessage>(_tenant?.Scope, m => m.OrganizationId);

    public async Task<List<OperatorMessage>> GetAllAsync(int limit = 100) =>
        await _ctx.OperatorMessages.Find(Scope())
            .SortByDescending(m => m.CreatedAtUtc)
            .Limit(limit)
            .ToListAsync();

    public async Task CreateAsync(OperatorMessage message)
    {
        message.OrganizationId = TenantQuery.BackfillOrganizationId(message.OrganizationId, _tenant?.Scope);
        await _ctx.OperatorMessages.InsertOneAsync(message);
    }

    public async Task UpdateAsync(OperatorMessage message) =>
        await _ctx.OperatorMessages.ReplaceOneAsync(
            Scope() & Builders<OperatorMessage>.Filter.Eq(m => m.Id, message.Id), message);
}
