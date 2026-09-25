using Microsoft.Extensions.Hosting;

namespace Fabrik3D.Server.Authentication;

/// <summary>
/// Fails startup when authentication is misconfigured instead of running insecurely. This is the
/// enforcement point for "development authentication can never be mistaken for production".
/// </summary>
public static class AuthenticationStartupGuard
{
    /// <summary>
    /// Validates the resolved authentication options for the hosting environment. Throws
    /// <see cref="InvalidOperationException"/> so the process exits rather than serve traffic with
    /// anonymous mutations.
    /// </summary>
    public static void ValidateOrThrow(Fabrik3DAuthenticationOptions options, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(environment);

        var isProduction = environment.IsProduction();
        var mode = options.NormalizedMode;

        if (isProduction)
        {
            if (mode == Fabrik3DAuthenticationOptions.Modes.Development)
            {
                throw new InvalidOperationException(
                    "Authentication:Mode=Development is refused in Production. Configure an external OIDC authority instead.");
            }

            if (mode == Fabrik3DAuthenticationOptions.Modes.Test)
            {
                throw new InvalidOperationException(
                    "Authentication:Mode=Test is refused in Production. Configure an external OIDC authority instead.");
            }

            if (mode == Fabrik3DAuthenticationOptions.Modes.None)
            {
                throw new InvalidOperationException(
                    "Authentication:Mode=None (anonymous fallback) is refused in Production. Configure an external OIDC authority instead.");
            }

            if (mode != Fabrik3DAuthenticationOptions.Modes.Oidc)
            {
                throw new InvalidOperationException(
                    $"Authentication:Mode='{options.Mode}' is not a supported production mode. Use Oidc.");
            }

            if (string.IsNullOrWhiteSpace(options.Authority))
            {
                throw new InvalidOperationException(
                    "Authentication:Authority is required for Production OIDC. Refusing to start without an identity provider.");
            }

            if (!options.RequireHttpsMetadata)
            {
                throw new InvalidOperationException(
                    "Authentication:RequireHttpsMetadata=false is refused in Production.");
            }

            if (!string.IsNullOrWhiteSpace(options.SigningKey))
            {
                throw new InvalidOperationException(
                    "Authentication:SigningKey is a development/test secret and must not be configured in Production.");
            }

            return;
        }

        // Non-production: Development/Test need a signing key (generated when absent). The None mode
        // is an explicit local emergency fallback and is logged as insecure by the host.
        if (options.IsDevelopmentLike && string.IsNullOrWhiteSpace(options.SigningKey))
        {
            throw new InvalidOperationException(
                "Authentication development/test mode requires a signing key. Configure Authentication:SigningKey or let the server generate an ephemeral one.");
        }

        if (options.IsDevelopmentLike && string.IsNullOrWhiteSpace(options.EffectiveIssuer))
        {
            throw new InvalidOperationException("Authentication dev/test mode requires a non-empty issuer.");
        }
    }
}
