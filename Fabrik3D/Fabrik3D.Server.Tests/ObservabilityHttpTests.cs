using System.Net;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Observability;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S49 HTTP-level observability tests over the real Program.cs pipeline: the diagnostics surface is
/// authenticated, the metrics snapshot is exposed in Prometheus and JSON form, simulator reports are
/// bounded and validated, correlation ids are propagated, and observability can be disabled.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class ObservabilityHttpTests
{
    private readonly AuthServerFixture _fx;

    public ObservabilityHttpTests(AuthServerFixture fx) => _fx = fx;

    private WebApplicationFactory<Program> Configured(params (string Key, string Value)[] settings)
        => _fx.Factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, configuration) =>
            {
                configuration.AddInMemoryCollection(
                    settings.ToDictionary(s => s.Key, s => (string?)s.Value));
            });
        });

    [Fact]
    public async Task Diagnostics_status_requires_authentication_and_reports_safe_configuration()
    {
        var anonymous = await _fx.CreateAnonymousClientAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/diagnostics/status")).StatusCode);

        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, "obs-learner");
        var status = await learner.GetFromJsonAsync<ObservabilityStatusDto>("/api/diagnostics/status");

        Assert.NotNull(status);
        Assert.True(status!.Enabled);
        Assert.True(status.MetricsEndpointEnabled);
        Assert.Equal(Fabrik3DObservabilityOptions.Exporters.None, status.Exporter);
        Assert.True(string.IsNullOrWhiteSpace(status.OtlpEndpoint));
        Assert.Equal("Fabrik3D.Server", status.ServiceName);
    }

    [Fact]
    public async Task Metrics_endpoint_returns_prometheus_text_and_json_without_secrets()
    {
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, "obs-metrics");

        var prometheus = await learner.GetAsync("/api/diagnostics/metrics");
        prometheus.EnsureSuccessStatusCode();
        Assert.Equal("text/plain", prometheus.Content.Headers.ContentType?.MediaType);
        var text = await prometheus.Content.ReadAsStringAsync();
        Assert.Contains("fabrik3d.metrics.dropped_series", text, StringComparison.Ordinal);
        Assert.Contains("fabrik3d_connector_enabled", text, StringComparison.Ordinal);
        Assert.Contains("protocol=\"opcua\"", text, StringComparison.Ordinal);

        var json = await learner.GetStringAsync("/api/diagnostics/metrics?format=json");
        Assert.Contains("fabrik3d.connector.enabled", json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Correlation_id_is_echoed_and_generated_when_absent()
    {
        var client = await _fx.CreateAnonymousClientAsync();

        var generated = await client.GetAsync("/api/health");
        var generatedId = generated.Headers.TryGetValues(CorrelationIdMiddleware.HeaderName, out var values)
            ? values.Single()
            : null;
        Assert.False(string.IsNullOrWhiteSpace(generatedId));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        request.Headers.Add(CorrelationIdMiddleware.HeaderName, "s49-correlation-test");
        var echoed = await client.SendAsync(request);
        Assert.True(echoed.Headers.TryGetValues(CorrelationIdMiddleware.HeaderName, out var echoedValues));
        Assert.Equal("s49-correlation-test", echoedValues!.Single());
    }

    [Fact]
    public async Task Simulator_reports_require_operate_and_are_validated()
    {
        var sample = new SimulatorMetricsDto("simulator-1", 16.7, 42, 1200, 4096, 8192, DateTime.UtcNow);

        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, "obs-sim-learner");
        var denied = await learner.PostAsJsonAsync("/api/diagnostics/simulator", sample);
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var anonymous = await _fx.CreateAnonymousClientAsync();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/api/diagnostics/simulator", sample)).StatusCode);

        var operatorClient = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, "obs-sim-operator");
        var accepted = await operatorClient.PostAsJsonAsync("/api/diagnostics/simulator", sample);
        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);

        var invalid = sample with { FrameTimeMs = -1 };
        var rejected = await operatorClient.PostAsJsonAsync("/api/diagnostics/simulator", invalid);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
    }

    [Fact]
    public async Task Simulator_reports_are_rate_limited_on_sensitive_surface()
    {
        using var factory = Configured(("Observability:SimulatorMetricsRateLimitPerMinute", "1"));
        using var client = factory.CreateClient();
        var token = await AuthServerFixture.RequestTokenAsync(client, Fabrik3DRoles.Operator, "obs-rate");
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.AccessToken);

        var sample = new SimulatorMetricsDto("simulator-1", 16.7, 42, 1200, 4096, 8192, DateTime.UtcNow);
        var first = await client.PostAsJsonAsync("/api/diagnostics/simulator", sample);
        var second = await client.PostAsJsonAsync("/api/diagnostics/simulator", sample);

        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.Equal((HttpStatusCode)429, second.StatusCode);
    }

    [Fact]
    public async Task Observability_can_be_disabled_and_the_metrics_surface_disappears()
    {
        using var factory = Configured(("Observability:Enabled", "false"));
        using var client = factory.CreateClient();
        var token = await AuthServerFixture.RequestTokenAsync(client, Fabrik3DRoles.Operator, "obs-disabled");
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.AccessToken);

        var status = await client.GetFromJsonAsync<ObservabilityStatusDto>("/api/diagnostics/status");
        Assert.NotNull(status);
        Assert.False(status!.Enabled);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/diagnostics/metrics")).StatusCode);

        // A disabled exporter must never make the simulator report a failure.
        var sample = new SimulatorMetricsDto("simulator-1", 16.7, 42, 1200, 4096, 8192, DateTime.UtcNow);
        var accepted = await client.PostAsJsonAsync("/api/diagnostics/simulator", sample);
        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);
    }

    [Fact]
    public async Task Auth_dev_token_endpoint_is_rate_limited()
    {
        using var factory = Configured(("Authentication:AuthRateLimitPermitLimit", "2"));
        using var client = factory.CreateClient();

        var responses = new List<HttpStatusCode>();
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var response = await client.PostAsJsonAsync("/api/auth/dev-token", new DevTokenRequest { Role = Fabrik3DRoles.Learner });
            responses.Add(response.StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, responses[0]);
        Assert.Equal(HttpStatusCode.OK, responses[1]);
        Assert.Equal((HttpStatusCode)429, responses[2]);
    }
}
