namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Product and build version information surfaced by the API and consumed by the HMI/simulator
/// "about" surfaces. It never contains secrets or environment-specific connection details.
/// </summary>
public record VersionDto(
    string Version,
    string InformationalVersion,
    string Environment,
    string Profile,
    string Runtime,
    string? BuildId,
    DateTime StartedAtUtc);
