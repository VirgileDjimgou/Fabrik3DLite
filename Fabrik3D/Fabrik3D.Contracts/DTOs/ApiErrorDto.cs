namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Stable error payload returned by the orchestration HTTP API.
/// </summary>
public record ApiErrorDto(
    string Code,
    string Message,
    int Status,
    Dictionary<string, string[]>? Details = null);
