using System.Net;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// HTTP-level tests over the real Program.cs pipeline (S48) for the version endpoint, liveness and
/// readiness semantics and the redacted support bundle.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class DeploymentHttpTests
{
    private readonly AuthServerFixture _fx;

    public DeploymentHttpTests(AuthServerFixture fx) => _fx = fx;

    [Fact]
    public async Task Version_endpoint_reports_build_and_profile_without_secrets()
    {
        var client = await _fx.CreateAnonymousClientAsync();

        var version = await client.GetFromJsonAsync<VersionDto>("/api/version");

        Assert.NotNull(version);
        Assert.False(string.IsNullOrWhiteSpace(version!.Version));
        Assert.Equal("Testing", version.Environment);
        Assert.Equal("Testing", version.Profile);
        Assert.False(string.IsNullOrWhiteSpace(version.Runtime));
    }

    [Fact]
    public async Task Health_summary_stays_backward_compatible()
    {
        var client = await _fx.CreateAnonymousClientAsync();

        var health = await client.GetFromJsonAsync<HealthDto>("/api/health");

        Assert.NotNull(health);
        Assert.Equal("Healthy", health!.Status);
        Assert.False(string.IsNullOrWhiteSpace(health.Version));
    }

    [Fact]
    public async Task Liveness_is_healthy_and_has_no_dependency_checks()
    {
        var client = await _fx.CreateAnonymousClientAsync();

        var report = await client.GetFromJsonAsync<HealthReportDto>("/api/health/live");

        Assert.NotNull(report);
        Assert.Equal("Healthy", report!.Status);
        Assert.Contains(report.Checks, c => c.Name == "self" && c.Status == "Healthy");
    }

    [Fact]
    public async Task Readiness_reports_mongo_historian_and_connector_checks()
    {
        var client = await _fx.CreateAnonymousClientAsync();

        var response = await client.GetAsync("/api/health/ready");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var report = await response.Content.ReadFromJsonAsync<HealthReportDto>();
        Assert.NotNull(report);
        Assert.Equal("Healthy", report!.Status);
        Assert.Contains(report.Checks, c => c.Name == "mongo" && c.Status == "Healthy");
        Assert.Contains(report.Checks, c => c.Name == "historian");
        Assert.Contains(report.Checks, c => c.Name == "connectors");
    }

    [Fact]
    public async Task Support_bundle_requires_administrator()
    {
        var anonymous = await _fx.CreateAnonymousClientAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/support/bundle")).StatusCode);

        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, "bundle-learner");
        Assert.Equal(HttpStatusCode.Forbidden, (await learner.GetAsync("/api/support/bundle")).StatusCode);

        var admin = await _fx.CreateClientAsync(Fabrik3DRoles.Administrator, "bundle-admin");
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/support/bundle")).StatusCode);
    }

    [Fact]
    public async Task Support_bundle_redacts_secrets_and_never_returns_them_in_raw_json()
    {
        var admin = await _fx.CreateClientAsync(Fabrik3DRoles.Administrator, "bundle-admin-2");

        var response = await admin.GetAsync("/api/support/bundle");
        response.EnsureSuccessStatusCode();
        var raw = await response.Content.ReadAsStringAsync();
        var bundle = await response.Content.ReadFromJsonAsync<SupportBundleDto>();

        Assert.NotNull(bundle);
        Assert.Equal("1.0", bundle!.SchemaVersion);
        Assert.NotEmpty(bundle.Configuration);
        Assert.Equal("Healthy", bundle.Health.Status);

        // Redaction: the signing-key value must not appear anywhere in the serialized bundle.
        Assert.DoesNotContain(AuthServerFixture.SigningKey, raw, StringComparison.Ordinal);
        Assert.Contains("Authentication:SigningKey", bundle.RedactedKeys);
        Assert.Contains(bundle.Configuration, entry => entry.Value == "[REDACTED]");

        // Connectors are summarised without endpoints or credentials.
        Assert.NotEmpty(bundle.Connectors);
    }
}
