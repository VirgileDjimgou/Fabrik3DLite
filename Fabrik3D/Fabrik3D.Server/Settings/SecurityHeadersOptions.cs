namespace Fabrik3D.Server.Settings;

/// <summary>
/// Response hardening configuration (section "SecurityHeaders"). Secure defaults apply in every
/// environment; individual headers can be tightened per deployment. No secret or certificate value
/// belongs in this section. A Content-Security-Policy is intentionally left unset by default because
/// Swagger UI and the WebGL simulator need inline/eval behaviour; deployments that serve the API
/// behind their own front-end should set it explicitly.
/// </summary>
public sealed class SecurityHeadersOptions
{
    public const string SectionName = "SecurityHeaders";

    /// <summary>Applies the configured headers. Disable only for emergency local diagnosis.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Opt-in marker that the API is reached over public TLS (terminated at the deployment proxy or
    /// tunnel). When true, startup requires an explicit HSTS value and a reviewed CSP so an external
    /// deployment cannot silently run without transport hardening. Default false so loopback
    /// development, tests and the clearly-labelled public demo keep working unchanged.
    /// </summary>
    public bool ExternalTls { get; set; }

    public string ContentTypeOptions { get; set; } = "nosniff";

    public string FrameOptions { get; set; } = "DENY";

    public string ReferrerPolicy { get; set; } = "no-referrer";

    public string CrossOriginOpenerPolicy { get; set; } = "same-origin";

    /// <summary>Cross-Origin-Resource-Policy. Defaults to same-site; tighten to same-origin when isolated.</summary>
    public string CrossOriginResourcePolicy { get; set; } = "same-site";

    /// <summary>Blocks legacy Flash/PDF cross-domain policy files.</summary>
    public string PermittedCrossDomainPolicies { get; set; } = "none";

    public string PermissionsPolicy { get; set; } = "geolocation=(), camera=(), microphone=()";

    /// <summary>
    /// Optional Strict-Transport-Security value. Left empty by default because TLS terminates at the
    /// deployment proxy/tunnel and HSTS for a host is a deployment decision, not a per-request default.
    /// </summary>
    public string? StrictTransportSecurity { get; set; }

    /// <summary>Optional Content-Security-Policy. Empty means "not sent" (documented default).</summary>
    public string? ContentSecurityPolicy { get; set; }
}
