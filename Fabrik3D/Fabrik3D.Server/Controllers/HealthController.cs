using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Deployment;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Liveness and readiness surface. <c>GET /api/health</c> is the backward-compatible summary,
/// <c>/api/health/live</c> asserts the process is serving and <c>/api/health/ready</c> asserts the
/// dependencies required for useful work are reachable. None of them expose configuration values.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class HealthController : ControllerBase
{
    private readonly HealthReportService _health;
    private readonly VersionInfo _version;

    public HealthController(HealthReportService health, VersionInfo version)
    {
        _health = health;
        _version = version;
    }

    /// <summary>Backward-compatible basic health check.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(HealthDto), 200)]
    public IActionResult Get() => Ok(new HealthDto("Healthy", DateTime.UtcNow, _version.Version));

    /// <summary>Liveness: the process is running and serving requests.</summary>
    [HttpGet("live")]
    [ProducesResponseType(typeof(HealthReportDto), 200)]
    public IActionResult Live() => Ok(_health.BuildLiveness());

    /// <summary>Readiness: MongoDB, historian storage and connector state summary.</summary>
    [HttpGet("ready")]
    [ProducesResponseType(typeof(HealthReportDto), 200)]
    [ProducesResponseType(typeof(HealthReportDto), 503)]
    public async Task<IActionResult> Ready(CancellationToken cancellationToken)
    {
        var report = await _health.BuildReadinessAsync(cancellationToken);
        return report.Status == "Unhealthy"
            ? StatusCode(StatusCodes.Status503ServiceUnavailable, report)
            : Ok(report);
    }
}
