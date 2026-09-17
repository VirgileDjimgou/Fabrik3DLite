using Fabrik3D.Contracts.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Fabrik3D.Server.Filters;

/// <summary>
/// Keeps empty MVC error results compatible with the documented API error shape.
/// </summary>
public sealed class ApiErrorResultFilter : IResultFilter
{
    public void OnResultExecuting(ResultExecutingContext context)
    {
        if (context.Result is not StatusCodeResult { StatusCode: >= 400 } result)
        {
            return;
        }

        var code = result.StatusCode switch
        {
            StatusCodes.Status400BadRequest => "bad_request",
            StatusCodes.Status404NotFound => "not_found",
            StatusCodes.Status409Conflict => "conflict",
            _ => "request_failed",
        };

        context.Result = new ObjectResult(new ApiErrorDto(
            code,
            "The requested operation could not be completed.",
            result.StatusCode))
        {
            StatusCode = result.StatusCode,
        };
    }

    public void OnResultExecuted(ResultExecutedContext context)
    {
    }
}
