namespace Fabrik3D.Domain.Organizations;

/// <summary>
/// Versioned tenancy vocabulary (S43). Organizations are the tenant boundary; every tenant-scoped
/// document carries an explicit <c>OrganizationId</c> so the boundary is data, not convention.
/// </summary>
public static class TenantSchema
{
    /// <summary>Document schema version written to organization/membership/class documents.</summary>
    public const string Version = "1.0";

    /// <summary>
    /// Deterministic id of the default organization. Existing single-organization deployments and all
    /// legacy documents that predate S43 resolve to this organization.
    /// </summary>
    public const string DefaultOrganizationId = "default";

    public const string DefaultOrganizationName = "Default organization";

    public const string DefaultOrganizationSlug = "default";

    /// <summary>
    /// Token claim carrying the server-resolved active organization. It is issued by the identity
    /// provider; a client cannot forge it without a validly signed token.
    /// </summary>
    public const string OrganizationClaim = "org";

    /// <summary>Optional platform-admin claim; grants cross-organization administration.</summary>
    public const string PlatformAdminClaim = "platform_admin";

    /// <summary>
    /// Documentation-only header a client may send to request a specific organization. The server
    /// validates it against membership and never trusts it blindly.
    /// </summary>
    public const string OrganizationHeader = "X-Organization-Id";

    public static bool IsDefault(string? organizationId) =>
        string.Equals(organizationId, DefaultOrganizationId, StringComparison.Ordinal);
}

/// <summary>Wire/status values for a membership.</summary>
public enum MembershipStatus
{
    Active,
    Suspended,
    Revoked,
}

/// <summary>
/// The active tenant scope for one server operation. A <c>null</c> scope means "no tenant context"
/// (direct repository use in tests / legacy callers) and is treated as unscoped; the server always
/// supplies a scope for HTTP traffic.
/// </summary>
/// <param name="OrganizationId">Organization the operation is scoped to.</param>
/// <param name="IsPlatformAdmin">True when the principal may act across organizations.</param>
public sealed record TenantScope(string OrganizationId, bool IsPlatformAdmin = false)
{
    /// <summary>The default organization scope.</summary>
    public static TenantScope Default { get; } = new(TenantSchema.DefaultOrganizationId);

    public static TenantScope ForOrganization(string organizationId, bool platformAdmin = false)
    {
        var normalized = string.IsNullOrWhiteSpace(organizationId)
            ? TenantSchema.DefaultOrganizationId
            : organizationId.Trim();
        return new TenantScope(normalized, platformAdmin);
    }

    public bool IsDefaultOrganization => TenantSchema.IsDefault(OrganizationId);

    /// <summary>
    /// Legacy documents without an <c>OrganizationId</c> are readable only through the default
    /// organization; they are never visible to another tenant. Platform admins see everything.
    /// </summary>
    public bool IncludesLegacyDocuments => IsPlatformAdmin || IsDefaultOrganization;
}

/// <summary>
/// Ambient tenant context consumed by repositories. Implemented by the HTTP boundary; domain and
/// infrastructure code never depends on <c>HttpContext</c>.
/// </summary>
public interface ITenantContext
{
    /// <summary>Current scope, or <c>null</c> when there is no tenant context.</summary>
    TenantScope? Scope { get; }

    /// <summary>Effective organization id; falls back to the default organization.</summary>
    string OrganizationId => Scope?.OrganizationId ?? TenantSchema.DefaultOrganizationId;

    /// <summary>True when the active organization came from a validated client selection.</summary>
    bool ClientSelectionAccepted => false;
}
