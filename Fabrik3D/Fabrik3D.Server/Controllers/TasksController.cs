using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/tasks")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class TasksController : ControllerBase
{
    private readonly TaskService _svc;

    public TasksController(TaskService svc) => _svc = svc;

    /// <summary>
    /// Simulator reports a task lifecycle transition for a session it owns.
    /// </summary>
    [HttpPut("{id}/status")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(TaskDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> UpdateStatus(
        string id, [FromBody] UpdateTaskStatusRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var dto = await _svc.UpdateStatusAsync(
                id, request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
            return dto is null ? NotFound() : Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new ApiErrorDto("invalid_task_transition", ex.Message, StatusCodes.Status409Conflict));
        }
    }
}
