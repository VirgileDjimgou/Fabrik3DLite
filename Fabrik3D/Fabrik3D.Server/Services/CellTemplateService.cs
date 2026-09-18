using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Persists named cell templates through the orchestrator. Content is
/// validated (JSON + supported schema version) but stored verbatim.
/// </summary>
public class CellTemplateService
{
    private readonly CellTemplateRepository _templates;
    private readonly ILogger<CellTemplateService> _log;

    public CellTemplateService(CellTemplateRepository templates, ILogger<CellTemplateService> log)
    {
        _templates = templates;
        _log = log;
    }

    public async Task<List<CellTemplateDto>> GetAllAsync()
    {
        var templates = await _templates.GetAllAsync();
        return templates.Select(t => t.ToDto()).ToList();
    }

    public async Task<CellTemplateDto?> GetByIdAsync(string id)
    {
        var template = await _templates.GetByIdAsync(id);
        return template?.ToDto();
    }

    /// <summary>Creates a new named cell template.</summary>
    public async Task<CellTemplateDto> CreateAsync(SaveCellTemplateRequest request)
    {
        var error = CellFileContentValidator.ValidateContent(request.Content);
        if (error is not null) throw new OrchestrationConflictException("invalid_cell_file", error);

        var template = new CellTemplate
        {
            Name = request.Name.Trim(),
            SchemaVersion = CellFileContentValidator.SchemaVersionOf(request.Content),
            Content = request.Content,
        };
        await _templates.CreateAsync(template);
        _log.LogInformation("[Server][CellTemplates] Created → id={TemplateId} name={Name} schema={Schema}",
            template.Id, template.Name, template.SchemaVersion);
        return template.ToDto();
    }

    /// <summary>Updates an existing named cell template (version-guarded).</summary>
    public async Task<CellTemplateDto?> UpdateAsync(string id, SaveCellTemplateRequest request)
    {
        var template = await _templates.GetByIdAsync(id);
        if (template is null) return null;

        var error = CellFileContentValidator.ValidateContent(request.Content);
        if (error is not null) throw new OrchestrationConflictException("invalid_cell_file", error);

        template.Name = request.Name.Trim();
        template.SchemaVersion = CellFileContentValidator.SchemaVersionOf(request.Content);
        template.Content = request.Content;
        template.UpdatedAtUtc = DateTime.UtcNow;

        if (!await _templates.UpdateAsync(template))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Cell template '{id}' was modified concurrently. Reload and retry.");
        return template.ToDto();
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var template = await _templates.GetByIdAsync(id);
        if (template is null) return false;
        await _templates.DeleteAsync(id);
        return true;
    }
}