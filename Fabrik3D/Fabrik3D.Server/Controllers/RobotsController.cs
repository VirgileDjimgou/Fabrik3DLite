using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Authoritative robot positions and operator jog intent (S53). Reads are authorized by the Read
/// policy; publication and jog require Operate. The target cell and robot come from the route and are
/// validated server-side; a client-crafted id can never cross a tenant or authority boundary.
/// </summary>
[ApiController]
[Route("api/robots")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class RobotsController : ControllerBase
{
    private readonly RobotStateService _robots;
    private readonly ControlAuthorityService _authority;

    public RobotsController(RobotStateService robots, ControlAuthorityService authority)
    {
        _robots = robots;
        _authority = authority;
    }

    /// <summary>Current authoritative joint/TCP/frame/status snapshot for one robot.</summary>
    [HttpGet("{cellId}/{robotId}/positions")]
    [ProducesResponseType(typeof(RobotPositionsDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> GetPositions(string cellId, string robotId, CancellationToken cancellationToken)
    {
        var dto = _robots.Get(cellId, robotId);
        if (dto is null)
        {
            return NotFound(new ApiErrorDto(
                JogCommandRules.CodeRobotUnavailable,
                "No authoritative robot state has been published for this cell.",
                404));
        }

        // Overlay the live control authority so the HMI never relies on a stale simulator echo.
        try
        {
            var authority = await _authority.GetAsync(cellId, cancellationToken);
            dto = dto with
            {
                ControlAuthorityMode = authority.Mode,
                ControlAuthorityState = authority.State,
                ControlAuthorityOwnerId = authority.OwnerId,
            };
        }
        catch
        {
            // Offline authority read: keep the last published context rather than inventing one.
        }

        return Ok(dto);
    }

    /// <summary>Assigned simulator publishes the robot state it actually executed.</summary>
    [HttpPut("{cellId}/{robotId}/positions")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(RobotPositionsDto), 200)]
    public IActionResult PublishPositions(
        string cellId, string robotId, [FromBody] PublishRobotPositionsRequest request)
    {
        if (request is null)
        {
            return BadRequest(new ApiErrorDto("validation_failed", "A robot state payload is required.", 400));
        }

        // The route owns the target; a body robot id may only confirm it, never redirect it.
        if (!string.Equals(request.RobotId, robotId, StringComparison.Ordinal))
        {
            return BadRequest(new ApiErrorDto(
                JogCommandRules.CodeInvalidRobotState,
                "The body robot id must match the route robot id.",
                400));
        }

        var dto = _robots.Publish(cellId, request);
        return Ok(dto);
    }

    /// <summary>Authorized operator jog press/release; server policies and authority are enforced here.</summary>
    [HttpPost("{cellId}/{robotId}/jog")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(JogCommandResultDto), 200)]
    public async Task<IActionResult> Jog(
        string cellId,
        string robotId,
        [FromBody] JogCommandRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new ApiErrorDto("validation_failed", "A jog request is required.", 400));
        }

        var correlationId = Request.Headers["X-Correlation-Id"].ToString();
        var result = await _robots.IssueJogAsync(
            cellId, robotId, request, string.IsNullOrWhiteSpace(correlationId) ? null : correlationId, cancellationToken);
        return Ok(result);
    }

    /// <summary>Bounded jog audit trail for one robot (no tokens or secrets).</summary>
    [HttpGet("{cellId}/{robotId}/jog/audit")]
    [ProducesResponseType(typeof(List<JogAuditDto>), 200)]
    public IActionResult GetJogAudit(string cellId, string robotId, [FromQuery] int limit = 50)
        => Ok(_robots.GetAudit(cellId, robotId, limit));
}
