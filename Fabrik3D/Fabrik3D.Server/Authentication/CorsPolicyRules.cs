namespace Fabrik3D.Server.Authentication;

/// <summary>How the server resolves allowed browser origins for the configured environment.</summary>
public enum CorsOriginMode
{
    /// <summary>Explicit, operator-configured origins are allowed (with credentials).</summary>
    Explicit,

    /// <summary>Development/testing only: reflect any origin so local tooling works.</summary>
    DevelopmentReflectAny,

    /// <summary>Production default: deny cross-origin browser access; same-origin only.</summary>
    DenyCrossOrigin,
}

/// <summary>
/// Pure CORS decision rules (S42). Kept separate from the ASP.NET Core registration so the
/// "production never accepts arbitrary origins" guarantee is unit-testable.
/// </summary>
public static class CorsPolicyRules
{
    public static CorsOriginMode Resolve(IReadOnlyCollection<string>? configuredOrigins, bool isProduction)
    {
        if (configuredOrigins is { Count: > 0 })
        {
            return CorsOriginMode.Explicit;
        }

        return isProduction ? CorsOriginMode.DenyCrossOrigin : CorsOriginMode.DevelopmentReflectAny;
    }
}
