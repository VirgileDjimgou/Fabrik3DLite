using Fabrik3D.Domain.Organizations;
using Fabrik3D.Server.Middleware;

namespace Fabrik3D.Server.Authentication;

/// <summary>
/// HTTP-backed tenant context. The active organization is resolved once per request by
/// <see cref="TenantContextMiddleware"/> and read from <c>HttpContext.Items</c>; this
/// type never trusts a raw header by itself. Outside an HTTP request (background services) the
/// scope is <c>null</c>, meaning the operation is unscoped and tenant filters are not applied.
/// </summary>
public sealed class HttpTenantContext : ITenantContext
{
    private readonly IHttpContextAccessor _accessor;

    public HttpTenantContext(IHttpContextAccessor accessor) => _accessor = accessor;

    public TenantScope? Scope
    {
        get
        {
            var context = _accessor.HttpContext;
            if (context is null) return null;

            if (context.Items.TryGetValue(TenantContextMiddleware.ItemKey, out var value)
                && value is TenantContextState state)
            {
                return state.Scope;
            }

            return FallbackScope(context.User);
        }
    }

    public bool ClientSelectionAccepted =>
        _accessor.HttpContext?.Items.TryGetValue(TenantContextMiddleware.ItemKey, out var value) == true
        && value is TenantContextState { ClientSelectionAccepted: true };

    /// <summary>
    /// Derives a scope directly from validated claims when the middleware did not run (for example a
    /// deliberately unscoped endpoint). Never reads a client-supplied header.
    /// </summary>
    internal static TenantScope FallbackScope(System.Security.Claims.ClaimsPrincipal? user)
    {
        var organizationId = user?.FindFirst(TenantSchema.OrganizationClaim)?.Value;
        var platformAdmin = user?.HasClaim(Fabrik3DClaimTypes.Role, Fabrik3DRoles.Administrator) == true
            && user?.HasClaim(TenantSchema.PlatformAdminClaim, "true") == true;
        return TenantScope.ForOrganization(organizationId ?? TenantSchema.DefaultOrganizationId, platformAdmin);
    }
}
