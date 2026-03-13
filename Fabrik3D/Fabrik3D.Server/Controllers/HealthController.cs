using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    /// <summary>Basic health check.</summary>
    [HttpGet]
    [ProducesResponseType(200)]
    public IActionResult Get() => Ok(new
    {
        status = "Healthy",
        timestamp = DateTime.UtcNow,
        version = "1.0.0"
    });
}
