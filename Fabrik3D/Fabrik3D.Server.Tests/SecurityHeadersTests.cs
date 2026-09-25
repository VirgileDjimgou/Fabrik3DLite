using Fabrik3D.Server.Authentication;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S42 response-hardening and CORS-default tests: security headers are applied to real responses and
/// Production never falls back to a wildcard origin.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class SecurityHeadersTests
{
    private readonly AuthServerFixture _fx;

    public SecurityHeadersTests(AuthServerFixture fx) => _fx = fx;

    [Fact]
    public async Task Api_responses_carry_owasp_aligned_security_headers()
    {
        var client = await _fx.CreateAnonymousClientAsync();
        var response = await client.GetAsync("/api/auth/config");
        response.EnsureSuccessStatusCode();

        Assert.Equal("nosniff", Single(response.Headers, "X-Content-Type-Options"));
        Assert.Equal("DENY", Single(response.Headers, "X-Frame-Options"));
        Assert.Equal("no-referrer", Single(response.Headers, "Referrer-Policy"));
        Assert.Equal("same-origin", Single(response.Headers, "Cross-Origin-Opener-Policy"));
        Assert.Contains("camera=()", Single(response.Headers, "Permissions-Policy"), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(true, "https://hmi.example")]
    [InlineData(false, "https://hmi.example")]
    public void Configured_origins_always_win(bool isProduction, string origin)
        => Assert.Equal(CorsOriginMode.Explicit, CorsPolicyRules.Resolve([origin], isProduction));

    [Fact]
    public void Production_without_configured_origins_denies_cross_origin_instead_of_reflecting_any()
        => Assert.Equal(CorsOriginMode.DenyCrossOrigin, CorsPolicyRules.Resolve([], isProduction: true));

    [Fact]
    public void Development_without_configured_origins_reflects_for_local_tooling()
    {
        Assert.Equal(CorsOriginMode.DevelopmentReflectAny, CorsPolicyRules.Resolve([], isProduction: false));
        Assert.Equal(CorsOriginMode.DevelopmentReflectAny, CorsPolicyRules.Resolve(null, isProduction: false));
    }

    private static string? Single(System.Net.Http.Headers.HttpResponseHeaders headers, string name)
        => headers.TryGetValues(name, out var values) ? values.Single() : null;
}
