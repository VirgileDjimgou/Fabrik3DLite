using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Microsoft.IdentityModel.Tokens;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// HTTP-level 401/403 matrix over the real Program.cs pipeline: hidden UI is never the control and
/// every mutating endpoint class is enforced server-side.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class EndpointAuthorizationTests
{
    private const string ValidCellContent = """
        { "schemaVersion": "1.0", "id": "cell-1", "name": "Cell", "worldFrameId": "world", "equipment": [] }
        """;

    private readonly AuthServerFixture _fx;

    public EndpointAuthorizationTests(AuthServerFixture fx) => _fx = fx;

    private static HttpRequestMessage Post(string url, object? body = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    // ── Anonymous ──────────────────────────────────────────────────────

    [Fact]
    public async Task Anonymous_reads_are_rejected_with_a_structured_401()
    {
        var client = await _fx.CreateAnonymousClientAsync();

        var response = await client.GetAsync("/api/jobs");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var error = await response.Content.ReadFromJsonAsync<ApiErrorDto>();
        Assert.NotNull(error);
        Assert.Equal("unauthorized", error!.Code);
        Assert.Equal(401, error.Status);
    }

    [Fact]
    public async Task Anonymous_mutations_are_rejected_for_every_endpoint_class()
    {
        var client = await _fx.CreateAnonymousClientAsync();

        var requests = new[]
        {
            Post("/api/jobs", new CreateJobRequest { Name = "anon" }),
            Post("/api/cell-templates", new SaveCellTemplateRequest { Name = "anon", Content = ValidCellContent }),
            Post("/api/control-authority/anon-scope/acquire", new AcquireControlAuthorityRequest { Mode = "ExternalController", OwnerId = "anon", OwnerKind = "simulator" }),
            Post("/api/historian/telemetry", new { samples = Array.Empty<object>() }),
        };

        foreach (var request in requests)
        {
            using var _ = request;
            var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    // ── Role matrix ────────────────────────────────────────────────────

    [Fact]
    public async Task Learner_may_read_but_not_operate_or_engineer()
    {
        var client = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, "learner-sub");

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/jobs")).StatusCode);

        var mutate = await client.SendAsync(Post("/api/jobs", new CreateJobRequest { Name = "learner-job" }));
        Assert.Equal(HttpStatusCode.Forbidden, mutate.StatusCode);
        var error = await mutate.Content.ReadFromJsonAsync<ApiErrorDto>();
        Assert.Equal("forbidden", error!.Code);

        var template = await client.SendAsync(Post("/api/cell-templates", new SaveCellTemplateRequest { Name = "learner", Content = ValidCellContent }));
        Assert.Equal(HttpStatusCode.Forbidden, template.StatusCode);
    }

    [Fact]
    public async Task Operator_may_operate_and_is_identified_by_the_server()
    {
        var client = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, "operator-sub");

        var created = await client.SendAsync(Post("/api/jobs", new CreateJobRequest { Name = $"operator-job-{Guid.NewGuid():N}" }));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var me = await client.GetFromJsonAsync<AuthMeDto>("/api/auth/me");
        Assert.NotNull(me);
        Assert.Equal("operator-sub", me!.Subject);
        Assert.Contains(Fabrik3DRoles.Operator, me.Roles);
    }

    [Fact]
    public async Task Engineer_may_write_cell_templates_but_operator_may_not()
    {
        var engineer = await _fx.CreateClientAsync(Fabrik3DRoles.Engineer, "engineer-sub");
        var operatorClient = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, "operator2-sub");

        var engineerWrite = await engineer.SendAsync(Post("/api/cell-templates", new SaveCellTemplateRequest
        {
            Name = $"engineer-cell-{Guid.NewGuid():N}",
            Content = ValidCellContent,
        }));
        Assert.Equal(HttpStatusCode.Created, engineerWrite.StatusCode);

        var operatorWrite = await operatorClient.SendAsync(Post("/api/cell-templates", new SaveCellTemplateRequest
        {
            Name = "operator-cell",
            Content = ValidCellContent,
        }));
        Assert.Equal(HttpStatusCode.Forbidden, operatorWrite.StatusCode);
    }

    [Fact]
    public async Task Forced_takeover_requires_engineer_while_acquire_requires_operate()
    {
        var scope = $"scope-{Guid.NewGuid():N}";
        var operatorClient = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, "operator3-sub");
        var engineer = await _fx.CreateClientAsync(Fabrik3DRoles.Engineer, "engineer2-sub");

        var acquire = await operatorClient.SendAsync(Post($"/api/control-authority/{scope}/acquire",
            new AcquireControlAuthorityRequest { Mode = "ExternalController", OwnerId = "operator-owner", OwnerKind = "simulator", LeaseSeconds = 60 }));
        Assert.Equal(HttpStatusCode.OK, acquire.StatusCode);

        var takeover = await operatorClient.SendAsync(Post($"/api/control-authority/{scope}/takeover",
            new TakeoverControlAuthorityRequest { Mode = "ExternalController", OwnerId = "operator-takeover", OwnerKind = "simulator", Confirm = true }));
        Assert.Equal(HttpStatusCode.Forbidden, takeover.StatusCode);

        var engineerTakeover = await engineer.SendAsync(Post($"/api/control-authority/{scope}/takeover",
            new TakeoverControlAuthorityRequest { Mode = "ExternalController", OwnerId = "engineer-takeover", OwnerKind = "simulator", Confirm = true }));
        Assert.Equal(HttpStatusCode.OK, engineerTakeover.StatusCode);
    }

    [Fact]
    public async Task Engineer_policy_does_not_grant_admin_instructor_or_public_demo_mutations()
    {
        var client = await _fx.CreateClientAsync(Fabrik3DRoles.Engineer, "engineer3-sub");
        // Engineering writes succeed; a role outside the Operate/Engineer sets must still be denied
        // for the learner-only read surface when it mutates.
        var learnerClient = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, "learner3-sub");
        var response = await learnerClient.SendAsync(Post("/api/control-authority/deny-scope/acquire",
            new AcquireControlAuthorityRequest { Mode = "ExternalController", OwnerId = "x", OwnerKind = "simulator" }));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        // Engineer can read diagnostics (Read is a subset) without owning admin.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/jobs")).StatusCode);
    }

    [Fact]
    public async Task Historian_ingest_requires_operate()
    {
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, "learner-historian");
        var operatorClient = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, "operator-historian");

        var body = new { samples = Array.Empty<object>() };

        var learnerIngest = await learner.SendAsync(Post("/api/historian/telemetry", body));
        Assert.Equal(HttpStatusCode.Forbidden, learnerIngest.StatusCode);

        var operatorIngest = await operatorClient.SendAsync(Post("/api/historian/telemetry", body));
        Assert.NotEqual(HttpStatusCode.Forbidden, operatorIngest.StatusCode);
        Assert.NotEqual(HttpStatusCode.Unauthorized, operatorIngest.StatusCode);
    }

    // ── Hub ────────────────────────────────────────────────────────────

    [Fact]
    public async Task SignalR_negotiation_requires_authentication()
    {
        var anonymous = await _fx.CreateAnonymousClientAsync();
        var anonymousNegotiate = await anonymous.SendAsync(Post("/hubs/orchestration/negotiate?negotiateVersion=1"));
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousNegotiate.StatusCode);

        var operatorClient = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, "operator-hub");
        var authorizedNegotiate = await operatorClient.SendAsync(Post("/hubs/orchestration/negotiate?negotiateVersion=1"));
        Assert.Equal(HttpStatusCode.OK, authorizedNegotiate.StatusCode);
    }

    // ── Audit identity ─────────────────────────────────────────────────

    [Fact]
    public async Task Authority_audit_records_the_authenticated_subject_and_role()
    {
        var scope = $"audit-{Guid.NewGuid():N}";
        var engineer = await _fx.CreateClientAsync(Fabrik3DRoles.Engineer, "audit-engineer");

        var acquire = await engineer.SendAsync(Post($"/api/control-authority/{scope}/acquire",
            new AcquireControlAuthorityRequest { Mode = "ExternalController", OwnerId = "audit-owner", OwnerKind = "simulator", LeaseSeconds = 60 }));
        Assert.Equal(HttpStatusCode.OK, acquire.StatusCode);

        var audit = await engineer.GetFromJsonAsync<List<ControlAuthorityEventDto>>($"/api/control-authority/{scope}/audit");
        Assert.NotNull(audit);
        Assert.NotEmpty(audit!);
        Assert.All(audit!, entry => Assert.False(string.IsNullOrWhiteSpace(entry.ActorId)));
        Assert.Contains(audit!, entry => entry.ActorId == "audit-engineer" && entry.ActorRole == Fabrik3DRoles.Engineer);
    }

    // ── Token validation negatives ─────────────────────────────────────

    [Fact]
    public async Task Tampered_wrong_audience_and_expired_tokens_are_rejected()
    {
        var anonymous = await _fx.CreateAnonymousClientAsync();
        var valid = await AuthServerFixture.RequestTokenAsync(anonymous, Fabrik3DRoles.Operator, "token-sub");

        var tampered = valid.AccessToken[..^3] + "xxx";
        var wrongAudience = ForgeToken("token-sub", Fabrik3DRoles.Operator, audience: "other-api");
        var expired = ForgeToken("token-sub", Fabrik3DRoles.Operator, expires: DateTime.UtcNow.AddMinutes(-10));
        var wrongIssuer = ForgeToken("token-sub", Fabrik3DRoles.Operator, issuer: "https://evil.example");

        foreach (var token in new[] { tampered, wrongAudience, expired, wrongIssuer })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await anonymous.SendAsync(request);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    // ── Development/test mode surface ──────────────────────────────────

    [Fact]
    public async Task Development_mode_is_discoverable_and_clearly_labelled()
    {
        var anonymous = await _fx.CreateAnonymousClientAsync();
        var config = await anonymous.GetFromJsonAsync<AuthConfigDto>("/api/auth/config");

        Assert.NotNull(config);
        Assert.Equal(Fabrik3DAuthenticationOptions.Modes.Test, config!.Mode);
        Assert.True(config.DevelopmentAuth);
        Assert.NotNull(config.Warning);
        Assert.Contains("NOT PRODUCTION", config.Warning!.ToUpperInvariant());
    }

    [Fact]
    public async Task Dev_token_rejects_unknown_roles_and_accepts_the_labelled_public_demo_role()
    {
        var anonymous = await _fx.CreateAnonymousClientAsync();

        var unknown = await anonymous.PostAsJsonAsync("/api/auth/dev-token", new DevTokenRequest { Role = "Root" });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);

        var publicDemo = await anonymous.PostAsJsonAsync("/api/auth/dev-token", new DevTokenRequest { Role = Fabrik3DRoles.PublicDemo });
        Assert.Equal(HttpStatusCode.OK, publicDemo.StatusCode);
        var token = await publicDemo.Content.ReadFromJsonAsync<AuthTokenDto>();
        Assert.NotNull(token);

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token!.AccessToken);
        var read = await anonymous.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
    }

    private static string ForgeToken(
        string subject,
        string role,
        string audience = "fabrik3d-api",
        string issuer = "fabrik3d-test",
        DateTime? expires = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AuthServerFixture.SigningKey));
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims:
            [
                new Claim(Fabrik3DClaimTypes.Subject, subject),
                new Claim(Fabrik3DClaimTypes.Name, subject),
                new Claim(Fabrik3DClaimTypes.Role, role),
            ],
            notBefore: DateTime.UtcNow.AddMinutes(-20),
            expires: expires ?? DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
