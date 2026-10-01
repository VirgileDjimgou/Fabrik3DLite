using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Jobs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Tenancy;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Services;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S52 composer: option discovery, preview validation (structure, compatibility, templates),
/// deterministic creation and tenant isolation.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class JobComposerIntegrationTests
{
    private readonly OrchestrationFixture _fx;

    public JobComposerIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private static CreateJobRequest ValidRequest(string name = "Composer job") => new()
    {
        Name = name,
        Description = "Composer integration",
        MachineMode = "Automatic",
        TargetCellId = "reference-cell",
        ScenarioId = "pallet-processing",
        Priority = 3,
        PartType = "hex-billet",
        PalletLayout = new PalletLayoutRequest { PalletId = "pallet-1", Rows = 2, Columns = 2 },
        OccupiedSlots =
        [
            new PalletSlotRequest { Row = 1, Column = 0 },
            new PalletSlotRequest { Row = 0, Column = 1 },
        ],
    };

    [Fact]
    public async Task Options_expose_cells_scenarios_and_bounds()
    {
        var options = await _fx.Composer.GetOptionsAsync();

        Assert.Contains(options.Cells, c => c.Id == "reference-cell");
        Assert.Contains(options.Cells, c => c.Id == "vision-sorting-cell");
        Assert.Contains(options.Scenarios, s => s.Id == "pallet-processing");
        Assert.Equal(JobComposerRules.MaxRows, options.MaxRows);
        Assert.Equal(JobComposerRules.MaxColumns, options.MaxColumns);
        Assert.Equal(JobComposerRules.MaxTasks, options.MaxTasks);
    }

    [Fact]
    public async Task Preview_generates_deterministic_tasks()
    {
        var preview = await _fx.Composer.PreviewAsync(ValidRequest());

        Assert.True(preview.Valid);
        Assert.Empty(preview.Errors);
        Assert.Equal("reference-cell", preview.ResolvedTargetCellId);
        Assert.Equal("pallet-processing", preview.ScenarioId);
        Assert.Equal(2, preview.TaskCount);
        Assert.Equal(["Slot R0 C1", "Slot R1 C0"], preview.Tasks.Select(t => t.Name));
        Assert.Equal(["pallet-1:R0:C1", "pallet-1:R1:C0"], preview.Tasks.Select(t => t.StableKey));
    }

    [Fact]
    public async Task Preview_warns_when_no_simulator_is_registered_for_the_target()
    {
        // A fresh registry guarantees the target is unavailable regardless of test order.
        var composer = new JobComposerService(
            _fx.Jobs, _fx.Tasks, _fx.CellTemplates, new SimulatorRegistry(),
            NullLogger<JobComposerService>.Instance,
            Options.Create(new OrchestrationOptions { DefaultCellId = "reference-cell" }));

        var preview = await composer.PreviewAsync(ValidRequest());

        Assert.True(preview.Valid);
        Assert.Contains(preview.Warnings, w => w.Code == "target_unavailable");
    }

    [Fact]
    public async Task Preview_rejects_zero_tasks()
    {
        var request = ValidRequest() with { PalletLayout = null, OccupiedSlots = [] };

        var preview = await _fx.Composer.PreviewAsync(request);

        Assert.False(preview.Valid);
        Assert.Contains(preview.Errors, e => e.Code == "no_tasks");
    }

    [Fact]
    public async Task Preview_rejects_duplicate_and_out_of_bounds_slots()
    {
        var request = ValidRequest() with
        {
            OccupiedSlots =
            [
                new PalletSlotRequest { Row = 0, Column = 0 },
                new PalletSlotRequest { Row = 0, Column = 0 },
                new PalletSlotRequest { Row = 5, Column = 0 },
            ],
        };

        var preview = await _fx.Composer.PreviewAsync(request);

        Assert.False(preview.Valid);
        Assert.Contains(preview.Errors, e => e.Code == "duplicate_slot");
        Assert.Contains(preview.Errors, e => e.Code == "slot_out_of_bounds");
    }

    [Fact]
    public async Task Preview_rejects_unsupported_and_incompatible_scenarios()
    {
        var unknown = await _fx.Composer.PreviewAsync(ValidRequest() with { ScenarioId = "does-not-exist" });
        Assert.False(unknown.Valid);
        Assert.Contains(unknown.Errors, e => e.Code == "unsupported_scenario");

        var incompatible = await _fx.Composer.PreviewAsync(ValidRequest() with { ScenarioId = "sorting-normal-cycle" });
        Assert.False(incompatible.Valid);
        Assert.Contains(incompatible.Errors, e => e.Code == "incompatible_scenario");
    }

    [Fact]
    public async Task Preview_rejects_unsupported_target_cell()
    {
        var preview = await _fx.Composer.PreviewAsync(ValidRequest() with { TargetCellId = "unknown-cell" });

        Assert.False(preview.Valid);
        Assert.Contains(preview.Errors, e => e.Code == "unsupported_target_cell");
    }

    [Fact]
    public async Task Preview_rejects_unknown_cell_template()
    {
        var preview = await _fx.Composer.PreviewAsync(ValidRequest() with { CellTemplateId = "missing-template" });

        Assert.False(preview.Valid);
        Assert.Contains(preview.Errors, e => e.Code == "unknown_cell_template");
    }

    [Fact]
    public async Task Create_persists_job_and_generated_tasks()
    {
        var job = await _fx.Composer.CreateAsync(ValidRequest($"Composer create {Guid.NewGuid():N}"), "corr-compose");

        Assert.Equal("reference-cell", job.TargetCellId);
        Assert.Equal("pallet-processing", job.ScenarioId);
        Assert.Equal(3, job.Priority);
        Assert.Equal("pallet-1", job.PalletId);
        Assert.Equal(2, job.PalletRows);
        Assert.Equal(2, job.PalletColumns);
        Assert.Equal(2, job.TaskCount);
        Assert.Equal(0, job.CompletedTaskCount);
        Assert.Equal(2, job.SchemaVersion);
        Assert.Equal("Created", job.Status);

        var tasks = await _fx.JobService.GetTasksByJobIdAsync(job.Id);
        Assert.Equal(2, tasks.Count);
        Assert.Equal(["Slot R0 C1", "Slot R1 C0"], tasks.Select(t => t.Name));
        Assert.Equal([0, 1], tasks.Select(t => t.SequenceOrder));
        Assert.All(tasks, t => Assert.Equal("pallet-1", t.PalletId));
        Assert.All(tasks, t => Assert.True(t.IsRequired));
    }

    [Fact]
    public async Task Create_rejects_invalid_definition_without_persisting()
    {
        var before = (await _fx.JobService.GetAllAsync()).Count;

        var exception = await Assert.ThrowsAsync<JobComposerValidationException>(() =>
            _fx.Composer.CreateAsync(ValidRequest() with { OccupiedSlots = [] }, null));

        Assert.Contains(exception.Errors, e => e.Code == "no_tasks");
        Assert.Equal(before, (await _fx.JobService.GetAllAsync()).Count);
    }

    [Fact]
    public async Task Cross_tenant_template_is_not_visible_to_the_composer()
    {
        var template = new CellTemplate
        {
            Name = $"tenant-template-{Guid.NewGuid():N}",
            SchemaVersion = "1.0",
            Content = """{ "schemaVersion": "1.0", "id": "cell-1", "name": "Cell", "worldFrameId": "world", "equipment": [] }""",
        };
        await _fx.CellTemplates.CreateAsync(template);

        var otherTenant = new FixedTenantContext("org-other");
        var scoped = new JobComposerService(
            new JobRepository(_fx.Context, otherTenant),
            new TaskRepository(_fx.Context, otherTenant),
            new CellTemplateRepository(_fx.Context, otherTenant),
            _fx.Registry,
            NullLogger<JobComposerService>.Instance,
            Options.Create(new OrchestrationOptions { DefaultCellId = "reference-cell" }));

        var preview = await scoped.PreviewAsync(ValidRequest() with { CellTemplateId = template.Id });

        Assert.False(preview.Valid);
        Assert.Contains(preview.Errors, e => e.Code == "unknown_cell_template");
    }

    private sealed class FixedTenantContext : ITenantContext
    {
        public FixedTenantContext(string organizationId)
            => Scope = TenantScope.ForOrganization(organizationId);

        public TenantScope? Scope { get; }
    }
}