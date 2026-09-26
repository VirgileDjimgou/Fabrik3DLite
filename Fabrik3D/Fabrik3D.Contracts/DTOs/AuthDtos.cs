using System.ComponentModel.DataAnnotations;

namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Public authentication discovery payload. It never contains secrets and is safe to expose so the
/// HMI and simulator can render a correct login surface without guessing the configured mode.
/// </summary>
/// <param name="Mode">Configured authentication mode: Oidc, Development, Test or None.</param>
/// <param name="DevelopmentAuth">True when a development/test identity can be issued locally.</param>
/// <param name="PublicDemoEnabled">True when the clearly-labelled public/demo read role is available.</param>
/// <param name="Roles">Roles the server knows about, in documentation order.</param>
/// <param name="Warning">Prominent non-production warning; null for production OIDC.</param>
public record AuthConfigDto(
    string Mode,
    bool DevelopmentAuth,
    bool PublicDemoEnabled,
    IReadOnlyList<string> Roles,
    string? Warning);

/// <summary>Request for a short-lived development/test identity token. Refused outside dev/test modes.</summary>
public record DevTokenRequest
{
    /// <summary>One of the documented Fabrik3D roles (for example Operator or Engineer).</summary>
    [Required, MinLength(1), MaxLength(50)]
    public string Role { get; init; } = string.Empty;

    /// <summary>Stable external subject identifier. Defaults to a deterministic dev subject.</summary>
    [MaxLength(200)]
    public string? Subject { get; init; }

    /// <summary>Display name for the identity. Defaults to the subject.</summary>
    [MaxLength(200)]
    public string? Name { get; init; }
}

/// <summary>Issued access token plus its identity metadata. Tokens are never placed in URLs or logs.</summary>
public record AuthTokenDto(
    string AccessToken,
    string TokenType,
    DateTime ExpiresAtUtc,
    string Mode,
    string Subject,
    IReadOnlyList<string> Roles);

/// <summary>Current authenticated principal as understood by the server (never trusted from the client).</summary>
public record AuthMeDto(
    string Subject,
    string? Name,
    IReadOnlyList<string> Roles,
    string AuthenticationType,
    string OrganizationId,
    string? OrganizationName);
