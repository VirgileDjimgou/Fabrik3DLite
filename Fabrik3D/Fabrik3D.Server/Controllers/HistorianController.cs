using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Telemetry and event historian surface (S40). Ingestion is bounded, validated and rate-limited;
/// every query is read-only and can never issue a command. The historian is disabled by default and
/// all endpoints degrade gracefully when it is empty or off. Reads require Read; ingestion requires
/// Operate (simulator bridge or an enabled connector).
/// </summary>
[ApiController]
[Route("api/historian")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class HistorianController : ControllerBase
{
    private readonly HistorianService _historian;

    public HistorianController(HistorianService historian) => _historian = historian;

    /// <summary>Ingest a bounded batch of telemetry samples (simulator bridge or enabled connector).</summary>
    [HttpPost("telemetry")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(HistorianIngestResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(HistorianIngestResultDto), 429)]
    public async Task<IActionResult> IngestTelemetry(
        [FromBody] IngestTelemetryBatchRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _historian.IngestTelemetryAsync(
            request,
            Request.Headers["X-Historian-Source"].FirstOrDefault(),
            CorrelationIdMiddleware.GetCorrelationId(HttpContext),
            cancellationToken);
        return ToIngestResponse(result, request.Samples?.Count ?? 0);
    }

    /// <summary>Ingest a bounded batch of historized events.</summary>
    [HttpPost("events")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [ProducesResponseType(typeof(HistorianIngestResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(HistorianIngestResultDto), 429)]
    public async Task<IActionResult> IngestEvents(
        [FromBody] IngestHistorizedEventBatchRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _historian.IngestEventsAsync(
            request,
            Request.Headers["X-Historian-Source"].FirstOrDefault(),
            CorrelationIdMiddleware.GetCorrelationId(HttpContext),
            cancellationToken);
        return ToIngestResponse(result, request.Events?.Count ?? 0);
    }

    /// <summary>Query telemetry samples, newest first, with deterministic ordering.</summary>
    [HttpGet("telemetry")]
    [ProducesResponseType(typeof(HistorianPageDto<TelemetrySampleDto>), 200)]
    public async Task<IActionResult> QueryTelemetry(
        [FromQuery] string? sessionId,
        [FromQuery] string? equipmentId,
        [FromQuery] string? signalId,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] string? quality,
        [FromQuery] string? source,
        [FromQuery] string? correlationId,
        [FromQuery] int skip = 0,
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default)
    {
        SignalQuality? parsedQuality = null;
        if (!string.IsNullOrWhiteSpace(quality))
        {
            if (!SignalVocabulary.TryParseQuality(quality, out var value))
                return BadRequest(new ApiErrorDto("validation_failed", $"quality '{quality}' is not known", StatusCodes.Status400BadRequest));
            parsedQuality = value;
        }

        SignalSource? parsedSource = null;
        if (!string.IsNullOrWhiteSpace(source))
        {
            if (!SignalVocabulary.TryParseSource(source, out var value))
                return BadRequest(new ApiErrorDto("validation_failed", $"source '{source}' is not known", StatusCodes.Status400BadRequest));
            parsedSource = value;
        }

        var query = new TelemetrySampleQuery(
            sessionId, equipmentId, signalId, fromUtc, toUtc, parsedQuality, parsedSource, correlationId, skip, limit);
        return Ok(await _historian.QuerySamplesAsync(query, cancellationToken));
    }

    /// <summary>Query historized events, newest first, with deterministic ordering.</summary>
    [HttpGet("events")]
    [ProducesResponseType(typeof(HistorianPageDto<HistorizedEventDto>), 200)]
    public async Task<IActionResult> QueryEvents(
        [FromQuery] string? sessionId,
        [FromQuery] string? equipmentId,
        [FromQuery] string? kind,
        [FromQuery] string? severity,
        [FromQuery] string? code,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] string? correlationId,
        [FromQuery] int skip = 0,
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default)
    {
        HistorianEventKind? parsedKind = null;
        if (!string.IsNullOrWhiteSpace(kind))
        {
            if (!HistorianVocabulary.TryParseKind(kind, out var value))
                return BadRequest(new ApiErrorDto("validation_failed", $"kind '{kind}' is not known", StatusCodes.Status400BadRequest));
            parsedKind = value;
        }

        if (!string.IsNullOrWhiteSpace(severity) && !HistorianVocabulary.IsKnownSeverity(severity))
            return BadRequest(new ApiErrorDto("validation_failed", $"severity '{severity}' is not known", StatusCodes.Status400BadRequest));

        var query = new HistorizedEventQuery(
            sessionId, equipmentId, parsedKind, severity, code, fromUtc, toUtc, correlationId, skip, limit);
        return Ok(await _historian.QueryEventsAsync(query, cancellationToken));
    }

    /// <summary>Historian diagnostics: enabled state, retention policy and storage estimate.</summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(HistorianStatusDto), 200)]
    public async Task<IActionResult> GetStatus(CancellationToken cancellationToken)
        => Ok(await _historian.GetStatusAsync(cancellationToken));

    private IActionResult ToIngestResponse(HistorianIngestResultDto result, int requested) => result.Status switch
    {
        "rejected" => BadRequest(new ApiErrorDto("historian_rejected", result.Diagnostics.FirstOrDefault() ?? "batch rejected", StatusCodes.Status400BadRequest)),
        "rate-limited" => StatusCode(StatusCodes.Status429TooManyRequests, result),
        _ when result.Rejected > 0 && result.Accepted == 0 && requested > 0 =>
            BadRequest(new ApiErrorDto("historian_rejected", result.Diagnostics.FirstOrDefault() ?? "batch rejected", StatusCodes.Status400BadRequest)),
        _ => Ok(result),
    };
}
