using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Training;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Server-side training sessions and deterministic assessment (S44). Learners start, report and
/// complete their own sessions; instructors read within their organization and can append audited
/// corrections. Tenant boundaries and learner ownership are enforced server-side and the score is
/// always computed by the server.
/// </summary>
[ApiController]
[Route("api/training/sessions")]
[Produces("application/json")]
public class TrainingController : ControllerBase
{
    private readonly TrainingService _svc;

    public TrainingController(TrainingService svc) => _svc = svc;

    /// <summary>Starts a training session owned by the caller.</summary>
    [HttpPost]
    [Authorize(Policy = Fabrik3DPolicies.Train)]
    [ProducesResponseType(typeof(TrainingSessionDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    public async Task<IActionResult> Start([FromBody] StartTrainingSessionRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var dto = await _svc.StartSessionAsync(request, ct);
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Reports a bounded, idempotent batch of actions/events for the caller's session.</summary>
    [HttpPost("{id}/actions")]
    [Authorize(Policy = Fabrik3DPolicies.Train)]
    [ProducesResponseType(typeof(TrainingIngestionResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> ReportActions(
        string id, [FromBody] ReportTrainingActionsRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            return Ok(await _svc.ReportActionsAsync(id, request, ct));
        }
        catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Completes (or fails) the caller's session and returns the computed assessment.</summary>
    [HttpPost("{id}/complete")]
    [Authorize(Policy = Fabrik3DPolicies.Train)]
    [ProducesResponseType(typeof(TrainingSessionDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Complete(
        string id, [FromBody] CompleteTrainingSessionRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            return Ok(await _svc.CompleteSessionAsync(id, request, ct));
        }
        catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Enumerates sessions visible to the caller, filtered by class/learner/scenario/date.</summary>
    [HttpGet]
    [Authorize(Policy = Fabrik3DPolicies.Read)]
    [ProducesResponseType(typeof(List<TrainingSessionDto>), 200)]
    public async Task<IActionResult> List(
        [FromQuery] string? classId = null,
        [FromQuery] string? learnerSubject = null,
        [FromQuery] string? scenarioId = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTime? fromUtc = null,
        [FromQuery] DateTime? toUtc = null,
        [FromQuery] int skip = 0,
        [FromQuery] int limit = 100,
        CancellationToken ct = default)
    {
        Domain.Training.TrainingSessionStatus? parsedStatus = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Domain.Training.TrainingVocabulary.TryParseStatus(status, out var value))
            {
                return BadRequest(new ApiErrorDto("invalid_status", $"'{status}' is not a known session status.", 400));
            }
            parsedStatus = value;
        }

        var query = new TrainingSessionQuery(
            classId, learnerSubject, scenarioId, parsedStatus, fromUtc, toUtc, skip, limit);
        return Ok(await _svc.ListSessionsAsync(query, ct));
    }

    /// <summary>Fetches one session the caller may read.</summary>
    [HttpGet("{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Read)]
    [ProducesResponseType(typeof(TrainingSessionDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> GetById(string id, CancellationToken ct)
    {
        try
        {
            var dto = await _svc.GetSessionAsync(id, ct);
            return dto is null ? NotFound() : Ok(dto);
        }
        catch (UnauthorizedAccessException ex)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Fetches the typed actions/events recorded for a session.</summary>
    [HttpGet("{id}/actions")]
    [Authorize(Policy = Fabrik3DPolicies.Read)]
    [ProducesResponseType(typeof(List<TrainingActionDto>), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> GetActions(string id, CancellationToken ct)
    {
        try
        {
            return Ok(await _svc.GetActionsAsync(id, ct));
        }
        catch (Exception ex) when (ex is KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Fetches the deterministic assessment for a session.</summary>
    [HttpGet("{id}/assessment")]
    [Authorize(Policy = Fabrik3DPolicies.Read)]
    [ProducesResponseType(typeof(TrainingAssessmentDto), 200)]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> GetAssessment(string id, CancellationToken ct)
    {
        try
        {
            var dto = await _svc.GetAssessmentAsync(id, ct);
            return dto is null ? NoContent() : Ok(dto);
        }
        catch (Exception ex) when (ex is KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Exports the server-stored report (JSON) with its educational-scope statement.</summary>
    [HttpGet("{id}/report")]
    [Authorize(Policy = Fabrik3DPolicies.Read)]
    [ProducesResponseType(typeof(TrainingReportDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public async Task<IActionResult> GetReport(string id, CancellationToken ct)
    {
        try
        {
            return Ok(await _svc.GetReportAsync(id, ct));
        }
        catch (Exception ex) when (ex is KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Appends an audited correction to a stored assessment. Instructor/Admin only.</summary>
    [HttpPost("{id}/assessment/corrections")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(typeof(TrainingAssessmentDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> CorrectAssessment(
        string id, [FromBody] CorrectAssessmentRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            return Ok(await _svc.CorrectAssessmentAsync(id, request, ct));
        }
        catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Best-effort import of a local simulator report; the server recomputes the score.</summary>
    [HttpPost("import")]
    [Authorize(Policy = Fabrik3DPolicies.Train)]
    [ProducesResponseType(typeof(TrainingSessionDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    public async Task<IActionResult> Import(
        [FromBody] ImportLocalTrainingReportRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var dto = await _svc.ImportLocalReportAsync(request, ct);
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>Audited restart of a completed/failed simulated session. Instructor/Admin only.</summary>
    [HttpPost("{id}/restart")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(typeof(RestartTrainingSessionResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public async Task<IActionResult> Restart(
        string id, [FromBody] RestartTrainingSessionRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            return Ok(await _svc.RestartSessionAsync(id, request, ct));
        }
        catch (OrchestrationConflictException ex)
        {
            return Conflict(new ApiErrorDto(ex.Code, ex.Message, StatusCodes.Status409Conflict));
        }
        catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException)
        {
            return MapFailure(ex);
        }
    }

    /// <summary>
    /// Server-computed instructor aggregates (S45) over a tenant-scoped class/scenario/date window.
    /// Instructor/Admin only; definitions are documented in docs/architecture/INSTRUCTOR_DASHBOARD.md.
    /// </summary>
    [HttpGet("/api/training/metrics")]
    [Authorize(Policy = Fabrik3DPolicies.Instruct)]
    [ProducesResponseType(typeof(InstructorMetricsDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    public async Task<IActionResult> GetMetrics(
        [FromQuery] string? classId = null,
        [FromQuery] string? scenarioId = null,
        [FromQuery] DateTime? fromUtc = null,
        [FromQuery] DateTime? toUtc = null,
        CancellationToken ct = default)
    {
        try
        {
            var scope = new TrainingMetricsScope(classId, scenarioId, fromUtc, toUtc);
            return Ok(await _svc.GetInstructorMetricsAsync(scope, ct));
        }
        catch (UnauthorizedAccessException ex)
        {
            return MapFailure(ex);
        }
    }

    private ObjectResult MapFailure(Exception exception) => exception switch
    {
        UnauthorizedAccessException => StatusCode(
            StatusCodes.Status403Forbidden,
            new ApiErrorDto("forbidden", exception.Message, StatusCodes.Status403Forbidden)),
        KeyNotFoundException => NotFound(
            new ApiErrorDto("not_found", exception.Message, StatusCodes.Status404NotFound)),
        _ => BadRequest(
            new ApiErrorDto("invalid_training_request", exception.Message, StatusCodes.Status400BadRequest)),
    };
}
