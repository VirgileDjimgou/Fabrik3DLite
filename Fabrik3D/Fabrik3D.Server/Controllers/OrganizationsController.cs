using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Organization, membership, class and training-resource administration (S43). All tenant-scoped
/// reads and writes are enforced server-side by the repositories; the caller never supplies a
/// trusted organization id.
/// </summary>
[ApiController]
[Route("api/organizations")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class OrganizationsController : ControllerBase
{
    private readonly OrganizationService _svc;

    public OrganizationsController(OrganizationService svc) => _svc = svc;

    /// <summary>Active organization context resolved for the authenticated principal.</summary>
    [HttpGet("context")]
    [ProducesResponseType(typeof(TenantContextDto), 200)]
    public async Task<IActionResult> GetContext() => Ok(await _svc.GetContextAsync());

    /// <summary>Organizations the caller may see (all for a platform admin).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<OrganizationDto>), 200)]
    public async Task<IActionResult> GetOrganizations() => Ok(await _svc.GetOrganizationsAsync());

    /// <summary>Creates an organization. Admin-only.</summary>
    [HttpPost]
    [Authorize(Policy = Fabrik3DPolicies.Admin)]
    [ProducesResponseType(typeof(OrganizationDto), 201)]
    public async Task<IActionResult> CreateOrganization([FromBody] CreateOrganizationRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var dto = await _svc.CreateOrganizationAsync(request);
            return CreatedAtAction(nameof(GetOrganizations), new { id = dto.Id }, dto);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new ApiErrorDto("organization_exists", ex.Message, StatusCodes.Status409Conflict));
        }
    }

    /// <summary>Lists memberships for an organization the caller may administer.</summary>
    [HttpGet("{organizationId}/memberships")]
    [Authorize(Policy = Fabrik3DPolicies.Admin)]
    [ProducesResponseType(typeof(List<MembershipDto>), 200)]
    public async Task<IActionResult> GetMemberships(string organizationId)
    {
        try
        {
            return Ok(await _svc.GetMembershipsAsync(organizationId));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbidden(ex.Message);
        }
    }

    /// <summary>Creates or updates a membership. Admin-only and scoped to the organization.</summary>
    [HttpPut("{organizationId}/memberships")]
    [Authorize(Policy = Fabrik3DPolicies.Admin)]
    [ProducesResponseType(typeof(MembershipDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> UpsertMembership(string organizationId, [FromBody] UpsertMembershipRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            return Ok(await _svc.UpsertMembershipAsync(organizationId, request));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbidden(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new ApiErrorDto("not_found", ex.Message, StatusCodes.Status404NotFound));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiErrorDto("invalid_membership", ex.Message, StatusCodes.Status400BadRequest));
        }
    }

    /// <summary>Removes a membership. Admin-only and scoped to the organization.</summary>
    [HttpDelete("{organizationId}/memberships/{membershipId}")]
    [Authorize(Policy = Fabrik3DPolicies.Admin)]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> DeleteMembership(string organizationId, string membershipId)
    {
        try
        {
            return await _svc.DeleteMembershipAsync(organizationId, membershipId) ? NoContent() : NotFound();
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbidden(ex.Message);
        }
    }

    /// <summary>Lists classes in the active organization.</summary>
    [HttpGet("classes")]
    [ProducesResponseType(typeof(List<TrainingClassDto>), 200)]
    public async Task<IActionResult> GetClasses() => Ok(await _svc.GetClassesAsync());

    /// <summary>Creates a class/cohort in the active organization. Instructor/Admin.</summary>
    [HttpPost("classes")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(typeof(TrainingClassDto), 201)]
    public async Task<IActionResult> CreateClass([FromBody] UpsertTrainingClassRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _svc.CreateClassAsync(request);
        return CreatedAtAction(nameof(GetClasses), new { id = dto.Id }, dto);
    }

    /// <summary>Updates a class in the active organization. Instructor/Admin.</summary>
    [HttpPut("classes/{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(typeof(TrainingClassDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> UpdateClass(string id, [FromBody] UpsertTrainingClassRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _svc.UpdateClassAsync(id, request);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Deletes a class in the active organization. Instructor/Admin.</summary>
    [HttpDelete("classes/{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> DeleteClass(string id)
        => await _svc.DeleteClassAsync(id) ? NoContent() : NotFound();

    /// <summary>Lists training-resource assignments in the active organization.</summary>
    [HttpGet("resources")]
    [ProducesResponseType(typeof(List<TrainingResourceAssignmentDto>), 200)]
    public async Task<IActionResult> GetResources([FromQuery] string? classId = null)
        => Ok(await _svc.GetResourcesAsync(classId));

    /// <summary>Assigns a scenario/template/cell file to the active organization or class.</summary>
    [HttpPost("resources")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(typeof(TrainingResourceAssignmentDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> AssignResource([FromBody] AssignTrainingResourceRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var dto = await _svc.AssignResourceAsync(request);
            return CreatedAtAction(nameof(GetResources), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new ApiErrorDto("not_found", ex.Message, StatusCodes.Status404NotFound));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiErrorDto("invalid_resource", ex.Message, StatusCodes.Status400BadRequest));
        }
    }

    /// <summary>Removes a training-resource assignment in the active organization.</summary>
    [HttpDelete("resources/{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> DeleteResource(string id)
        => await _svc.DeleteResourceAsync(id) ? NoContent() : NotFound();

    /// <summary>Runs the idempotent default-organization migration. Admin-only.</summary>
    [HttpPost("migrate")]
    [Authorize(Policy = Fabrik3DPolicies.Admin)]
    [ProducesResponseType(typeof(TenantMigrationResultDto), 200)]
    public async Task<IActionResult> Migrate() => Ok(await _svc.MigrateAsync());

    private ObjectResult Forbidden(string message) =>
        StatusCode(StatusCodes.Status403Forbidden,
            new ApiErrorDto("forbidden", message, StatusCodes.Status403Forbidden));
}
