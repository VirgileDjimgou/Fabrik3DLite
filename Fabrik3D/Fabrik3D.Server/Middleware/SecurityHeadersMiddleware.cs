using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Middleware;

/// <summary>
/// Adds OWASP-aligned response hardening headers to every response (S42). HSTS and TLS termination
/// are handled by the deployment reverse proxy/tunnel; this middleware only sets headers that are
/// safe for both HTTPS and loopback development. Values are configuration-driven so a deployment can
/// tighten them without a code change.
/// </summary>
public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly SecurityHeadersOptions _options;

    public SecurityHeadersMiddleware(RequestDelegate next, IOptions<SecurityHeadersOptions> options)
    {
        _next = next;
        _options = options.Value;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (_options.Enabled)
        {
            var headers = context.Response.Headers;
            Set(headers, "X-Content-Type-Options", _options.ContentTypeOptions);
            Set(headers, "X-Frame-Options", _options.FrameOptions);
            Set(headers, "Referrer-Policy", _options.ReferrerPolicy);
            Set(headers, "Cross-Origin-Opener-Policy", _options.CrossOriginOpenerPolicy);
            Set(headers, "Permissions-Policy", _options.PermissionsPolicy);
            Set(headers, "Content-Security-Policy", _options.ContentSecurityPolicy);
        }

        await _next(context);
    }

    private static void Set(IHeaderDictionary headers, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            headers[name] = value;
        }
    }
}
