using System.Reflection;
using System.Runtime.InteropServices;
using Fabrik3D.Contracts.DTOs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Deployment;

/// <summary>
/// Resolves the product/build version once at startup. The value is stable for the process lifetime
/// and is surfaced by <c>GET /api/version</c>, the health report and the support bundle.
/// </summary>
public sealed class VersionInfo
{
    public VersionInfo(
        IHostEnvironment environment,
        IOptions<DeploymentOptions> deployment,
        IConfiguration configuration)
    {
        var assembly = typeof(VersionInfo).Assembly;
        Version = assembly.GetName().Version?.ToString(3) ?? "0.0.0";
        InformationalVersion =
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? Version;
        Environment = environment.EnvironmentName;
        Profile = deployment.Value.ResolveProfile(environment.EnvironmentName);
        Runtime = RuntimeInformation.FrameworkDescription;
        BuildId = string.IsNullOrWhiteSpace(deployment.Value.BuildId)
            ? configuration["Deployment:BuildId"]
            : deployment.Value.BuildId;
        StartedAtUtc = DateTime.UtcNow;
    }

    public string Version { get; }
    public string InformationalVersion { get; }
    public string Environment { get; }
    public string Profile { get; }
    public string Runtime { get; }
    public string? BuildId { get; }
    public DateTime StartedAtUtc { get; }

    public VersionDto ToDto() => new(
        Version,
        InformationalVersion,
        Environment,
        Profile,
        Runtime,
        BuildId,
        StartedAtUtc);
}
