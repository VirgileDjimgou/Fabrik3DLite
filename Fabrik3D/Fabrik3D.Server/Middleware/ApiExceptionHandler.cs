using Fabrik3D.Contracts.DTOs;
using Microsoft.AspNetCore.Diagnostics;

namespace Fabrik3D.Server.Middleware;

/// <summary>
/// Normalizes unhandled exceptions to the documented <see cref="ApiErrorDto"/> contract so a 500 has
/// the same JSON shape as every handled 4xx response, without leaking internal details. The
/// correlation id is already echoed by <see cref="CorrelationIdMiddleware"/> on the response.
/// </summary>
public sealed class ApiExceptionHandler : IExceptionHandler
{
    private readonly ILogger<ApiExceptionHandler> _log;

    public ApiExceptionHandler(ILogger<ApiExceptionHandler> log)
    {
        _log = log;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var correlationId = CorrelationIdMiddleware.GetCorrelationId(httpContext);

        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            _log.LogInformation(
                "[Server][Api] Request cancelled by the client (correlationId={CorrelationId}, path={Path})",
                correlationId,
                httpContext.Request.Path);
            return false;
        }

        _log.LogError(
            exception,
            "[Server][Api] Unhandled exception (correlationId={CorrelationId}, path={Path})",
            correlationId,
            httpContext.Request.Path);

        if (httpContext.Response.HasStarted)
        {
            return false;
        }

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(
            new ApiErrorDto(
                "internal_error",
                "An unexpected error occurred. Quote the X-Correlation-Id header when reporting it.",
                StatusCodes.Status500InternalServerError),
            cancellationToken);
        return true;
    }
}
