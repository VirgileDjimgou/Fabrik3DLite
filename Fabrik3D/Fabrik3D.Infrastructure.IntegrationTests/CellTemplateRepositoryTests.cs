using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Infrastructure.IntegrationTests;

[Collection(MongoDbCollection.Name)]
public class CellTemplateRepositoryTests
{
    private readonly MongoDbFixture _fixture;

    public CellTemplateRepositoryTests(MongoDbFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Cell_templates_round_trip_in_an_isolated_database()
    {
        var repository = new CellTemplateRepository(_fixture.CreateContext());
        var template = new CellTemplate
        {
            Name = "Repository cell",
            SchemaVersion = "1.0",
            Content = """{ "schemaVersion": "1.0", "equipment": [] }""",
        };

        await repository.CreateAsync(template);
        var stored = await repository.GetByIdAsync(template.Id);

        Assert.NotNull(stored);
        Assert.Equal(template.Name, stored.Name);
        Assert.Equal(template.Content, stored.Content);

        stored.Name = "Repository cell updated";
        Assert.True(await repository.UpdateAsync(stored));
        Assert.Equal(1, stored.Version);

        var reloaded = await repository.GetByIdAsync(template.Id);
        Assert.Equal("Repository cell updated", reloaded?.Name);
        Assert.Equal(1, reloaded?.Version);

        await repository.DeleteAsync(template.Id);
        Assert.Null(await repository.GetByIdAsync(template.Id));
    }
}