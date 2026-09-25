using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/cell-templates")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class CellTemplatesController : ControllerBase
{
    private readonly CellTemplateService _svc;
    private readonly ICurrentIdentity _identity;

    public CellTemplatesController(CellTemplateService svc, ICurrentIdentity identity)
    {
        _svc = svc;
        _identity = identity;
    }

    /// <summary>List named cell templates.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<CellTemplateDto>), 200)]
    public async Task<IActionResult> GetAll()
        => Ok(await _svc.GetAllAsync());

    /// <summary>Get a named cell template by id.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(CellTemplateDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> Get(string id)
    {
        var dto = await _svc.GetByIdAsync(id);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Create a named cell template (engineering).</summary>
    [HttpPost]
    [Authorize(Policy = Fabrik3DPolicies.Engineer)]
    [ProducesResponseType(typeof(CellTemplateDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Create([FromBody] SaveCellTemplateRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _svc.CreateAsync(request, _identity.AuditId);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    /// <summary>Update a named cell template (engineering).</summary>
    [HttpPut("{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Engineer)]
    [ProducesResponseType(typeof(CellTemplateDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Update(string id, [FromBody] SaveCellTemplateRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _svc.UpdateAsync(id, request, _identity.AuditId);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Delete a named cell template (engineering).</summary>
    [HttpDelete("{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Engineer)]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> Delete(string id)
        => await _svc.DeleteAsync(id) ? NoContent() : NotFound();
}
