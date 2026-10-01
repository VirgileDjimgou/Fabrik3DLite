using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Normalization of unhandled exceptions to the documented API error contract.
/// </summary>
public class ApiExceptionHandlerTests
{
    [Fact]
    public async Task Unhandled_exception_returns_the_documented_internal_error_contract()
    {
        var handler = new ApiExceptionHandler(NullLogger<ApiExceptionHandler>.Instance);
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/jobs/boom";
        context.Response.Body = new MemoryStream();

        var handled = await handler.TryHandleAsync(
            context,
            new InvalidOperationException("secret internal detail"),
            CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);

        context.Response.Body.Position = 0;
        var payload = await JsonSerializer.DeserializeAsync<ApiErrorDto>(
            context.Response.Body,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(payload);
        Assert.Equal("internal_error", payload!.Code);
        Assert.Equal(StatusCodes.Status500InternalServerError, payload.Status);
        Assert.DoesNotContain("secret internal detail", payload.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Client_cancellation_is_not_reported_as_a_server_error()
    {
        var handler = new ApiExceptionHandler(NullLogger<ApiExceptionHandler>.Instance);
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();
        var context = new DefaultHttpContext { RequestAborted = cts.Token };

        var handled = await handler.TryHandleAsync(context, new OperationCanceledException(), CancellationToken.None);

        Assert.False(handled);
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
    }
}
