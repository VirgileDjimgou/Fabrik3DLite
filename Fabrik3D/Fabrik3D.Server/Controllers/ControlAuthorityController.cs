using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Control authority surface (S36). Operators read the continuously visible authority state here or
/// through the <c>ControlAuthorityChanged</c> hub event; handover is explicit and audited.
/// Additive: existing single-simulator flows keep working with implicit local simulation.
/// Acquire/release/heartbeat require Operate; a forced takeover requires Engineer.
/// </summary>
[ApiController]
[Route("api/control-authority")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class ControlAuthorityController : ControllerBase
{
    private readonly ControlAuthorityService _svc;

    public ControlAuthorityController(ControlAuthorityService svc) => _svc = svc;

    /// <summary>Get the current authority for a scope. An absent document is reported as implicit local simulation.</summary>
    [HttpGet("{scope}")]
    [ProducesResponseType(typeof(ControlAuthorityDto), 200)]
    public async Task<IActionResult> Get(string scope)
        => Ok(await _svc.GetAsync(scope));

    /// <summary>Acquire the authority. Fails closed with <c>authority_conflict</c> when held elsewhere.</summary>
    [HttpPost("{scope}/acquire")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(ControlAuthorityDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Acquire(string scope, [FromBody] AcquireControlAuthorityRequest request)
    {
        var dto = await _svc.AcquireAsync(scope, request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return Ok(dto);
    }

    /// <summary>Explicitly take over an authority that is already held (requires confirmation).</summary>
    [HttpPost("{scope}/takeover")]
    [Authorize(Policy = Fabrik3DPolicies.Engineer)]
    [ProducesResponseType(typeof(ControlAuthorityDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Takeover(string scope, [FromBody] TakeoverControlAuthorityRequest request)
    {
        var dto = await _svc.TakeoverAsync(scope, request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return Ok(dto);
    }

    /// <summary>Release the authority back to the free state. Only the current owner may release.</summary>
    [HttpPost("{scope}/release")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(ControlAuthorityDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Release(string scope, [FromBody] ReleaseControlAuthorityRequest request)
    {
        var dto = await _svc.ReleaseAsync(scope, request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return Ok(dto);
    }

    /// <summary>Refresh the lease of the current owner. A degraded authority is not revived unless <c>resume</c> is set.</summary>
    [HttpPost("{scope}/heartbeat")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(ControlAuthorityDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Heartbeat(string scope, [FromBody] HeartbeatControlAuthorityRequest request)
    {
        var dto = await _svc.HeartbeatAsync(scope, request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return Ok(dto);
    }

    /// <summary>Immutable audit trail for a scope, newest first.</summary>
    [HttpGet("{scope}/audit")]
    [ProducesResponseType(typeof(List<ControlAuthorityEventDto>), 200)]
    public async Task<IActionResult> Audit(string scope, [FromQuery] int limit = 50)
        => Ok(await _svc.GetAuditAsync(scope, limit));
}
