using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Exceptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Fabrik3D.Server.Filters;

/// <summary>
/// Maps orchestration conflicts to HTTP 409 with the documented API error shape.
/// </summary>
public sealed class OrchestrationConflictExceptionFilter : IAsyncExceptionFilter
{
    public Task OnExceptionAsync(ExceptionContext context)
    {
        if (context.Exception is not OrchestrationConflictException conflict)
        {
            return Task.CompletedTask;
        }

        context.Result = new ConflictObjectResult(new ApiErrorDto(
            conflict.Code,
            conflict.Message,
            StatusCodes.Status409Conflict));
        context.ExceptionHandled = true;
        return Task.CompletedTask;
    }
}
