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
/// Multi-organization failure semantics (S43): a missing membership is denied, an ambiguous context
/// fails closed with a 409 and a single membership resolves automatically.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class MultiOrganizationTenancyTests
{
    private readonly AuthServerFixture _fx;

    public MultiOrganizationTenancyTests(AuthServerFixture fx) => _fx = fx;

    private static async Task<HttpClient> CreateClientAsync(
        WebApplicationFactory<Program> factory, string role, string subject)
    {
        var client = factory.CreateClient();
        var token = await AuthServerFixture.RequestTokenAsync(client, role, subject);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        return client;
    }

    [Fact]
    public async Task Missing_membership_fails_closed()
    {
        using var factory = _fx.CreateMultiOrganizationFactory();
        var client = await CreateClientAsync(factory, Fabrik3DRoles.Operator, "no-membership-sub");

        var response = await client.GetAsync("/api/organizations/context");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorDto>();
        Assert.Equal("organization_membership_required", error!.Code);
    }

    [Fact]
    public async Task Ambiguous_membership_requires_explicit_selection()
    {
        using var factory = _fx.CreateMultiOrganizationFactory();
        var memberships = factory.Services.GetRequiredService<MembershipRepository>();
        await memberships.UpsertAsync("org-one", "ambiguous-sub", Fabrik3DRoles.Operator, MembershipStatus.Active);
        await memberships.UpsertAsync("org-two", "ambiguous-sub", Fabrik3DRoles.Operator, MembershipStatus.Active);

        var client = await CreateClientAsync(factory, Fabrik3DRoles.Operator, "ambiguous-sub");
        var response = await client.GetAsync("/api/organizations/context");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorDto>();
        Assert.Equal("organization_selection_required", error!.Code);
    }

    [Fact]
    public async Task Single_membership_resolves_automatically()
    {
        using var factory = _fx.CreateMultiOrganizationFactory();
        var memberships = factory.Services.GetRequiredService<MembershipRepository>();
        await memberships.UpsertAsync("org-only", "single-sub", Fabrik3DRoles.Operator, MembershipStatus.Active);

        var client = await CreateClientAsync(factory, Fabrik3DRoles.Operator, "single-sub");
        var context = await client.GetFromJsonAsync<TenantContextDto>("/api/organizations/context");

        Assert.NotNull(context);
        Assert.Equal("org-only", context!.OrganizationId);
        Assert.False(context.SingleOrganization);
    }
}
