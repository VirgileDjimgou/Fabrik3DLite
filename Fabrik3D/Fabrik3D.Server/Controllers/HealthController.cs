using Fabrik3D.Contracts.DTOs;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    /// <summary>Basic health check.</summary>
    [HttpGet]
    [ProducesResponseType(200)]
    public IActionResult Get() => Ok(new HealthDto("Healthy", DateTime.UtcNow, "1.0.0"));
}
