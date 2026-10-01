using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Jobs;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;
using MongoDB.Bson;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Server-authoritative job composer (S52). It exposes the selectable cells/scenarios/templates,
/// validates a definition (structure, cell/scenario compatibility, template existence, target
/// availability) and creates the job plus its deterministically generated tasks with explicit
/// compensation so a partial creation never leaves orphan tasks.
/// </summary>
public class JobComposerService
{
    private readonly JobRepository _jobs;
    private readonly TaskRepository _tasks;
    private readonly CellTemplateRepository _templates;
    private readonly SimulatorRegistry _registry;
    private readonly ILogger<JobComposerService> _log;
    private readonly string _defaultCellId;

    public JobComposerService(
        JobRepository jobs,
        TaskRepository tasks,
        CellTemplateRepository templates,
        SimulatorRegistry registry,
        ILogger<JobComposerService> log,
        IOptions<OrchestrationOptions> options)
    {
        _jobs = jobs;
        _tasks = tasks;
        _templates = templates;
        _registry = registry;
        _log = log;
        _defaultCellId = string.IsNullOrWhiteSpace(options.Value.DefaultCellId)
            ? "reference-cell"
            : options.Value.DefaultCellId.Trim();
    }

    /// <summary>Selectable composer options for the caller's tenant.</summary>
    public async Task<JobComposerOptionsDto> GetOptionsAsync()
    {
        var now = DateTime.UtcNow;
        var cells = JobComposerCatalog.Cells
            .Select(cell => new ComposerCellOptionDto(
                cell.Id,
                cell.Name,
                _registry.ResolveForCell(cell.Id, now) is not null,
                _registry.CountForCell(cell.Id, now),
                cell.CompatibleScenarioIds.ToList(),
                cell.DefaultScenarioId))
            .ToList();

        var scenarios = JobComposerCatalog.Scenarios
            .Select(s => new ComposerScenarioOptionDto(s.Id, s.Name, s.Level))
            .ToList();

        var templates = (await _templates.GetAllAsync())
            .Select(t => new ComposerCellTemplateOptionDto(t.Id, t.Name, t.SchemaVersion))
            .ToList();

        return new JobComposerOptionsDto(
            cells, scenarios, templates,
            JobComposerRules.MaxRows, JobComposerRules.MaxColumns, JobComposerRules.MaxTasks);
    }

    /// <summary>
    /// Validates a definition without persisting anything. Errors block submission; warnings are
    /// informational (for example a target cell with no live simulator yet).
    /// </summary>
    public async Task<JobComposerPreviewDto> PreviewAsync(CreateJobRequest request)
    {
        var plan = JobComposerRules.Plan("preview", request);
        var errors = plan.Issues
            .Select(i => new ComposerValidationIssueDto(i.Code, i.Field, i.Message))
            .ToList();
        var warnings = new List<ComposerValidationIssueDto>();

        var resolvedCellId = ResolveCellId(request.TargetCellId, errors);
        var scenarioId = ResolveScenarioId(request.ScenarioId, resolvedCellId, errors);

        if (!string.IsNullOrWhiteSpace(request.CellTemplateId))
        {
            var templateId = request.CellTemplateId.Trim();
            // Template ids are Mongo ObjectIds; a malformed id is simply unknown, never a query error.
            var template = ObjectId.TryParse(templateId, out _)
                ? await _templates.GetByIdAsync(templateId)
                : null;
            if (template is null)
            {
                errors.Add(new ComposerValidationIssueDto(
                    "unknown_cell_template", "cellTemplateId",
                    $"Cell template '{request.CellTemplateId}' does not exist."));
            }
        }

        if (resolvedCellId is not null && _registry.ResolveForCell(resolvedCellId, DateTime.UtcNow) is null)
        {
            warnings.Add(new ComposerValidationIssueDto(
                "target_unavailable", "targetCellId",
                $"No simulator is currently registered for cell '{resolvedCellId}'. The job can be created and dispatched later."));
        }

        var tasks = plan.Tasks
            .Select(t => new GeneratedTaskPreviewDto(
                t.SequenceOrder, t.Name, t.PartType, t.PalletId ?? string.Empty,
                t.SlotRow, t.SlotColumn, t.SlotKey ?? string.Empty))
            .ToList();

        return new JobComposerPreviewDto(
            errors.Count == 0, resolvedCellId, scenarioId, tasks.Count, tasks, errors, warnings);
    }

