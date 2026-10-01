using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class JobsController : ControllerBase
{
    private readonly JobService _svc;
    private readonly DispatchService _dispatch;
    private readonly JobComposerService _composer;

    public JobsController(JobService svc, DispatchService dispatch, JobComposerService composer)
    {
        _svc = svc;
        _dispatch = dispatch;
        _composer = composer;
    }

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
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
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
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> Delete(string id)
        => await _svc.DeleteAsync(id) ? NoContent() : NotFound();

    /// <summary>Start a Created/Ready job.</summary>
    [HttpPost("{id}/start")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
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
    /// Server-authoritative dispatch (S51): the operator starts a job from the HMI and the server
    /// assigns one compatible target, publishes a targeted execution request and tracks the
    /// claim/ACK/running lifecycle. The simulator starts automatically without a local Start action.
    /// </summary>
    [HttpPost("{id}/dispatch")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(DispatchResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Dispatch(string id, [FromBody] StartJobDispatchRequest? request)
    {
        if (request is not null && !ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _dispatch.StartDispatchAsync(
            id, request ?? new StartJobDispatchRequest(),
            CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>
    /// Simulator claim/acknowledgement of a targeted dispatch (S51). Accepted only from the assigned
    /// simulator with a matching tenant, correlation id, target cell and session.
    /// </summary>
    [HttpPost("{id}/dispatch/ack")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(DispatchResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> DispatchAck(string id, [FromBody] DispatchAckRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _dispatch.AcknowledgeAsync(
            id, request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Current dispatch state for a job (S51).</summary>
    [HttpGet("{id}/dispatch")]
    [ProducesResponseType(typeof(DispatchResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> GetDispatch(string id)
    {
        var dto = await _dispatch.GetDispatchAsync(id);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>
    /// Claim an existing Created/Ready/Running job for a simulator.
    /// Duplicate claims by the same simulator are idempotent; claims by
    /// another simulator are rejected unless the owner's heartbeat expired.
    /// </summary>
    [HttpPost("{id}/claim")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
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
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
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
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
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
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
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

    // ── Job composer (S52) ─────────────────────────────────────────

    /// <summary>Selectable cells, scenarios, cell templates and bounds for the composer.</summary>
    [HttpGet("composer/options")]
    [ProducesResponseType(typeof(JobComposerOptionsDto), 200)]
    public async Task<IActionResult> GetComposerOptions()
        => Ok(await _composer.GetOptionsAsync());

    /// <summary>
    /// Validates a composer definition and returns the deterministically generated task preview.
    /// Nothing is persisted; errors block submission and warnings are informational.
    /// </summary>
    [HttpPost("composer/preview")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(JobComposerPreviewDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    public async Task<IActionResult> PreviewComposerJob([FromBody] CreateJobRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        return Ok(await _composer.PreviewAsync(request));
    }

    /// <summary>
    /// Creates a job from a validated composer definition. Invalid or incompatible definitions are
    /// rejected with actionable errors before any execution starts.
    /// </summary>
    [HttpPost("composer")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(JobDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    public async Task<IActionResult> CreateComposerJob([FromBody] CreateJobRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var dto = await _composer.CreateAsync(
            request, CorrelationIdMiddleware.GetCorrelationId(HttpContext));
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }
}
