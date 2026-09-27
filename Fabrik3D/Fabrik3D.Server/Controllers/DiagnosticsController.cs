using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Infrastructure.Observability;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Observability;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Authenticated observability surfaces (S49): a Prometheus/JSON metrics snapshot, the resolved
/// observability configuration, and the optional simulator performance report. No endpoint exposes
/// secrets, endpoints with credentials or raw paths.
/// </summary>
[ApiController]
[Route("api/diagnostics")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class DiagnosticsController : ControllerBase
{
    private readonly ObservabilityMetrics _metrics;
    private readonly Fabrik3DObservabilityOptions _options;
    private readonly ConnectorMetricsSampler _connectorSampler;

    public DiagnosticsController(
        ObservabilityMetrics metrics,
        IOptions<Fabrik3DObservabilityOptions> options,
        ConnectorMetricsSampler connectorSampler)
    {
        _metrics = metrics;
        _options = options.Value;
        _connectorSampler = connectorSampler;
    }

    /// <summary>Read-only observability status and configuration.</summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(ObservabilityStatusDto), 200)]
    public IActionResult Status() => Ok(new ObservabilityStatusDto(
        _options.Enabled,
        _options.MetricsEndpointEnabled,
        _options.NormalizedExporter(),
        _options.OtlpEndpoint,
        Fabrik3DTelemetry.ServiceName,
        _metrics.SeriesCount,
        _metrics.DroppedSeries));

    /// <summary>
    /// Metrics snapshot. Defaults to the Prometheus text exposition format; use
    /// <c>?format=json</c> for a JSON array of series.
    /// </summary>
    [HttpGet("metrics")]
    [Produces("text/plain", "application/json")]
    [ProducesResponseType(200)]
    public IActionResult Metrics([FromQuery] string? format)
    {
        if (!_options.MetricsEndpointEnabled || !_options.Enabled)
        {
            return NotFound();
        }

        if (string.Equals(format, "json", StringComparison.OrdinalIgnoreCase))
        {
            return Ok(_metrics.Snapshot().Concat(_connectorSampler.Sample()));
        }

        return Content(_metrics.RenderPrometheus(_connectorSampler.Sample()), "text/plain; version=0.0.4; charset=utf-8");
    }

    /// <summary>
    /// Optional simulator performance report (frame time, draw calls, triangles, texture memory and
    /// JS heap). Off by default on the client; additive because it never changes runtime semantics.
    /// </summary>
    [HttpPost("simulator")]
    [Authorize(Policy = Fabrik3DPolicies.Operate)]
    [EnableRateLimiting(Fabrik3DAuthenticationExtensions.SimulatorMetricsRateLimitPolicy)]
    [ProducesResponseType(202)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    public IActionResult RecordSimulator([FromBody] SimulatorMetricsDto sample)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (!_options.Enabled || !_options.MetricsEndpointEnabled)
        {
            // Observability disabled: the simulator must not treat this as a failure.
            return Accepted();
        }

        if (sample.FrameTimeMs < 0 || sample.DrawCalls < 0 || sample.Triangles < 0
            || sample.TextureBytes < 0 || sample.HeapUsedBytes < 0)
        {
            return BadRequest(new ApiErrorDto(
                "validation_failed",
                "Simulator metrics values must be non-negative.",
                StatusCodes.Status400BadRequest));
        }

        _metrics.RecordSimulatorFrame(
            sample.FrameTimeMs,
            sample.DrawCalls,
            sample.Triangles,
            sample.TextureBytes,
            sample.HeapUsedBytes);
        return Accepted();
    }
}
