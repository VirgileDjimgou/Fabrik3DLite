using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S63 browser OIDC discovery: the server advertises only public Authorization Code + PKCE settings
/// (authority, public client id, scopes, redirect path) and never a client secret. Test/Demo
/// authentication does not advertise an OIDC block at all.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class OidcBrowserConfigTests
{
    private readonly AuthServerFixture _fx;

    public OidcBrowserConfigTests(AuthServerFixture fx) => _fx = fx;

    [Fact]
    public void Browser_scopes_are_normalized_and_always_include_openid()
    {
        var options = new BrowserOidcOptions { Scopes = ["profile", "profile", " roles ", ""] };

        var scopes = options.NormalizedScopes();

        Assert.Equal(["openid", "profile", "roles"], scopes);
        Assert.False(options.IsConfigured(null));
        Assert.False(options.IsConfigured("https://idp.example.test"));
        options.ClientId = "fabrik3d-hmi";
        Assert.True(options.IsConfigured("https://idp.example.test"));
    }

    [Fact]
    public async Task Auth_config_advertises_public_browser_oidc_settings_in_oidc_mode()
    {
        using var factory = _fx.CreateOidcDiscoveryFactory();
        var client = factory.CreateClient();

        var config = await client.GetFromJsonAsync<AuthConfigDto>("/api/auth/config");

        Assert.NotNull(config);
        Assert.Equal("Oidc", config!.Mode);
        Assert.NotNull(config.Oidc);
        // Trailing slash is normalized away so the browser can append the metadata path deterministically.
        Assert.Equal("https://idp.example.test/realms/demo", config.Oidc!.Authority);
        Assert.Equal("fabrik3d-hmi", config.Oidc.ClientId);
        Assert.Contains("openid", config.Oidc.Scopes);
        Assert.Equal("/auth/callback", config.Oidc.RedirectPath);
        // Test/Demo authentication is not advertised and cannot satisfy production authorization.
        Assert.False(config.DevelopmentAuth);
    }
}
