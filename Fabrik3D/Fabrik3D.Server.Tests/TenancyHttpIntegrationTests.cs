using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// HTTP-level tenancy enforcement over the real Program.cs pipeline (S43): forged client-supplied
/// organization ids are rejected with a structured error, validated selections are accepted, and
/// jobs created in one organization are invisible to another.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class TenancyHttpIntegrationTests
{
    private readonly AuthServerFixture _fx;

    public TenancyHttpIntegrationTests(AuthServerFixture fx) => _fx = fx;

    private MembershipRepository Memberships => _fx.Factory.Services.GetRequiredService<MembershipRepository>();

    private async Task<HttpClient> CreateScopedClientAsync(string role, string subject, string? organizationId)
    {
        var client = await _fx.CreateClientAsync(role, subject);
        if (!string.IsNullOrWhiteSpace(organizationId))
        {
            client.DefaultRequestHeaders.Add(TenantSchema.OrganizationHeader, organizationId);
        }
        return client;
    }

    [Fact]
    public async Task Forged_organization_header_without_membership_is_rejected()
    {
        var client = await CreateScopedClientAsync(Fabrik3DRoles.Operator, "forged-sub", "org-forged");

        var response = await client.GetAsync("/api/organizations/context");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorDto>();
        Assert.NotNull(error);
        Assert.Equal("organization_not_available", error!.Code);
    }

    [Fact]
    public async Task Active_membership_accepts_the_client_selection()
    {
        await Memberships.UpsertAsync("org-accepted", "member-sub", Fabrik3DRoles.Operator, MembershipStatus.Active);
        var client = await CreateScopedClientAsync(Fabrik3DRoles.Operator, "member-sub", "org-accepted");

        var context = await client.GetFromJsonAsync<TenantContextDto>("/api/organizations/context");

        Assert.NotNull(context);
        Assert.Equal("org-accepted", context!.OrganizationId);
        Assert.True(context.ClientSelectionAccepted);
        Assert.False(context.PlatformAdmin);
    }

    [Fact]
    public async Task Revoked_membership_is_rejected()
    {
        await Memberships.UpsertAsync("org-revoked", "revoked-sub", Fabrik3DRoles.Operator, MembershipStatus.Revoked);
        var client = await CreateScopedClientAsync(Fabrik3DRoles.Operator, "revoked-sub", "org-revoked");

        var response = await client.GetAsync("/api/organizations/context");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Jobs_are_isolated_between_organizations_over_http()
    {
        await Memberships.UpsertAsync("org-tenant", "tenant-op", Fabrik3DRoles.Operator, MembershipStatus.Active);

        var tenantClient = await CreateScopedClientAsync(Fabrik3DRoles.Operator, "tenant-op", "org-tenant");
        var created = await tenantClient.PostAsJsonAsync("/api/jobs", new CreateJobRequest { Name = $"tenant-job-{Guid.NewGuid():N}" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var job = await created.Content.ReadFromJsonAsync<JobDto>();
        Assert.NotNull(job);

        // The tenant sees its own job.
        Assert.Contains(await tenantClient.GetFromJsonAsync<List<JobDto>>("/api/jobs") ?? [], j => j.Id == job!.Id);
        Assert.Equal(HttpStatusCode.OK, (await tenantClient.GetAsync($"/api/jobs/{job!.Id}")).StatusCode);

        // A different (default-organization) identity cannot see or fetch it.
        var otherClient = await CreateScopedClientAsync(Fabrik3DRoles.Operator, "other-op", null);
        Assert.DoesNotContain(await otherClient.GetFromJsonAsync<List<JobDto>>("/api/jobs") ?? [], j => j.Id == job.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await otherClient.GetAsync($"/api/jobs/{job.Id}")).StatusCode);
    }

    [Fact]
    public async Task Organization_creator_becomes_the_first_administrator()
    {
        var slug = $"creator-org-{Guid.NewGuid():N}";
        var admin = await _fx.CreateClientAsync(Fabrik3DRoles.Administrator, $"creator-admin-{Guid.NewGuid():N}");

        var created = await admin.PostAsJsonAsync(
            "/api/organizations", new CreateOrganizationRequest { Name = "Creator Org", Slug = slug });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var organization = await created.Content.ReadFromJsonAsync<OrganizationDto>();
        Assert.NotNull(organization);

        // Administering the new organization works because the creator was granted an active
        // Administrator membership; without it a freshly created organization would be orphaned.
        var membership = await admin.PutAsJsonAsync(
            $"/api/organizations/{organization!.Id}/memberships",
            new UpsertMembershipRequest { Subject = "created-learner", Role = Fabrik3DRoles.Learner });
        Assert.Equal(HttpStatusCode.OK, membership.StatusCode);

        var memberships = await admin.GetFromJsonAsync<List<MembershipDto>>(
            $"/api/organizations/{organization.Id}/memberships");
        Assert.NotNull(memberships);
        Assert.Contains(memberships!, m =>
            m.Role == Fabrik3DRoles.Administrator && m.Status == nameof(MembershipStatus.Active));
    }

    [Fact]
    public async Task Auth_me_reports_the_resolved_organization()
    {
        await Memberships.UpsertAsync("org-me", "me-sub", Fabrik3DRoles.Instructor, MembershipStatus.Active);
        var client = await CreateScopedClientAsync(Fabrik3DRoles.Instructor, "me-sub", "org-me");

        var me = await client.GetFromJsonAsync<AuthMeDto>("/api/auth/me");

        Assert.NotNull(me);
        Assert.Equal("org-me", me!.OrganizationId);
    }
}
