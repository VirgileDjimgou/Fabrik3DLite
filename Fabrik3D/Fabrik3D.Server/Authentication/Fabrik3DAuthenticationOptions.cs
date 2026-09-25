namespace Fabrik3D.Server.Authentication;

/// <summary>
/// Authentication configuration (section "Authentication"). Values come from the environment or a
/// key vault; no secret is ever committed. Unknown or unsafe combinations are refused at startup by
/// <see cref="AuthenticationStartupGuard"/>.
/// </summary>
public sealed class Fabrik3DAuthenticationOptions
{
    public const string SectionName = "Authentication";

    /// <summary>Oidc, Development, Test or None. Resolved from the environment when left empty.</summary>
    public string Mode { get; set; } = string.Empty;

    /// <summary>OIDC authority (metadata endpoint) for production external identity.</summary>
    public string? Authority { get; set; }

    /// <summary>Expected token issuer. Required for local JWT/dev modes; otherwise derived from the authority.</summary>
    public string? Issuer { get; set; }

    /// <summary>Expected token audience.</summary>
    public string? Audience { get; set; }

    /// <summary>
    /// HTTPS metadata requirement. Defaults to true and must stay true in Production; an explicit
    /// development override is only accepted for non-production environments.
    /// </summary>
    public bool RequireHttpsMetadata { get; set; } = true;

    /// <summary>
    /// Symmetric signing key for Development/Test modes. Generate a random key when omitted; never
    /// reuse a committed value and never configure this in Production.
    /// </summary>
    public string? SigningKey { get; set; }

    /// <summary>Short-lived access-token lifetime. Development/test tokens default to 15 minutes.</summary>
    public int AccessTokenLifetimeMinutes { get; set; } = 15;

    /// <summary>Accepted clock skew for token validation, in seconds.</summary>
    public double ClockSkewSeconds { get; set; } = 30;

    /// <summary>Enables the clearly-labelled public/demo read-only role.</summary>
    public bool PublicDemoEnabled { get; set; }

    /// <summary>Validate the issuer claim. Disabled only for the explicit local emergency mode.</summary>
    public bool ValidateIssuer { get; set; } = true;

    /// <summary>Validate the audience claim. Disabled only for the explicit local emergency mode.</summary>
    public bool ValidateAudience { get; set; } = true;

    public string NormalizedMode => (Mode ?? string.Empty).Trim().ToLowerInvariant() switch
    {
        "oidc" or "openid" => Modes.Oidc,
        "development" or "dev" => Modes.Development,
        "test" => Modes.Test,
        "none" or "off" or "legacy" => Modes.None,
        _ => Modes.None,
    };

    public bool IsDevelopmentLike => NormalizedMode is Modes.Development or Modes.Test;

    public bool UsesDevelopmentTokens => IsDevelopmentLike;

    /// <summary>Issuer used for locally-issued development/test tokens.</summary>
    public string EffectiveIssuer => string.IsNullOrWhiteSpace(Issuer)
        ? (NormalizedMode == Modes.Test ? "fabrik3d-test" : "fabrik3d-development")
        : Issuer!;

    /// <summary>Audience used for locally-issued development/test tokens.</summary>
    public string EffectiveAudience => string.IsNullOrWhiteSpace(Audience) ? "fabrik3d-api" : Audience!;

    /// <summary>
    /// Resolve the default mode from the hosting environment when it is not explicitly configured:
    /// Production requires real OIDC; Testing and local development use the guarded identity modes.
    /// </summary>
    public static string ResolveMode(string? configured, string environmentName)
    {
        if (!string.IsNullOrWhiteSpace(configured)) return configured.Trim();
        if (string.Equals(environmentName, "Production", StringComparison.OrdinalIgnoreCase)) return Modes.Oidc;
        if (string.Equals(environmentName, "Testing", StringComparison.OrdinalIgnoreCase)) return Modes.Test;
        return Modes.Development;
    }

    public static class Modes
    {
        public const string Oidc = "Oidc";
        public const string Development = "Development";
        public const string Test = "Test";
        public const string None = "None";
    }
}
