using System.Security.Claims;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Middleware;

/// <summary>Resolved tenant context for the current request, stored in <c>HttpContext.Items</c>.</summary>
public sealed record TenantContextState(TenantScope? Scope, bool ClientSelectionAccepted);

/// <summary>
/// Resolves the active organization once per request from the authenticated principal and its
/// membership, never from an unvalidated client value. A client may request an organization through
/// the <c>X-Organization-Id</c> header, but the server accepts it only when an active membership
/// exists (or for an optional platform admin). Denials fail closed with a structured error and never
/// reveal whether the organization exists.
/// </summary>
public sealed class TenantContextMiddleware
{
    public const string ItemKey = "Fabrik3D.TenantContext";

    private readonly RequestDelegate _next;
    private readonly ILogger<TenantContextMiddleware> _log;

    public TenantContextMiddleware(RequestDelegate next, ILogger<TenantContextMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(
        HttpContext context,
        ICurrentIdentity identity,
        MembershipRepository memberships,
        IOptions<TenancyOptions> options)
    {
        var opts = options.Value;
        if (!opts.Enabled)
        {
            context.Items[ItemKey] = new TenantContextState(null, false);
            await _next(context);
            return;
        }

        var platformAdmin = IsPlatformAdmin(context.User, opts);
        var requested = context.Request.Headers[TenantSchema.OrganizationHeader].FirstOrDefault();
        var claimed = context.User?.FindFirst(TenantSchema.OrganizationClaim)?.Value;

        TenantScope? scope = null;
        var clientSelectionAccepted = false;
        string? denialReason = null;
        var denialStatus = StatusCodes.Status403Forbidden;

        if (!string.IsNullOrWhiteSpace(requested))
        {
            var requestedOrg = requested.Trim();
            clientSelectionAccepted = true;

            if (platformAdmin)
            {
                scope = TenantScope.ForOrganization(requestedOrg, true);
            }
            else if (identity.IsAuthenticated && await IsActiveMemberAsync(memberships, requestedOrg, identity.Subject))
            {
                scope = TenantScope.ForOrganization(requestedOrg);
            }
            else
            {
                denialReason = "organization_not_available";
            }
        }
        else if (!string.IsNullOrWhiteSpace(claimed))
        {
            if (platformAdmin)
            {
                scope = TenantScope.ForOrganization(claimed, true);
            }
            else if (identity.IsAuthenticated && await IsActiveMemberAsync(memberships, claimed, identity.Subject))
            {
                scope = TenantScope.ForOrganization(claimed);
            }
            else
            {
                denialReason = "organization_not_available";
            }
        }
        else if (opts.SingleOrganization || !identity.IsAuthenticated)
        {
            // Single-organization install, or the clearly-labelled shared public demo identity.
            scope = TenantScope.Default;
        }
        else
        {
            var active = await GetActiveMembershipsAsync(memberships, identity.Subject);
            switch (active.Count)
            {
                case 0:
                    denialReason = "organization_membership_required";
                    break;
                case 1:
                    scope = TenantScope.ForOrganization(active[0]);
                    break;
                default:
                    denialReason = "organization_selection_required";
                    denialStatus = StatusCodes.Status409Conflict;
                    break;
            }
        }

        if (denialReason is not null)
        {
            context.Response.StatusCode = denialStatus;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new ApiErrorDto(
                denialReason,
                denialReason == "organization_selection_required"
                    ? "Multiple organizations are available; select one explicitly and retry."
                    : "The requested organization is not available for this identity.",
                denialStatus));
            return;
        }

        context.Items[ItemKey] = new TenantContextState(scope, clientSelectionAccepted);
        await _next(context);
    }

    private static bool IsPlatformAdmin(ClaimsPrincipal? user, TenancyOptions opts)
    {
        if (!opts.PlatformAdminEnabled || user is null) return false;
        var isAdministrator = user.HasClaim(Fabrik3DClaimTypes.Role, Fabrik3DRoles.Administrator);
        var hasClaim = string.Equals(
            user.FindFirst(TenantSchema.PlatformAdminClaim)?.Value, "true", StringComparison.OrdinalIgnoreCase);
        return isAdministrator && hasClaim;
    }

    private async Task<bool> IsActiveMemberAsync(MembershipRepository memberships, string organizationId, string subject)
    {
        try
        {
            var membership = await memberships.GetAsync(organizationId, subject);
            return membership is { Status: MembershipStatus.Active };
        }
        catch (Exception ex)
        {
            // Fail closed: an unavailable membership store never grants tenant access.
            _log.LogWarning(ex, "[Server][Tenancy] Membership lookup failed for organization {OrganizationId}; denying.", organizationId);
            return false;
        }
    }

    private async Task<List<string>> GetActiveMembershipsAsync(MembershipRepository memberships, string subject)
    {
        try
        {
            var rows = await memberships.GetActiveBySubjectAsync(subject);
            return rows.Select(row => row.OrganizationId).Distinct(StringComparer.Ordinal).ToList();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "[Server][Tenancy] Membership lookup failed for subject {Subject}; denying.", subject);
            return [];
        }
    }
}
