using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/cell-templates")]
[Produces("application/json")]
public class CellTemplatesController : ControllerBase
{
    private readonly CellTemplateService _svc;
    private readonly CellTemplateAuthorizationPlaceholder _authz;

    public CellTemplatesController(
        CellTemplateService svc,
        CellTemplateAuthorizationPlaceholder authz)
    {
        _svc = svc;
        _authz = authz;
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

    /// <summary>Create a named cell template.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(CellTemplateDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 401)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Create([FromBody] SaveCellTemplateRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (!_authz.IsWriteAllowed(HttpContext, out var reason))
            return Unauthorized(new ApiErrorDto("authorization_required", reason ?? "Authorization required.", StatusCodes.Status401Unauthorized));
        var dto = await _svc.CreateAsync(request);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    /// <summary>Update a named cell template.</summary>
    [HttpPut("{id}")]
    [ProducesResponseType(typeof(CellTemplateDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 401)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Update(string id, [FromBody] SaveCellTemplateRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (!_authz.IsWriteAllowed(HttpContext, out var reason))
            return Unauthorized(new ApiErrorDto("authorization_required", reason ?? "Authorization required.", StatusCodes.Status401Unauthorized));
        var dto = await _svc.UpdateAsync(id, request);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Delete a named cell template.</summary>
    [HttpDelete("{id}")]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 401)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> Delete(string id)
    {
        if (!_authz.IsWriteAllowed(HttpContext, out var reason))
            return Unauthorized(new ApiErrorDto("authorization_required", reason ?? "Authorization required.", StatusCodes.Status401Unauthorized));
        return await _svc.DeleteAsync(id) ? NoContent() : NotFound();
    }
}