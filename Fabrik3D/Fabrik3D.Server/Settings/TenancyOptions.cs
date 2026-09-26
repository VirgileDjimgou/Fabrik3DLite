namespace Fabrik3D.Server.Settings;

/// <summary>
/// Tenancy configuration (S43). Single-organization on-premise deployments keep working with zero
/// friction: every request resolves to the deterministic default organization. Multi-organization
/// mode additionally requires an active membership before tenant-scoped data is served.
/// </summary>
public sealed class TenancyOptions
{
    public const string SectionName = "Tenancy";

    /// <summary>When false, tenant resolution is disabled and repositories are unscoped.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// True (default) for the common on-premise/single-organization install: no membership is
    /// required and everything resolves to the default organization. When false, membership
    /// resolution is enforced and an ambiguous context fails closed.
    /// </summary>
    public bool SingleOrganization { get; set; } = true;

    /// <summary>Enables the optional cross-organization platform-admin claim.</summary>
    public bool PlatformAdminEnabled { get; set; } = true;
}
