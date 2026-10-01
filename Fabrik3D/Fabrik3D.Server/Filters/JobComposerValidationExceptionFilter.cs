using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Exceptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Fabrik3D.Server.Filters;

/// <summary>
/// Maps composer validation failures to HTTP 400 with the actionable issue list (S52).
/// </summary>
public sealed class JobComposerValidationExceptionFilter : IAsyncExceptionFilter
{
    public Task OnExceptionAsync(ExceptionContext context)
    {
        if (context.Exception is not JobComposerValidationException validation)
        {
            return Task.CompletedTask;
        }

        var details = validation.Errors
            .GroupBy(e => e.Field)
            .ToDictionary(g => g.Key, g => g.Select(e => $"{e.Code}: {e.Message}").ToArray());

        context.Result = new BadRequestObjectResult(new ApiErrorDto(
            "invalid_job_definition",
            validation.Message,
            StatusCodes.Status400BadRequest,
            details));
        context.ExceptionHandled = true;
        return Task.CompletedTask;
    }
}