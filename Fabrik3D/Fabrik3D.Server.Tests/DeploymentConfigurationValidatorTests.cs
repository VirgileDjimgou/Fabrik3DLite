using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Deployment;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting.Internal;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Fail-fast deployment configuration validation (S48). Invalid or unsafe configuration must be
/// rejected before the server can serve traffic, and production-like profiles must reject an
/// exposed Swagger/debug surface and a wildcard CORS origin.
/// </summary>
public class DeploymentConfigurationValidatorTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value))
            .Build();

    private static IConfiguration ValidConfig() => Config(
        ("MongoDb:ConnectionString", "mongodb://localhost:27017"),
        ("MongoDb:DatabaseName", "Fabrik3D"));

    private static (DeploymentOptions Deployment, Fabrik3DAuthenticationOptions Auth, CorsOptions Cors, OrchestrationOptions Orchestration)
        Defaults() => (
            new DeploymentOptions { Profile = "Testing", EnableSwagger = true },
            new Fabrik3DAuthenticationOptions { Mode = "Test", SigningKey = "test-key" },
            new CorsOptions(),
            new OrchestrationOptions());

    [Fact]
    public void Valid_configuration_produces_no_errors()
    {
        var (deployment, auth, cors, orchestration) = Defaults();
        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Testing" },
            deployment, auth, cors, orchestration);

        Assert.Empty(errors);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Missing_mongo_connection_string_is_rejected(string connectionString)
    {
        var (deployment, auth, cors, orchestration) = Defaults();
        var config = Config(
            ("MongoDb:ConnectionString", connectionString),
            ("MongoDb:DatabaseName", "Fabrik3D"));

        var errors = DeploymentConfigurationValidator.Validate(
            config, new HostingEnvironment { EnvironmentName = "Testing" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("MongoDb:ConnectionString"));
    }

    [Fact]
    public void Missing_database_name_is_rejected()
    {
        var (deployment, auth, cors, orchestration) = Defaults();
        var config = Config(
            ("MongoDb:ConnectionString", "mongodb://localhost:27017"),
            ("MongoDb:DatabaseName", ""));

        var errors = DeploymentConfigurationValidator.Validate(
            config, new HostingEnvironment { EnvironmentName = "Testing" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("MongoDb:DatabaseName"));
    }

    [Fact]
    public void Non_positive_orchestration_timings_are_rejected()
    {
        var (deployment, auth, cors, _) = Defaults();
        var orchestration = new OrchestrationOptions
        {
            HeartbeatTimeoutSeconds = 0,
            HeartbeatCheckIntervalSeconds = -1,
            AuthorityLeaseSeconds = 0,
        };

        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Testing" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("HeartbeatTimeoutSeconds"));
        Assert.Contains(errors, e => e.Contains("HeartbeatCheckIntervalSeconds"));
        Assert.Contains(errors, e => e.Contains("AuthorityLeaseSeconds"));
    }

    [Fact]
    public void Wildcard_cors_origin_is_rejected()
    {
        var (deployment, auth, _, orchestration) = Defaults();
        var cors = new CorsOptions { AllowedOrigins = ["*"] };

        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Production" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("wildcard"));
    }

    [Fact]
    public void Production_like_profile_rejects_swagger_without_explicit_opt_in()
    {
        var (_, auth, cors, orchestration) = Defaults();
        var deployment = new DeploymentOptions { Profile = "OnPrem", EnableSwagger = true };

        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Production" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("Swagger is enabled"));
    }

    [Fact]
    public void Production_like_profile_allows_swagger_with_explicit_opt_in()
    {
        var (_, auth, cors, orchestration) = Defaults();
        var deployment = new DeploymentOptions
        {
            Profile = "OnPrem",
            EnableSwagger = true,
            AllowSwaggerInProduction = true,
        };

        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Production" },
            deployment, auth, cors, orchestration);

        Assert.DoesNotContain(errors, e => e.Contains("Swagger"));
    }

    [Fact]
    public void Production_like_profile_rejects_anonymous_authentication()
    {
        var (deployment, _, cors, orchestration) = Defaults();
        deployment.Profile = "Production";
        deployment.EnableSwagger = false;
        var auth = new Fabrik3DAuthenticationOptions { Mode = "None" };

        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Production" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("Authentication:Mode=None"));
    }

    [Fact]
    public void Unknown_profile_is_rejected()
    {
        var (deployment, auth, cors, orchestration) = Defaults();
        deployment.Profile = "Somewhere";

        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Testing" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("Deployment:Profile"));
    }

    [Fact]
    public void Production_profile_from_environment_is_production_like()
    {
        var (deployment, auth, cors, orchestration) = Defaults();
        deployment.Profile = null;
        deployment.EnableSwagger = true;

        var errors = DeploymentConfigurationValidator.Validate(
            ValidConfig(), new HostingEnvironment { EnvironmentName = "Production" },
            deployment, auth, cors, orchestration);

        Assert.Contains(errors, e => e.Contains("Swagger is enabled"));
    }
}
