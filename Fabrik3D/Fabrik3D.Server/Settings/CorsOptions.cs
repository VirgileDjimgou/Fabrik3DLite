namespace Fabrik3D.Server.Settings;

/// <summary>
/// Browser CORS configuration (section "Cors"). Origins must be explicit; there is no wildcard
/// default in Production.
/// </summary>
public sealed class CorsOptions
{
    public const string SectionName = "Cors";

    /// <summary>Explicit allowed origins for cross-origin HMI/simulator deployments.</summary>
    public string[] AllowedOrigins { get; set; } = [];
}
