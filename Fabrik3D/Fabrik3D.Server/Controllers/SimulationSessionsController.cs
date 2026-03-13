using Fabrik3D.Server.DTOs;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/simulation-sessions")]
[Produces("application/json")]
public class SimulationSessionsController : ControllerBase
{
    private readonly SimulationSessionService _svc;

    public SimulationSessionsController(SimulationSessionService svc) => _svc = svc;

    /// <summary>Get a simulation session by id.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(SimulationSessionDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Get(string id)
    {
        var dto = await _svc.GetByIdAsync(id);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Get the latest simulation session for a job.</summary>
    [HttpGet("by-job/{jobId}")]
    [ProducesResponseType(typeof(SimulationSessionDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetByJob(string jobId)
    {
        var dto = await _svc.GetByJobIdAsync(jobId);
        return dto is null ? NotFound() : Ok(dto);
    }
}
