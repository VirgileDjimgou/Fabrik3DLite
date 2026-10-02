using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Demo;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Bounded public-demo lifecycle (S63). The reset is an explicit, audited, operator-authorized
/// operation scoped to simulated demo state. It exists only when the deployment explicitly enables
/// the demo profile; in every production profile the route reports 404 and no data is touched.
/// </summary>
[ApiController]
[Route("api/demo")]
[Produces("application/json")]
[Authorize]
public class DemoController : ControllerBase
{
    private readonly DemoOptions _options;
    private readonly DemoResetService _service;

    public DemoController(IOptions<DemoOptions> options, DemoResetService service)
    {
        _options = options.Value;
        _service = service;
    }

    /// <summary>
    /// Resets the simulated public-demo state (jobs, tasks, machine state, faults, training state).
    /// Requires the <c>Fabrik3D.Operate</c> permission: the read-only <c>PublicDemo</c> role cannot
    /// reset shared demo state. Returns 404 outside the enabled demo profile.
    /// </summary>
    [HttpPost("reset")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(DemoResetResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    public async Task<IActionResult> Reset(CancellationToken ct)
    {
        if (!_options.IsResetAvailable)
        {
            // Do not advertise the demo lifecycle outside the explicit demo profile.
            return NotFound(new ApiErrorDto(
                "not_found",
                "The requested resource does not exist.",
                StatusCodes.Status404NotFound));
        }

        var result = await _service.ResetAsync(ct);
        return Ok(result);
    }
}
