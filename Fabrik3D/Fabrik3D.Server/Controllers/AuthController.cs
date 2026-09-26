using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Identity discovery and the guarded development/test login surface. It never stores passwords,
/// never returns internal validation detail and never exposes a token in a URL or a log entry.
/// </summary>
[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public class AuthController : ControllerBase
{
    private readonly Fabrik3DAuthenticationOptions _options;
    private readonly DevelopmentTokenIssuer _issuer;
    private readonly ICurrentIdentity _identity;
    private readonly ITenantContext _tenant;
    private readonly OrganizationRepository _organizations;
    private readonly ILogger<AuthController> _log;

    public AuthController(
        IOptions<Fabrik3DAuthenticationOptions> options,
        DevelopmentTokenIssuer issuer,
        ICurrentIdentity identity,
        ITenantContext tenant,
        OrganizationRepository organizations,
        ILogger<AuthController> log)
    {
        _options = options.Value;
        _issuer = issuer;
        _identity = identity;
        _tenant = tenant;
        _organizations = organizations;
        _log = log;
    }

    /// <summary>
    /// Public discovery of the configured authentication mode so the HMI and simulator can render a
    /// correct login surface. Contains no secrets and no internal configuration detail.
    /// </summary>
    [HttpGet("config")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthConfigDto), 200)]
    public IActionResult GetConfig()
    {
        var mode = _options.NormalizedMode;
        var dev = _issuer.CanIssue;
        string? warning = mode switch
        {
            Fabrik3DAuthenticationOptions.Modes.Development => "DEVELOPMENT AUTHENTICATION — NOT PRODUCTION SECURITY",
            Fabrik3DAuthenticationOptions.Modes.Test => "TEST AUTHENTICATION — NOT PRODUCTION SECURITY",
            Fabrik3DAuthenticationOptions.Modes.None => "AUTHENTICATION DISABLED — LOCAL EMERGENCY MODE ONLY",
            _ => null,
        };

        return Ok(new AuthConfigDto(
            mode,
            dev,
            _options.PublicDemoEnabled,
            Fabrik3DRoles.All,
            warning));
    }

    /// <summary>
    /// Issues a short-lived development/test identity token. Available only in Development/Test
    /// mode; a real deployment refuses it and the startup guard refuses those modes in Production.
    /// </summary>
    [HttpPost("dev-token")]
    [AllowAnonymous]
    [EnableRateLimiting(Fabrik3DAuthenticationExtensions.AuthRateLimitPolicy)]
    [ProducesResponseType(typeof(AuthTokenDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public IActionResult CreateDevToken([FromBody] DevTokenRequest request)
    {
        if (!_issuer.CanIssue)
        {
            // Do not advertise or detail the identity configuration.
            return NotFound(new ApiErrorDto(
                "not_found",
                "The requested resource does not exist.",
                StatusCodes.Status404NotFound));
        }

        if (!ModelState.IsValid) return BadRequest(ModelState);

        if (!Fabrik3DRoles.IsAssignable(request.Role, _options.PublicDemoEnabled))
        {
            return BadRequest(new ApiErrorDto(
                "invalid_role",
                $"'{request.Role}' is not a role this server can issue.",
                StatusCodes.Status400BadRequest));
        }

        var subject = string.IsNullOrWhiteSpace(request.Subject)
            ? $"dev-{request.Role.ToLowerInvariant()}-{Guid.NewGuid():N}"
            : request.Subject!.Trim();

        var token = _issuer.Issue(subject, request.Role, request.Name);
        _log.LogInformation(
            "[Server][Auth] Issued {Mode} identity subject={Subject} role={Role} expires={ExpiresAtUtc}",
            token.Mode, subject, request.Role, token.ExpiresAtUtc);

        return Ok(token);
    }

    /// <summary>Returns the authenticated principal the server actually sees. Never trusts client input.</summary>
    [HttpGet("me")]
    [Authorize(Policy = Fabrik3DPolicies.Authenticated)]
    [ProducesResponseType(typeof(AuthMeDto), 200)]
    public async Task<IActionResult> Me()
    {
        var organizationId = _tenant.OrganizationId;
        var organization = await _organizations.GetByIdAsync(organizationId);
        return Ok(new AuthMeDto(
            _identity.Subject,
            _identity.Name,
            _identity.Roles,
            User.Identity?.AuthenticationType ?? "none",
            organizationId,
            organization?.Name));
    }
}
