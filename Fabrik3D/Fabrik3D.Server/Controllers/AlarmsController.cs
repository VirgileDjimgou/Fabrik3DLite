using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class AlarmsController : ControllerBase
{
    private readonly AlarmService _svc;
    private readonly ICurrentIdentity _identity;

    public AlarmsController(AlarmService svc, ICurrentIdentity identity)
    {
        _svc = svc;
        _identity = identity;
    }

    /// <summary>Get recent alarms (newest first).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<AlarmDto>), 200)]
    public async Task<IActionResult> GetAll([FromQuery] int limit = 100)
        => Ok(await _svc.GetAllAsync(limit));

    /// <summary>Get active (unacknowledged) alarms.</summary>
    [HttpGet("active")]
    [ProducesResponseType(typeof(List<AlarmDto>), 200)]
    public async Task<IActionResult> GetActive()
        => Ok(await _svc.GetActiveAsync());

    /// <summary>
    /// Acknowledge an alarm. The audit identity is the authenticated subject; the legacy <c>by</c>
    /// query parameter is retained only for route compatibility and is not trusted.
    /// </summary>
    [HttpPost("{id}/acknowledge")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(AlarmDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> Acknowledge(string id, [FromQuery] string? by = null)
    {
        var dto = await _svc.AcknowledgeAsync(id, _identity.AuditId);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Transition an alarm lifecycle state, retaining immutable action history.</summary>
    [HttpPost("{id}/transition")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(AlarmDto), 200)]
    public async Task<IActionResult> Transition(string id, [FromQuery] string state, [FromQuery] string? by = null, [FromQuery] string? note = null)
    {
        if (!Enum.TryParse<Fabrik3D.Contracts.Enums.AlarmLifecycleState>(state, true, out var target)) return BadRequest();
        try { var dto = await _svc.TransitionAsync(id, target, _identity.AuditId, note); return dto is null ? NotFound() : Ok(dto); }
        catch (InvalidOperationException ex) { return Conflict(new ApiErrorDto("invalid_alarm_transition", ex.Message, 409)); }
    }
}
