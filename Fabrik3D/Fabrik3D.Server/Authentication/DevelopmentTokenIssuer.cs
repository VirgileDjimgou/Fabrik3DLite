using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Fabrik3D.Contracts.DTOs;
using Microsoft.IdentityModel.Tokens;

namespace Fabrik3D.Server.Authentication;

/// <summary>
/// Issues short-lived development/test JWT access tokens signed with a symmetric key. This is a
/// clearly-labelled, guarded, non-production identity mode: it never validates a password, never
/// stores credentials and is refused in Production by <see cref="AuthenticationStartupGuard"/>.
/// It exists so CI, local development and the public demo can exercise the same server-side
/// authorization path as a real OIDC provider.
/// </summary>
public sealed class DevelopmentTokenIssuer
{
    private static readonly JwtSecurityTokenHandler Handler = new();

    private readonly Fabrik3DAuthenticationOptions _options;
    private readonly TimeProvider _time;

    public DevelopmentTokenIssuer(
        Microsoft.Extensions.Options.IOptions<Fabrik3DAuthenticationOptions> options,
        TimeProvider time)
    {
        _options = options.Value;
        _time = time;
    }

    /// <summary>True when local identities may be issued (Development or Test mode only).</summary>
    public bool CanIssue => _options.UsesDevelopmentTokens;

    /// <summary>Creates a random, process-local signing key. Never persisted or committed.</summary>
    public static string CreateEphemeralKey()
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));

    /// <summary>
    /// Issues a token for a documented role. Unknown roles are rejected by the controller; this
    /// method assumes the role has already been validated.
    /// </summary>
    public AuthTokenDto Issue(string subject, string role, string? name)
    {
        if (!CanIssue)
        {
            throw new InvalidOperationException("Development/test tokens are not available in the configured authentication mode.");
        }

        if (string.IsNullOrWhiteSpace(_options.SigningKey))
        {
            throw new InvalidOperationException("A signing key is required for development/test token issuance.");
        }

        var now = _time.GetUtcNow().UtcDateTime;
        var expires = now.AddMinutes(Math.Clamp(_options.AccessTokenLifetimeMinutes, 1, 1440));

        var claims = new List<Claim>
        {
            new(Fabrik3DClaimTypes.Subject, subject),
            new(Fabrik3DClaimTypes.Name, string.IsNullOrWhiteSpace(name) ? subject : name!),
            new(Fabrik3DClaimTypes.Role, role),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey!));
        var token = new JwtSecurityToken(
            issuer: _options.EffectiveIssuer,
            audience: _options.EffectiveAudience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new AuthTokenDto(
            Handler.WriteToken(token),
            "Bearer",
            expires,
            _options.NormalizedMode,
            subject,
            [role]);
    }
}
