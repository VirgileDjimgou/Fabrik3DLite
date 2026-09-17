namespace Fabrik3D.Server.Middleware;

/// <summary>
/// Ensures every request carries a correlation id: reuses the
/// X-Correlation-Id header when present, otherwise generates one.
/// The id is exposed to controllers via Items and to every log
/// message via the logger scope, and echoed back on the response.
/// </summary>
public class CorrelationIdMiddleware
{
    public const string HeaderName = "X-Correlation-Id";
    public const string ItemKey = "CorrelationId";

    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _log;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers[HeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(correlationId))
        {
            correlationId = Guid.NewGuid().ToString("N");
        }

        context.Items[ItemKey] = correlationId;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = correlationId;
            return Task.CompletedTask;
        });

        using (_log.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
        {
            await _next(context);
        }
    }

    public static string? GetCorrelationId(HttpContext context) =>
        context.Items.TryGetValue(ItemKey, out var value) ? value as string : null;
}
