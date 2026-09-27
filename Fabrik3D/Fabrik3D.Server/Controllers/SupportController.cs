using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Deployment;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Read-only, redacted diagnostic support bundle. Restricted to administrators because it exposes
/// configuration shape and recent logs (with secrets redacted). It never performs writes.
/// </summary>
[ApiController]
[Route("api/support")]
[Authorize(Policy = Fabrik3DPolicies.Admin)]
public class SupportController : ControllerBase
{
    private readonly SupportBundleBuilder _builder;
    private readonly DeploymentOptions _options;

    public SupportController(SupportBundleBuilder builder, IOptions<DeploymentOptions> options)
    {
        _builder = builder;
        _options = options.Value;
    }

    /// <summary>Collects a redacted support bundle for offline diagnostics.</summary>
    [HttpGet("bundle")]
    [ProducesResponseType(typeof(SupportBundleDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> GetBundle(CancellationToken cancellationToken)
    {
        if (!_options.SupportBundleEnabled)
        {
            return NotFound(new ApiErrorDto(
                "support_bundle_disabled",
                "The support bundle endpoint is disabled by configuration.",
                StatusCodes.Status404NotFound));
        }

        return Ok(await _builder.BuildAsync(cancellationToken));
    }
}
