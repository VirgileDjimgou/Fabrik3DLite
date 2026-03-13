using Fabrik3D.Contracts.DTOs;
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

    /// <summary>Simulator pushes live execution state into a session.</summary>
    [HttpPut("{id}/state")]
    [ProducesResponseType(typeof(SimulationSessionDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> UpdateState(
        string id, [FromBody] UpdateSimulationStateRequest request)
    {
        var dto = await _svc.UpdateStateAsync(id, request);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Simulator heartbeat to prove the session is still alive.</summary>
    [HttpPost("{id}/heartbeat")]
    [ProducesResponseType(typeof(SimulationSessionDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Heartbeat(string id)
    {
        var dto = await _svc.HeartbeatAsync(id);
        return dto is null ? NotFound() : Ok(dto);
    }
}
