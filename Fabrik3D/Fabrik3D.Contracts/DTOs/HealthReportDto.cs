namespace Fabrik3D.Contracts.DTOs;

/// <summary>One named readiness/liveness probe result.</summary>
public record HealthCheckDto(string Name, string Status, string? Detail);

/// <summary>
/// Structured liveness/readiness report. <see cref="Status"/> is one of <c>Healthy</c>,
/// <c>Degraded</c> or <c>Unhealthy</c>. It never exposes connection strings, credentials or
/// configuration values.
/// </summary>
public record HealthReportDto(
    string Status,
    DateTime Timestamp,
    string Version,
    IReadOnlyList<HealthCheckDto> Checks);
