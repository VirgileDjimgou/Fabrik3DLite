using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S63 bounded public-demo reset: the endpoint exists only in the explicitly enabled demo profile,
/// requires the operate permission (the read-only PublicDemo role cannot reset shared state), and
/// removes only simulated demo state while preserving profile/configuration data.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class DemoResetTests
{
    private const string ValidCellContent = """
        { "schemaVersion": "1.0", "id": "cell-1", "name": "Cell", "worldFrameId": "world", "equipment": [] }
        """;

    private readonly AuthServerFixture _fx;

    public DemoResetTests(AuthServerFixture fx) => _fx = fx;

    private static async Task<HttpClient> CreateClientAsync(
        WebApplicationFactory<Program> factory, string role, string? subject = null)
    {
        var client = factory.CreateClient();
        var token = await AuthServerFixture.RequestTokenAsync(client, role, subject);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        return client;
    }

    private static HttpRequestMessage Post(string url, object? body = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    [Fact]
    public async Task Demo_reset_is_absent_when_the_demo_profile_is_not_enabled()
    {
        // The base fixture runs with Demo:Enabled=false, the production-like default.
        var client = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, "no-demo-operator");

        var response = await client.SendAsync(Post("/api/demo/reset"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorDto>();
        Assert.Equal("not_found", error!.Code);
    }

    [Fact]
    public async Task Auth_config_reports_demo_reset_availability_without_enabling_it_by_default()
    {
        var anonymous = await _fx.CreateAnonymousClientAsync();
        var baseConfig = await anonymous.GetFromJsonAsync<AuthConfigDto>("/api/auth/config");
        Assert.False(baseConfig!.DemoResetEnabled);
        // Test authentication is not OIDC; no browser OIDC block is advertised.
        Assert.Null(baseConfig.Oidc);
    }

    [Fact]
    public async Task Demo_reset_requires_authentication_and_the_operate_permission()
    {
        using var factory = _fx.CreateDemoEnabledFactory();

        // Anonymous is rejected before any state is considered.
        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(Post("/api/demo/reset"))).StatusCode);

        // The read-only public demo identity may read but must never reset shared state.
        var publicDemo = await CreateClientAsync(factory, Fabrik3DRoles.PublicDemo, "public-demo-sub");
        Assert.Equal(HttpStatusCode.Forbidden, (await publicDemo.SendAsync(Post("/api/demo/reset"))).StatusCode);

        // A learner is also read-only for the demo lifecycle.
        var learner = await CreateClientAsync(factory, Fabrik3DRoles.Learner, "demo-learner");
        Assert.Equal(HttpStatusCode.Forbidden, (await learner.SendAsync(Post("/api/demo/reset"))).StatusCode);

        // The enabled profile advertises the reset to authenticated clients.
        var operatorClient = await CreateClientAsync(factory, Fabrik3DRoles.Operator, "demo-operator");
        var config = await operatorClient.GetFromJsonAsync<AuthConfigDto>("/api/auth/config");
        Assert.True(config!.DemoResetEnabled);
    }

    [Fact]
    public async Task Demo_reset_removes_simulated_state_and_preserves_profile_data()
    {
        using var factory = _fx.CreateDemoEnabledFactory();
        var engineer = await CreateClientAsync(factory, Fabrik3DRoles.Engineer, "demo-engineer");
        var operatorClient = await CreateClientAsync(factory, Fabrik3DRoles.Operator, "demo-operator");

        // A profile/configuration asset that a demo reset must never remove.
        var templateName = $"demo-template-{Guid.NewGuid():N}";
        var templateResponse = await engineer.SendAsync(Post("/api/cell-templates", new SaveCellTemplateRequest
        {
            Name = templateName,
            Content = ValidCellContent,
        }));
        Assert.Equal(HttpStatusCode.Created, templateResponse.StatusCode);

        // Simulated demo state.
        var jobResponse = await operatorClient.SendAsync(Post("/api/jobs", new CreateJobRequest { Name = "demo-job" }));
        Assert.Equal(HttpStatusCode.Created, jobResponse.StatusCode);
        Assert.NotEmpty(await operatorClient.GetFromJsonAsync<List<JobDto>>("/api/jobs") ?? []);

        var reset = await operatorClient.SendAsync(Post("/api/demo/reset"));
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        var result = await reset.Content.ReadFromJsonAsync<DemoResetResultDto>();
        Assert.NotNull(result);
        Assert.Equal("demo-operator", result!.ActorId);
        Assert.True(result.Counts.Jobs >= 1, "the created job should have been removed");

        // Simulated state is gone...
        Assert.Empty(await operatorClient.GetFromJsonAsync<List<JobDto>>("/api/jobs") ?? []);

        // ...while the profile asset survives.
        var templates = await operatorClient.GetFromJsonAsync<List<CellTemplateDto>>("/api/cell-templates") ?? [];
        Assert.Contains(templates, template => template.Name == templateName);
    }
}
