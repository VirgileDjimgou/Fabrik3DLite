namespace Fabrik3D.Server.Deployment;

/// <summary>
/// Deployment profile and packaging configuration (section "Deployment"). The profile selects the
/// environment-specific configuration overlay (Production, OnPrem, Demo) while the ASP.NET Core
/// environment stays <c>Production</c> so every production guard still applies.
/// </summary>
public sealed class DeploymentOptions
{
    public const string SectionName = "Deployment";

    /// <summary>Production, OnPrem, Demo, Development or Testing. Defaults to the host environment name.</summary>
    public string? Profile { get; set; }

    /// <summary>
    /// Explicit Swagger toggle. When unset, Swagger is enabled only for Development/Testing. A
    /// production-like profile must keep it disabled unless <see cref="AllowSwaggerInProduction"/>
    /// is explicitly set.
    /// </summary>
    public bool? EnableSwagger { get; set; }

    /// <summary>Explicit, documented opt-in to expose Swagger in a production-like profile.</summary>
    public bool AllowSwaggerInProduction { get; set; }

    /// <summary>Enables the read-only, redacted support-bundle endpoint.</summary>
    public bool SupportBundleEnabled { get; set; } = true;

    /// <summary>Optional build identifier surfaced by the version endpoint (for example a CI run id).</summary>
    public string? BuildId { get; set; }

    public static readonly string[] KnownProfiles =
        ["Production", "OnPrem", "Demo", "Development", "Testing"];

    public string ResolveProfile(string environmentName) =>
        string.IsNullOrWhiteSpace(Profile) ? environmentName : Profile.Trim();

    /// <summary>
    /// A profile is production-like when the host environment is Production or the profile is one of
    /// the shipped deployment profiles. Production-like profiles enforce secure defaults.
    /// </summary>
    public static bool IsProductionLike(string profile, bool environmentIsProduction) =>
        environmentIsProduction
        || profile.Equals("Production", StringComparison.OrdinalIgnoreCase)
        || profile.Equals("OnPrem", StringComparison.OrdinalIgnoreCase)
        || profile.Equals("Demo", StringComparison.OrdinalIgnoreCase);

    public bool ResolveSwaggerEnabled(string environmentName) =>
        EnableSwagger ?? (environmentName.Equals("Development", StringComparison.OrdinalIgnoreCase)
            || environmentName.Equals("Testing", StringComparison.OrdinalIgnoreCase));
}
