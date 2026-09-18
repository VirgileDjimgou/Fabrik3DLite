using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Persistence;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

public class CellTemplateRepository
{
    private readonly MongoDbContext _ctx;

    public CellTemplateRepository(MongoDbContext ctx) => _ctx = ctx;

    public async Task<List<CellTemplate>> GetAllAsync() =>
        await _ctx.CellTemplates.Find(_ => true)
            .SortBy(t => t.Name)
            .ToListAsync();

    public async Task<CellTemplate?> GetByIdAsync(string id) =>
        await _ctx.CellTemplates.Find(t => t.Id == id).FirstOrDefaultAsync();

    public async Task CreateAsync(CellTemplate template) =>
        await _ctx.CellTemplates.InsertOneAsync(template);

    public async Task<bool> UpdateAsync(CellTemplate template)
    {
        var expectedVersion = template.Version;
        template.Version = expectedVersion + 1;
        var result = await _ctx.CellTemplates.ReplaceOneAsync(
            t => t.Id == template.Id && t.Version == expectedVersion, template);
        return result.MatchedCount > 0;
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.CellTemplates.DeleteOneAsync(t => t.Id == id);
}