using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Deterministic unit tests for the tenancy scope model and the query builders repositories rely on
/// (S43). They run without MongoDB and pin the legacy-document fallback semantics.
/// </summary>
public class TenantScopeTests
{
    private static BsonDocument Render<T>(FilterDefinition<T> filter)
    {
        var serializer = BsonSerializer.SerializerRegistry.GetSerializer<T>();
        return filter.Render(new RenderArgs<T>(serializer, BsonSerializer.SerializerRegistry));
    }

    [Fact]
    public void Null_scope_produces_an_empty_filter()
    {
        var filter = TenantQuery.For<Job>(null, j => j.OrganizationId);
        Assert.Empty(Render(filter));
    }

    [Fact]
    public void Default_scope_includes_legacy_documents()
    {
        var filter = TenantQuery.For<Job>(TenantScope.Default, j => j.OrganizationId);
        var rendered = Render(filter);

        Assert.True(rendered.Contains("$or"));
        var alternatives = rendered["$or"].AsBsonArray;
        Assert.Equal(2, alternatives.Count);
        Assert.Contains(alternatives, entry => entry["OrganizationId"].IsBsonNull);
        Assert.Contains(alternatives, entry =>
            !entry["OrganizationId"].IsBsonNull
            && entry["OrganizationId"].AsString == TenantSchema.DefaultOrganizationId);
    }

    [Fact]
    public void Non_default_scope_is_a_single_tenant_equality()
    {
        var filter = TenantQuery.For<Job>(TenantScope.ForOrganization("org-b"), j => j.OrganizationId);
        var rendered = Render(filter);

        Assert.False(rendered.Contains("$or"));
        Assert.Equal("org-b", rendered["OrganizationId"].AsString);
    }

    [Fact]
    public void Platform_admin_scope_is_unfiltered()
    {
        var filter = TenantQuery.For<Job>(TenantScope.ForOrganization("org-b", platformAdmin: true), j => j.OrganizationId);
        Assert.Empty(Render(filter));
    }

    [Fact]
    public void ForOrganization_normalizes_blank_ids_to_the_default_organization()
    {
        Assert.Equal(TenantSchema.DefaultOrganizationId, TenantScope.ForOrganization("  ").OrganizationId);
        Assert.Equal("org-x", TenantScope.ForOrganization(" org-x ").OrganizationId);
        Assert.True(TenantScope.Default.IsDefaultOrganization);
        Assert.True(TenantScope.Default.IncludesLegacyDocuments);
        Assert.False(TenantScope.ForOrganization("org-x").IncludesLegacyDocuments);
    }

    [Fact]
    public void BackfillOrganizationId_prefers_existing_then_scope_then_default()
    {
        Assert.Equal("existing", TenantQuery.BackfillOrganizationId("existing", TenantScope.ForOrganization("org-x")));
        Assert.Equal("org-x", TenantQuery.BackfillOrganizationId(null, TenantScope.ForOrganization("org-x")));
        Assert.Equal(TenantSchema.DefaultOrganizationId, TenantQuery.BackfillOrganizationId(null, null));
    }
}
