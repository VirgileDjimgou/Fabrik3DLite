using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class AlarmsController : ControllerBase
{
    private readonly AlarmService _svc;

    public AlarmsController(AlarmService svc) => _svc = svc;

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

    /// <summary>Acknowledge an alarm.</summary>
    [HttpPost("{id}/acknowledge")]
    [ProducesResponseType(typeof(AlarmDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Acknowledge(string id, [FromQuery] string by = "operator")
    {
        var dto = await _svc.AcknowledgeAsync(id, by);
        return dto is null ? NotFound() : Ok(dto);
    }
}
