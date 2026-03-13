using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/machine-state")]
[Produces("application/json")]
public class MachineStateController : ControllerBase
{
    private readonly MachineStateService _svc;

    public MachineStateController(MachineStateService svc) => _svc = svc;

    /// <summary>Get the current machine state snapshot.</summary>
    [HttpGet("current")]
    [ProducesResponseType(typeof(MachineStateDto), 200)]
    [ProducesResponseType(204)]
    public async Task<IActionResult> GetCurrent()
    {
        var dto = await _svc.GetCurrentAsync();
        return dto is null ? NoContent() : Ok(dto);
    }

    /// <summary>Simulator pushes the current machine state.</summary>
    [HttpPut("current")]
    [ProducesResponseType(typeof(MachineStateDto), 200)]
    public async Task<IActionResult> UpdateCurrent(
        [FromBody] UpdateMachineStateRequest request)
    {
        var dto = await _svc.UpdateCurrentAsync(request);
        return Ok(dto);
    }
}
