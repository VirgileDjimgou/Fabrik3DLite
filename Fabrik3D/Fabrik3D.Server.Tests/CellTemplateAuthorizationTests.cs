using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Fabrik3D.Server.Tests;

[Collection(OrchestrationCollection.Name)]
public class CellTemplateServiceTests
{
    private readonly OrchestrationFixture _fx;

    public CellTemplateServiceTests(OrchestrationFixture fx) => _fx = fx;

    private CellTemplateService Service() =>
        new(new CellTemplateRepository(_fx.Context), NullLogger<CellTemplateService>.Instance);

    private const string ValidContent = """
        {
          "schemaVersion": "1.0",
          "id": "cell-1",
          "name": "Cell",
          "worldFrameId": "world",
          "equipment": [
            { "id": "robot-1", "definitionId": "medium-6axis", "transform": { "position": { "x": 0, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 } } }
          ]
        }
        """;

    [Fact]
    public async Task Create_get_update_delete_round_trip_preserves_content_and_metadata()
    {
        var service = Service();
        var created = await service.CreateAsync(new SaveCellTemplateRequest { Name = "Demo cell", Content = ValidContent }, "engineer-1");

        Assert.Equal("1.0", created.SchemaVersion);
        Assert.Equal(ValidContent, created.Content);
        Assert.Equal("engineer-1", created.CreatedBy);

        var fetched = await service.GetByIdAsync(created.Id);
        Assert.NotNull(fetched);
        Assert.Equal("Demo cell", fetched.Name);
        Assert.Equal(created.Id, fetched.Id);
        Assert.Equal(ValidContent, fetched.Content);

        var updated = await service.UpdateAsync(created.Id, new SaveCellTemplateRequest { Name = "Demo cell v2", Content = ValidContent }, "engineer-2");
        Assert.NotNull(updated);
        Assert.Equal("Demo cell v2", updated.Name);
        Assert.Equal(created.Version + 1, updated.Version);
        Assert.Equal("engineer-1", updated.CreatedBy);
        Assert.Equal("engineer-2", updated.UpdatedBy);

        Assert.True(await service.DeleteAsync(created.Id));
        Assert.Null(await service.GetByIdAsync(created.Id));
    }

    [Fact]
    public async Task Anonymous_actor_is_not_recorded_as_an_identity()
    {
        var service = Service();
        var created = await service.CreateAsync(new SaveCellTemplateRequest { Name = "No actor", Content = ValidContent });

        Assert.Null(created.CreatedBy);
        Assert.Null(created.UpdatedBy);
    }

    [Fact]
    public async Task Malformed_content_is_rejected_before_persistence()
    {
        var service = Service();
        var ex = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            service.CreateAsync(new SaveCellTemplateRequest { Name = "Bad", Content = "not json" }));

        Assert.Equal("invalid_cell_file", ex.Code);
        Assert.Contains("not valid JSON", ex.Message);
    }

    [Fact]
    public async Task Unsupported_schema_version_is_rejected()
    {
        var service = Service();
        var ex = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            service.CreateAsync(new SaveCellTemplateRequest
            {
                Name = "Future",
                Content = """{ "schemaVersion": "9.9", "equipment": [] }""",
            }));

        Assert.Equal("invalid_cell_file", ex.Code);
        Assert.Contains("9.9", ex.Message);
    }

    [Fact]
    public async Task List_returns_all_templates()
    {
        var service = Service();
        await service.CreateAsync(new SaveCellTemplateRequest { Name = "A", Content = ValidContent });
        await service.CreateAsync(new SaveCellTemplateRequest { Name = "B", Content = ValidContent });

        var all = await service.GetAllAsync();
        Assert.Contains(all, t => t.Name == "A");
        Assert.Contains(all, t => t.Name == "B");
    }
}
