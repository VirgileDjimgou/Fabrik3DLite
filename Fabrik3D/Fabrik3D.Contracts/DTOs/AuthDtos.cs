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
/// <param name="Oidc">
/// Browser OIDC Authorization Code + PKCE settings when <see cref="Mode"/> is Oidc and a browser
/// client is configured; null otherwise. Contains only public values (authority, client id, scopes,
/// redirect path): no secret and no token.
/// </param>
/// <param name="DemoResetEnabled">
/// True when this deployment is an explicit public-demo profile that offers the bounded,
/// audited demo reset. False in every production profile.
/// </param>
public record AuthConfigDto(
    string Mode,
    bool DevelopmentAuth,
    bool PublicDemoEnabled,
    IReadOnlyList<string> Roles,
    string? Warning,
    OidcBrowserConfigDto? Oidc = null,
    bool DemoResetEnabled = false);

/// <summary>
/// Public browser OIDC configuration for Authorization Code + PKCE. Standard OIDC only: the browser
/// discovers endpoints from the authority metadata; no provider-specific behaviour is configured
/// here. The client id is public by definition for a public (SPA) client and no secret is exposed.
/// </summary>
/// <param name="Authority">OIDC authority base URL (metadata is fetched from <c>/.well-known/openid-configuration</c>).</param>
/// <param name="ClientId">Public OAuth2 client id registered for the browser application.</param>
/// <param name="Scopes">Requested scopes (always includes <c>openid</c>).</param>
/// <param name="RedirectPath">Same-origin path that receives the authorization code callback.</param>
/// <param name="PostLogoutRedirectPath">Optional same-origin path after RP-initiated logout.</param>
/// <param name="EndSessionEnabled">True when RP-initiated logout should be attempted.</param>
public record OidcBrowserConfigDto(
    string Authority,
    string ClientId,
    IReadOnlyList<string> Scopes,
    string RedirectPath,
    string? PostLogoutRedirectPath,
    bool EndSessionEnabled);

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
