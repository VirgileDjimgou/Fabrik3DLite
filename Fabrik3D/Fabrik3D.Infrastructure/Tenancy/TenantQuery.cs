using System.Linq.Expressions;
using Fabrik3D.Domain.Organizations;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Tenancy;

/// <summary>
/// Builds tenant-boundary filters for repositories. Centralising the logic makes it hard to omit a
/// tenant filter by accident: a repository either applies <see cref="For{T}"/> or deliberately opts
/// out, and the default-organization fallback for legacy documents is defined once.
/// </summary>
public static class TenantQuery
{
    /// <summary>
    /// Tenant filter for a tenant-scoped entity. A <c>null</c> scope (direct repository use in
    /// tests/legacy callers) yields an empty filter; the server always supplies a scope for HTTP.
    /// </summary>
    public static FilterDefinition<T> For<T>(TenantScope? scope, Expression<Func<T, string?>> organizationId)
    {
        if (scope is null || scope.IsPlatformAdmin)
        {
            return FilterDefinition<T>.Empty;
        }

        var builder = Builders<T>.Filter;
        var scoped = builder.Eq(organizationId, scope.OrganizationId);

        if (scope.IncludesLegacyDocuments)
        {
            // Pre-S43 documents have no OrganizationId field. `{ field: null }` matches both null and
            // missing, so the default organization keeps reading legacy data while other tenants
            // never see it.
            scoped = builder.Or(scoped, builder.Eq(organizationId, (string?)null));
        }

        return scoped;
    }

    /// <summary>Sets an entity's organization id when absent so writes backfill deterministically.</summary>
    public static string BackfillOrganizationId(string? current, TenantScope? scope)
        => string.IsNullOrWhiteSpace(current)
            ? scope?.OrganizationId ?? TenantSchema.DefaultOrganizationId
            : current!;
}
