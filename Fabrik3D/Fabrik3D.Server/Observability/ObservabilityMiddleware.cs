using System.Diagnostics;
using System.Security.Claims;
using Fabrik3D.Infrastructure.Observability;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Middleware;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Observability;

/// <summary>
/// Starts one OpenTelemetry-compatible span per request, records API latency, and enriches the
/// structured log scope with the correlation id, trace/span ids and the authenticated subject.
/// </summary>
/// <remarks>
/// Placed immediately after <see cref="CorrelationIdMiddleware"/> so the correlation id is available,
/// and before authentication so even anonymous or rejected requests are traced. The span never
/// changes the response; tracing/listener absence is a transparent no-op.
/// </remarks>
public sealed class ObservabilityMiddleware
{
    private readonly RequestDelegate _next;
    private readonly Fabrik3DObservabilityOptions _options;
    private readonly ObservabilityMetrics _metrics;
    private readonly ILogger<ObservabilityMiddleware> _log;

    public ObservabilityMiddleware(
        RequestDelegate next,
        IOptions<Fabrik3DObservabilityOptions> options,
        ObservabilityMetrics metrics,
        ILogger<ObservabilityMiddleware> log)
    {
        _next = next;
        _options = options.Value;
        _metrics = metrics;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_options.Enabled)
        {
            await _next(context);
            return;
        }

        var correlationId = CorrelationIdMiddleware.GetCorrelationId(context);
        var route = context.Request.Path.Value ?? "/";
        using var activity = Fabrik3DTelemetry.StartActivity(
            Fabrik3DTelemetry.ApiRequestSpan,
            ActivityKind.Server,
            new Dictionary<string, object?>
            {
                ["http.request.method"] = context.Request.Method,
                ["url.path"] = route,
                ["fabrik3d.correlation_id"] = correlationId,
            });

        var scope = new Dictionary<string, object?>
        {
            ["CorrelationId"] = correlationId,
            ["Method"] = context.Request.Method,
        };
        if (activity is { } active)
        {
            scope["TraceId"] = active.TraceId.ToHexString();
            scope["SpanId"] = active.SpanId.ToHexString();
        }

        var subject = context.User.FindFirst(Fabrik3DClaimTypes.Subject)?.Value
            ?? context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrWhiteSpace(subject))
        {
            scope["Subject"] = subject;
        }

        var stopwatch = Stopwatch.StartNew();
        using (_log.BeginScope(scope))
        {
            try
            {
                await _next(context);
            }
            finally
            {
                stopwatch.Stop();
                var status = context.Response.StatusCode;
                activity?.SetTag("http.response.status_code", status);
                // Only record the low-cardinality route template, never the raw path with ids.
                var routeTemplate = context.GetRouteTemplate() ?? route;
                _metrics.RecordApiRequest(context.Request.Method, routeTemplate, status, stopwatch.Elapsed.TotalMilliseconds);
            }
        }
    }
}

internal static class ObservabilityHttpContextExtensions
{
    /// <summary>Returns the matched route template (low cardinality) when routing has produced one.</summary>
    public static string? GetRouteTemplate(this HttpContext context)
    {
        var endpoint = context.GetEndpoint();
        return endpoint?.Metadata.GetMetadata<Microsoft.AspNetCore.Routing.RouteEndpoint>()?.RoutePattern.RawText;
    }
}
