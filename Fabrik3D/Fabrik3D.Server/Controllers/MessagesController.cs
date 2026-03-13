using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class MessagesController : ControllerBase
{
    private readonly OperatorMessageService _svc;

    public MessagesController(OperatorMessageService svc) => _svc = svc;

    /// <summary>Get recent operator messages (newest first).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<OperatorMessageDto>), 200)]
    public async Task<IActionResult> GetAll([FromQuery] int limit = 100)
        => Ok(await _svc.GetAllAsync(limit));
}
