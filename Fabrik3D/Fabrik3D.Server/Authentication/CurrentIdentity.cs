using System.Security.Claims;

namespace Fabrik3D.Server.Authentication;

/// <summary>
/// Authenticated principal as seen by the server boundary. Domain and infrastructure code consumes
/// this abstraction instead of HTTP concerns so identity never leaks into the domain model.
/// </summary>
public interface ICurrentIdentity
{
    bool IsAuthenticated { get; }

    /// <summary>Stable external subject (<c>sub</c>) or "anonymous" when unauthenticated.</summary>
    string Subject { get; }

    string? Name { get; }

    IReadOnlyList<string> Roles { get; }

    /// <summary>Best-effort audit identifier: the subject, never a token.</summary>
    string AuditId { get; }
}

/// <summary>HTTP-backed identity accessor. Falls back to an anonymous identity outside a request.</summary>
public sealed class HttpCurrentIdentity : ICurrentIdentity
{
    private readonly IHttpContextAccessor _accessor;

    public HttpCurrentIdentity(IHttpContextAccessor accessor) => _accessor = accessor;

    private ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public string Subject
    {
        get
        {
            var principal = Principal;
            var subject = principal?.FindFirst(Fabrik3DClaimTypes.Subject)?.Value
                ?? principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!string.IsNullOrWhiteSpace(subject)) return subject!;
            return IsAuthenticated ? (principal?.Identity?.Name ?? "authenticated") : "anonymous";
        }
    }

    public string? Name => Principal?.Identity?.Name ?? Principal?.FindFirst(Fabrik3DClaimTypes.Name)?.Value;

    public IReadOnlyList<string> Roles
    {
        get
        {
            var principal = Principal;
            if (principal is null) return [];
            return principal.FindAll(Fabrik3DClaimTypes.Role)
                .Select(claim => claim.Value)
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }
    }

    public string AuditId => IsAuthenticated ? Subject : "anonymous";
}

/// <summary>Claim types used across token issuance, validation and auditing.</summary>
public static class Fabrik3DClaimTypes
{
    /// <summary>External subject identifier (OIDC <c>sub</c>). Stable and never a local password id.</summary>
    public const string Subject = "sub";

    public const string Name = "name";

    /// <summary>Role claim. <c>role</c> is the OIDC-style single-value claim used by this product.</summary>
    public const string Role = "role";
}
