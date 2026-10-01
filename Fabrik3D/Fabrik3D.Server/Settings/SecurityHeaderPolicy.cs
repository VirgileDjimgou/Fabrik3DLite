using System.Globalization;

namespace Fabrik3D.Server.Settings;

/// <summary>
/// Validates and describes the response-hardening header policy (S57). Secure defaults are always sent;
/// this type adds fail-fast validation for the headers a deployment explicitly configures, so a
/// malformed or SignalR/OIDC-incompatible Content-Security-Policy or Strict-Transport-Security value is
/// rejected at startup instead of silently blocking the HMI, the WebGL simulator or the hub.
///
/// It is deliberately conservative: it never requires a header that a topology cannot provide, and it
/// only enforces the external-TLS combination when the operator opts in with
/// <see cref="SecurityHeadersOptions.ExternalTls"/>.
/// </summary>
public static class SecurityHeaderPolicy
{
    /// <summary>One year, the common HSTS max-age recommendation.</summary>
    public const int RecommendedHstsMaxAgeSeconds = 31_536_000;

    /// <summary>Minimum accepted HSTS max-age (one day) so a typo cannot pin a near-zero age.</summary>
    public const int MinimumHstsMaxAgeSeconds = 86_400;

    /// <summary>
    /// A reviewed CSP that keeps the API, SignalR (ws/wss), the WebGL simulator (wasm, blob workers,
    /// data/blob textures) and the same-origin HMI working while denying inline script and framing.
    /// Deployments that serve a separate front-end origin must add that origin to <c>connect-src</c>.
    /// </summary>
    public const string RecommendedContentSecurityPolicy =
        "default-src 'self'; " +
        "base-uri 'self'; " +
        "frame-ancestors 'none'; " +
        "object-src 'none'; " +
        "script-src 'self' 'wasm-unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' ws: wss:; " +
        "worker-src 'self' blob:; " +
        "form-action 'self'";

    /// <summary>Builds a well-formed Strict-Transport-Security value for a TLS terminator.</summary>
    public static string RecommendedHsts(int maxAgeSeconds = RecommendedHstsMaxAgeSeconds, bool includeSubDomains = true)
    {
        var value = $"max-age={Math.Max(0, maxAgeSeconds)}";
        if (includeSubDomains) value += "; includeSubDomains";
        return value;
    }

    /// <summary>
    /// Returns every actionable problem with the configured header policy. An empty list means the
    /// policy is safe to serve for the configured topology.
    /// </summary>
    public static IReadOnlyList<string> Validate(SecurityHeadersOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var errors = new List<string>();
        if (!options.Enabled) return errors;

        if (string.IsNullOrWhiteSpace(options.FrameOptions))
        {
            errors.Add("SecurityHeaders:FrameOptions must not be empty when response hardening is enabled.");
        }
        if (string.IsNullOrWhiteSpace(options.ReferrerPolicy))
        {
            errors.Add("SecurityHeaders:ReferrerPolicy must not be empty when response hardening is enabled.");
        }
        if (string.IsNullOrWhiteSpace(options.PermissionsPolicy))
        {
            errors.Add("SecurityHeaders:PermissionsPolicy must not be empty when response hardening is enabled.");
        }

        ValidateHsts(options.StrictTransportSecurity, errors);
        ValidateCsp(options.ContentSecurityPolicy, errors);

        if (options.ExternalTls)
        {
            if (string.IsNullOrWhiteSpace(options.StrictTransportSecurity))
            {
                errors.Add(
                    "SecurityHeaders:ExternalTls is enabled but SecurityHeaders:StrictTransportSecurity is empty; " +
                    "configure HSTS at the TLS terminator (for example 'max-age=31536000; includeSubDomains').");
            }
            if (string.IsNullOrWhiteSpace(options.ContentSecurityPolicy))
            {
                errors.Add(
                    "SecurityHeaders:ExternalTls is enabled but SecurityHeaders:ContentSecurityPolicy is empty; " +
                    "configure a reviewed policy that keeps SignalR (connect-src ws:/wss:) and the WebGL simulator working.");
            }
        }

        return errors;
    }

    private static void ValidateHsts(string? hsts, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(hsts)) return;

        int? maxAge = null;
        foreach (var token in hsts.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var separator = token.IndexOf('=');
            if (separator <= 0) continue;
            var name = token[..separator].Trim();
            var value = token[(separator + 1)..].Trim();
            if (!name.Equals("max-age", StringComparison.OrdinalIgnoreCase)) continue;
            if (int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed))
            {
                maxAge = parsed;
            }
            break;
        }

        if (maxAge is null)
        {
            errors.Add("SecurityHeaders:StrictTransportSecurity must start with a numeric 'max-age=<seconds>' directive.");
            return;
        }

        if (maxAge < MinimumHstsMaxAgeSeconds)
        {
            errors.Add(
                $"SecurityHeaders:StrictTransportSecurity max-age ({maxAge}) is below the accepted minimum of {MinimumHstsMaxAgeSeconds} seconds.");
        }
    }

    private static void ValidateCsp(string? csp, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(csp)) return;

        var directives = ParseDirectives(csp);
        if (directives.TryGetValue("default-src", out var defaultSrc) && defaultSrc.Trim() == "*")
        {
            errors.Add("SecurityHeaders:ContentSecurityPolicy default-src '*' is not an acceptable hardening policy.");
        }
        if (directives.TryGetValue("frame-ancestors", out var frameAncestors) && frameAncestors.Trim() == "*")
        {
            errors.Add("SecurityHeaders:ContentSecurityPolicy frame-ancestors '*' would allow framing by any origin.");
        }
        if (!directives.TryGetValue("connect-src", out var connectSrc))
        {
            errors.Add(
                "SecurityHeaders:ContentSecurityPolicy must declare 'connect-src' so the REST API and the SignalR WebSocket are not blocked.");
            return;
        }

        var sources = connectSrc.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var allowsApi = sources.Any(source =>
            source.Equals("'self'", StringComparison.OrdinalIgnoreCase)
            || source.StartsWith("http:", StringComparison.OrdinalIgnoreCase)
            || source.StartsWith("https:", StringComparison.OrdinalIgnoreCase));
        var allowsWebSocket = sources.Any(source =>
            source.Equals("'self'", StringComparison.OrdinalIgnoreCase)
            || source.Equals("ws:", StringComparison.OrdinalIgnoreCase)
            || source.Equals("wss:", StringComparison.OrdinalIgnoreCase)
            || source.StartsWith("ws://", StringComparison.OrdinalIgnoreCase)
            || source.StartsWith("wss://", StringComparison.OrdinalIgnoreCase));

        if (!allowsApi)
        {
            errors.Add("SecurityHeaders:ContentSecurityPolicy connect-src must include 'self' or an explicit API origin.");
        }
        if (!allowsWebSocket)
        {
            errors.Add("SecurityHeaders:ContentSecurityPolicy connect-src must include 'self' (ws:/wss: on the same origin) or an explicit WebSocket origin.");
        }
    }

    private static Dictionary<string, string> ParseDirectives(string policy)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var segment in policy.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var separator = segment.IndexOf(' ');
            if (separator < 0)
            {
                result[segment] = string.Empty;
                continue;
            }
            var name = segment[..separator];
            var value = segment[(separator + 1)..].Trim();
            result[name] = value;
        }
        return result;
    }
}