    /// <summary>
    /// Creates the job and its generated tasks. The job id is generated up front so tasks are
    /// planned deterministically; if task insertion fails the job is deleted (compensation).
    /// </summary>
    public async Task<JobDto> CreateAsync(CreateJobRequest request, string? correlationId)
    {
        var preview = await PreviewAsync(request);
        if (!preview.Valid)
        {
            throw new JobComposerValidationException(preview.Errors);
        }

        var jobId = ObjectId.GenerateNewId().ToString();
        var plan = JobComposerRules.Plan(jobId, request);

        if (!Enum.TryParse<MachineMode>(request.MachineMode, true, out var mode))
        {
            mode = MachineMode.Automatic;
        }

        var job = new Job
        {
            Id = jobId,
            Name = request.Name.Trim(),
            Description = request.Description,
            MachineMode = mode,
            Status = JobStatus.Created,
            Priority = request.Priority,
            ScenarioId = preview.ScenarioId,
            CellTemplateId = string.IsNullOrWhiteSpace(request.CellTemplateId) ? null : request.CellTemplateId.Trim(),
            TargetCellId = preview.ResolvedTargetCellId,
            PalletId = plan.PalletId,
            PalletRows = plan.PalletRows,
            PalletColumns = plan.PalletColumns,
            TaskCount = plan.Tasks.Count,
            CompletedTaskCount = 0,
            SchemaVersion = 2,
            Metadata = request.Metadata,
        };

        await _jobs.CreateAsync(job);

        try
        {
            if (plan.Tasks.Count > 0)
            {
                await _tasks.InsertManyAsync(plan.Tasks);
            }
        }
        catch
        {
            // Explicit compensation: never leave a job without its tasks.
            await _jobs.DeleteAsync(job.Id);
            throw;
        }

        _log.LogInformation(
            "[Server][Composer] Created → job={JobId} cell={Cell} scenario={Scenario} pallet={Pallet} tasks={TaskCount} priority={Priority} correlation={CorrelationId}",
            job.Id, job.TargetCellId, job.ScenarioId, job.PalletId, job.TaskCount, job.Priority, correlationId);

        return job.ToDto();
    }

    private string? ResolveCellId(string? requestedCellId, List<ComposerValidationIssueDto> errors)
    {
        if (!string.IsNullOrWhiteSpace(requestedCellId))
        {
            var cell = JobComposerCatalog.FindCell(requestedCellId);
            if (cell is null)
            {
                errors.Add(new ComposerValidationIssueDto(
                    "unsupported_target_cell", "targetCellId",
                    $"Target cell '{requestedCellId}' is not a supported cell."));
                return null;
            }
            return cell.Id;
        }

        return JobComposerCatalog.FindCell(_defaultCellId)?.Id ?? JobComposerCatalog.Cells[0].Id;
    }

    private static string? ResolveScenarioId(
        string? requestedScenarioId,
        string? resolvedCellId,
        List<ComposerValidationIssueDto> errors)
    {
        if (string.IsNullOrWhiteSpace(requestedScenarioId)) return null;

        var scenario = JobComposerCatalog.FindScenario(requestedScenarioId);
        if (scenario is null)
        {
            errors.Add(new ComposerValidationIssueDto(
                "unsupported_scenario", "scenarioId",
                $"Scenario '{requestedScenarioId}' is not in the supported catalog."));
            return null;
        }

        var cell = JobComposerCatalog.FindCell(resolvedCellId);
        if (cell is not null && !cell.CompatibleScenarioIds.Contains(scenario.Id, StringComparer.Ordinal))
        {
            errors.Add(new ComposerValidationIssueDto(
                "incompatible_scenario", "scenarioId",
                $"Scenario '{scenario.Id}' is not compatible with cell '{cell.Id}'."));
        }

        return scenario.Id;
    }
}