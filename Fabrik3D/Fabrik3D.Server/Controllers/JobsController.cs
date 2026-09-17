using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class JobsController : ControllerBase
{
    private readonly JobService _svc;

    public JobsController(JobService svc) => _svc = svc;

    /// <summary>List all jobs (newest first).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<JobDto>), 200)]
    public async Task<IActionResult> GetAll()
        => Ok(await _svc.GetAllAsync());

    /// <summary>Get a single job by id.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(JobDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> Get(string id)
    {
        var dto = await _svc.GetByIdAsync(id);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Create a new job (optionally with embedded tasks).</summary>
    [HttpPost]
    [ProducesResponseType(typeof(JobDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    public async Task<IActionResult> Create([FromBody] CreateJobRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _svc.CreateAsync(request);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    /// <summary>Delete a job and its related tasks.</summary>
    [HttpDelete("{id}")]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> Delete(string id)
        => await _svc.DeleteAsync(id) ? NoContent() : NotFound();

    /// <summary>Start a Created/Ready job.</summary>
    [HttpPost("{id}/start")]
    [ProducesResponseType(typeof(JobDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Start(string id)
    {
        try
        {
            var dto = await _svc.StartAsync(id, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
            return dto is null ? NotFound() : Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new ApiErrorDto("invalid_job_transition", ex.Message, StatusCodes.Status409Conflict));
        }
    }

    /// <summary>
    /// Claim an existing Created/Ready/Running job for a simulator.
    /// Duplicate claims by the same simulator are idempotent; claims by
    /// another simulator are rejected unless the owner's heartbeat expired.
    /// </summary>
    [HttpPost("{id}/claim")]
    [ProducesResponseType(typeof(ClaimResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Claim(string id, [FromBody] ClaimJobRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _svc.ClaimAsync(id, request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Pause a Running job.</summary>
    [HttpPost("{id}/pause")]
    [ProducesResponseType(typeof(JobDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Pause(string id)
    {
        try
        {
            var dto = await _svc.PauseAsync(id, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
            return dto is null ? NotFound() : Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new ApiErrorDto("invalid_job_transition", ex.Message, StatusCodes.Status409Conflict));
        }
    }

    /// <summary>Resume a Paused job.</summary>
    [HttpPost("{id}/resume")]
    [ProducesResponseType(typeof(JobDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Resume(string id)
    {
        try
        {
            var dto = await _svc.ResumeAsync(id, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
            return dto is null ? NotFound() : Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new ApiErrorDto("invalid_job_transition", ex.Message, StatusCodes.Status409Conflict));
        }
    }

    /// <summary>Stop a Running or Paused job.</summary>
    [HttpPost("{id}/stop")]
    [ProducesResponseType(typeof(JobDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Stop(string id)
    {
        try
        {
            var dto = await _svc.StopAsync(id, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
            return dto is null ? NotFound() : Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new ApiErrorDto("invalid_job_transition", ex.Message, StatusCodes.Status409Conflict));
        }
    }

    /// <summary>List tasks for a specific job.</summary>
    [HttpGet("{id}/tasks")]
    [ProducesResponseType(typeof(List<TaskDto>), 200)]
    public async Task<IActionResult> GetTasks(string id)
        => Ok(await _svc.GetTasksByJobIdAsync(id));
}
