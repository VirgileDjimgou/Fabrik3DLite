using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S57 cross-tenant negative matrix over the real Program.cs pipeline in multi-organization mode.
/// Every listed domain must fail non-leakingly across organizations: Jobs, simulation sessions,
/// tasks, cell templates, signal mappings and training sessions return not-found (or an empty
/// collection) instead of exposing another tenant's data, and reads/mutations are refused.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class CrossTenantNegativeMatrixTests
{
    private const string ValidCellContent = """
        { "schemaVersion": "1.0", "id": "cell-1", "name": "Cell", "worldFrameId": "world", "equipment": [] }
        """;

    private readonly AuthServerFixture _fx;

    public CrossTenantNegativeMatrixTests(AuthServerFixture fx) => _fx = fx;

    private static async Task<HttpClient> CreateScopedClientAsync(
        WebApplicationFactory<Program> factory, string role, string subject, string organizationId)
    {
        var client = factory.CreateClient();
        var token = await AuthServerFixture.RequestTokenAsync(client, role, subject);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        client.DefaultRequestHeaders.Add(TenantSchema.OrganizationHeader, organizationId);
        return client;
    }

    private static async Task<(WebApplicationFactory<Program> Factory, HttpClient Owner, HttpClient Outsider)> CreatePairAsync(
        AuthServerFixture fx, string role, string domain)
    {
        var factory = fx.CreateMultiOrganizationFactory();
        var memberships = factory.Services.GetRequiredService<MembershipRepository>();
        var owner = $"owner-{domain}-{Guid.NewGuid():N}";
        var outsider = $"outsider-{domain}-{Guid.NewGuid():N}";
        var ownerOrg = $"org-{domain}-a-{Guid.NewGuid():N}";
        var outsiderOrg = $"org-{domain}-b-{Guid.NewGuid():N}";
        await memberships.UpsertAsync(ownerOrg, owner, role, MembershipStatus.Active);
        await memberships.UpsertAsync(outsiderOrg, outsider, role, MembershipStatus.Active);
        return (
            factory,
            await CreateScopedClientAsync(factory, role, owner, ownerOrg),
            await CreateScopedClientAsync(factory, role, outsider, outsiderOrg));
    }

    [Fact]
    public async Task Jobs_sessions_and_tasks_cannot_be_observed_or_mutated_across_organizations()
    {
        var (factory, owner, outsider) = await CreatePairAsync(_fx, Fabrik3DRoles.Operator, "jobs");
        using var _ = factory;

        var created = await owner.PostAsJsonAsync("/api/jobs", new CreateJobRequest { Name = $"iso-{Guid.NewGuid():N}" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var job = await created.Content.ReadFromJsonAsync<JobDto>();
        Assert.NotNull(job);

        // Starting the job in organization A persists a simulation session in that same organization.
        var started = await owner.PostAsJsonAsync($"/api/jobs/{job!.Id}/start", new { });
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var running = await started.Content.ReadFromJsonAsync<JobDto>();
        Assert.NotNull(running);
        Assert.False(string.IsNullOrWhiteSpace(running!.SimulationSessionId));

        // The outsider sees nothing in its own list and cannot fetch, start, or delete the job.
        Assert.DoesNotContain(await outsider.GetFromJsonAsync<List<JobDto>>("/api/jobs") ?? [], j => j.Id == job.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/jobs/{job.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsJsonAsync($"/api/jobs/{job.Id}/start", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.DeleteAsync($"/api/jobs/{job.Id}")).StatusCode);

        // Session and implied task access are equally non-leaking.
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/simulation-sessions/{running.SimulationSessionId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/simulation-sessions/by-job/{job.Id}")).StatusCode);

        // Organization A still owns and reads its data.
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/jobs/{job.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/simulation-sessions/{running.SimulationSessionId}")).StatusCode);
    }

    [Fact]
    public async Task Cell_templates_cannot_be_read_or_mutated_across_organizations()
    {
        var (factory, owner, outsider) = await CreatePairAsync(_fx, Fabrik3DRoles.Engineer, "templates");
        using var _ = factory;

        var created = await owner.PostAsJsonAsync("/api/cell-templates",
            new SaveCellTemplateRequest { Name = $"template-{Guid.NewGuid():N}", Content = ValidCellContent });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var template = await created.Content.ReadFromJsonAsync<CellTemplateDto>();
        Assert.NotNull(template);

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/cell-templates/{template!.Id}")).StatusCode);
        Assert.DoesNotContain(
            await outsider.GetFromJsonAsync<List<CellTemplateDto>>("/api/cell-templates") ?? [],
            t => t.Id == template.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PutAsJsonAsync(
            $"/api/cell-templates/{template.Id}",
            new SaveCellTemplateRequest { Name = "hijacked", Content = ValidCellContent })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.DeleteAsync($"/api/cell-templates/{template.Id}")).StatusCode);

        // The owner still sees the untouched template.
        var owned = await owner.GetFromJsonAsync<CellTemplateDto>($"/api/cell-templates/{template.Id}");
        Assert.NotNull(owned);
        Assert.NotEqual("hijacked", owned!.Name);
    }

    [Fact]
    public async Task Signal_mappings_are_partitioned_by_organization_over_http()
    {
        var (factory, owner, outsider) = await CreatePairAsync(_fx, Fabrik3DRoles.Engineer, "mappings");
        using var _ = factory;

        var document = SignalMappingTestData.SampleDocument();
        var created = await owner.PutAsJsonAsync($"/api/mappings/{document.Id}", document);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/mappings/{document.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsync($"/api/mappings/{document.Id}/apply", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.DeleteAsync($"/api/mappings/{document.Id}")).StatusCode);
        Assert.DoesNotContain(
            await outsider.GetFromJsonAsync<List<SignalMappingSummaryDto>>("/api/mappings") ?? [],
            m => m.Id == document.Id);
        Assert.Empty(await outsider.GetFromJsonAsync<List<SignalMappingAuditDto>>("/api/mappings/audit") ?? []);

        // The owner still sees and can apply its own mapping.
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/mappings/{document.Id}")).StatusCode);
    }

    [Fact]
    public async Task Training_sessions_cannot_be_read_across_organizations()
    {
        var (factory, owner, outsider) = await CreatePairAsync(_fx, Fabrik3DRoles.Learner, "training");
        using var _ = factory;

        var started = await owner.PostAsJsonAsync("/api/training/sessions",
            new StartTrainingSessionRequest { ScenarioId = "pick-and-place" });
        Assert.Equal(HttpStatusCode.Created, started.StatusCode);
        var session = await started.Content.ReadFromJsonAsync<TrainingSessionDto>();
        Assert.NotNull(session);

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/training/sessions/{session!.Id}")).StatusCode);
    }

    [Fact]
    public async Task Diagnostics_and_support_are_policy_guarded()
    {
        var (factory, operatorClient, _) = await CreatePairAsync(_fx, Fabrik3DRoles.Operator, "diagnostics");
        using var __ = factory;
        var anonymous = factory.CreateClient();

        // Diagnostics require authentication; a support bundle additionally requires Admin.
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/diagnostics/status")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await operatorClient.GetAsync("/api/diagnostics/status")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await operatorClient.GetAsync("/api/support/bundle")).StatusCode);
    }
}
