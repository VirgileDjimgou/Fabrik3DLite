using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Fabrik3D.Server.Deployment;

/// <summary>
/// Validates the resolved deployment configuration at startup and returns every actionable problem
/// at once. The host refuses to start when the list is non-empty, so an invalid or unsafe
/// configuration can never produce a partially-secure running server.
/// </summary>
public static class DeploymentConfigurationValidator
{
    public static IReadOnlyList<string> Validate(
        IConfiguration configuration,
        IHostEnvironment environment,
        DeploymentOptions deployment,
        Fabrik3DAuthenticationOptions authentication,
        CorsOptions cors,
        OrchestrationOptions orchestration,
        SecurityHeadersOptions? securityHeaders = null)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        ArgumentNullException.ThrowIfNull(deployment);
        ArgumentNullException.ThrowIfNull(authentication);
        ArgumentNullException.ThrowIfNull(cors);
        ArgumentNullException.ThrowIfNull(orchestration);

        var errors = new List<string>();
        var profile = deployment.ResolveProfile(environment.EnvironmentName);
        var productionLike = DeploymentOptions.IsProductionLike(profile, environment.IsProduction());

        if (!DeploymentOptions.KnownProfiles.Contains(profile, StringComparer.OrdinalIgnoreCase))
        {
            errors.Add(
                $"Deployment:Profile '{profile}' is not one of {string.Join(", ", DeploymentOptions.KnownProfiles)}.");
        }

        // ── Persistence ────────────────────────────────────────────────
        if (string.IsNullOrWhiteSpace(configuration["MongoDb:ConnectionString"]))
        {
            errors.Add("MongoDb:ConnectionString is required.");
        }

        if (string.IsNullOrWhiteSpace(configuration["MongoDb:DatabaseName"]))
        {
            errors.Add("MongoDb:DatabaseName is required.");
        }

        // ── Orchestration timing ───────────────────────────────────────
        if (orchestration.HeartbeatTimeoutSeconds <= 0)
        {
            errors.Add("Orchestration:HeartbeatTimeoutSeconds must be greater than zero.");
        }

        if (orchestration.HeartbeatCheckIntervalSeconds <= 0)
        {
            errors.Add("Orchestration:HeartbeatCheckIntervalSeconds must be greater than zero.");
        }

        if (orchestration.AuthorityLeaseSeconds <= 0)
        {
            errors.Add("Orchestration:AuthorityLeaseSeconds must be greater than zero.");
        }

        // ── CORS ───────────────────────────────────────────────────────
        if (cors.AllowedOrigins.Any(origin => origin.Trim() == "*"))
        {
            errors.Add("Cors:AllowedOrigins must not contain the wildcard '*'.");
        }

        // ── Swagger / debug surface ────────────────────────────────────
        var swaggerEnabled = deployment.ResolveSwaggerEnabled(environment.EnvironmentName);
        if (productionLike && swaggerEnabled && !deployment.AllowSwaggerInProduction)
        {
            errors.Add(
                "Swagger is enabled for a production-like profile. Set Deployment:EnableSwagger=false, " +
                "or explicitly opt in with Deployment:AllowSwaggerInProduction=true.");
        }

        // ── Identity ───────────────────────────────────────────────────
        if (productionLike && authentication.NormalizedMode == Fabrik3DAuthenticationOptions.Modes.None)
        {
            errors.Add("Authentication:Mode=None is refused for production-like profiles.");
        }

        // ── Historian retention (only when enabled) ────────────────────
        if (configuration.GetValue("Historian:Enabled", false))
        {
            if (configuration.GetValue("Historian:RetentionMaxAgeDays", 7) <= 0)
            {
                errors.Add("Historian:RetentionMaxAgeDays must be greater than zero when the historian is enabled.");
            }

            if (configuration.GetValue("Historian:RetentionMaxSamplesPerSignal", 200000) <= 0)
            {
                errors.Add("Historian:RetentionMaxSamplesPerSignal must be greater than zero when the historian is enabled.");
            }
        }

        // ── Response-hardening headers (S57) ───────────────────────────
        errors.AddRange(SecurityHeaderPolicy.Validate(securityHeaders ?? new SecurityHeadersOptions()));

        return errors;
    }
}
