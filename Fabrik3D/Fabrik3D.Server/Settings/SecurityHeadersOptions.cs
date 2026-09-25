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

    public string ContentTypeOptions { get; set; } = "nosniff";

    public string FrameOptions { get; set; } = "DENY";

    public string ReferrerPolicy { get; set; } = "no-referrer";

    public string CrossOriginOpenerPolicy { get; set; } = "same-origin";

    public string PermissionsPolicy { get; set; } = "geolocation=(), camera=(), microphone=()";

    /// <summary>Optional Content-Security-Policy. Empty means "not sent" (documented default).</summary>
    public string? ContentSecurityPolicy { get; set; }
}
