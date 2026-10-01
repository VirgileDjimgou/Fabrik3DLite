using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Deployment;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Settings;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting.Internal;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S57 response-header policy tests. The policy must keep the API, SignalR (ws/wss) and the WebGL
/// simulator (wasm, blob workers, data/blob textures) working, reject malformed or unsafe values at
/// startup, and only demand external-TLS headers when the operator opts in.
/// </summary>
public class SecurityHeaderPolicyTests
{
    [Fact]
    public void Secure_defaults_produce_no_errors()
    {
        Assert.Empty(SecurityHeaderPolicy.Validate(new SecurityHeadersOptions()));
    }

    [Fact]
    public void External_tls_requires_hsts_and_csp()
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions { ExternalTls = true });

        Assert.Contains(errors, e => e.Contains("StrictTransportSecurity") && e.Contains("empty"));
        Assert.Contains(errors, e => e.Contains("ContentSecurityPolicy") && e.Contains("empty"));
    }

    [Fact]
    public void Reviewed_external_tls_configuration_produces_no_errors()
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions
        {
            ExternalTls = true,
            StrictTransportSecurity = SecurityHeaderPolicy.RecommendedHsts(),
            ContentSecurityPolicy = SecurityHeaderPolicy.RecommendedContentSecurityPolicy,
        });

        Assert.Empty(errors);
    }

    [Fact]
    public void Recommended_csp_keeps_signalr_and_webgl_surfaces_working()
    {
        var csp = SecurityHeaderPolicy.RecommendedContentSecurityPolicy;

        Assert.Contains("connect-src 'self' ws: wss:", csp, StringComparison.Ordinal);
        Assert.Contains("worker-src 'self' blob:", csp, StringComparison.Ordinal);
        Assert.Contains("'wasm-unsafe-eval'", csp, StringComparison.Ordinal);
        Assert.Contains("img-src 'self' data: blob:", csp, StringComparison.Ordinal);
        Assert.Contains("frame-ancestors 'none'", csp, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("includeSubDomains")]
    [InlineData("max-age=abc")]
    [InlineData("max-age")]
    public void Malformed_hsts_is_rejected(string hsts)
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions { StrictTransportSecurity = hsts });
        Assert.Contains(errors, e => e.Contains("StrictTransportSecurity"));
    }

    [Fact]
    public void Short_hsts_max_age_is_rejected()
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions
        {
            StrictTransportSecurity = SecurityHeaderPolicy.RecommendedHsts(SecurityHeaderPolicy.MinimumHstsMaxAgeSeconds - 1),
        });

        Assert.Contains(errors, e => e.Contains("max-age"));
    }

    [Fact]
    public void Recommended_hsts_is_well_formed()
    {
        var hsts = SecurityHeaderPolicy.RecommendedHsts();

        Assert.StartsWith("max-age=31536000", hsts, StringComparison.Ordinal);
        Assert.Contains("includeSubDomains", hsts, StringComparison.Ordinal);
        Assert.Empty(SecurityHeaderPolicy.Validate(new SecurityHeadersOptions { StrictTransportSecurity = hsts }));
    }

    [Fact]
    public void Csp_without_connect_src_is_rejected()
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions
        {
            ContentSecurityPolicy = "default-src 'self'; script-src 'self'",
        });

        Assert.Contains(errors, e => e.Contains("connect-src"));
    }

    [Fact]
    public void Csp_without_api_or_websocket_connect_source_is_rejected()
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions
        {
            ContentSecurityPolicy = "default-src 'self'; connect-src https://cdn.example",
        });

        Assert.Contains(errors, e => e.Contains("WebSocket") || e.Contains("ws:"));
    }

    [Theory]
    [InlineData("default-src *; connect-src 'self' ws: wss:")]
    [InlineData("default-src 'self'; connect-src 'self' ws: wss:; frame-ancestors *")]
    public void Unsafe_csp_values_are_rejected(string csp)
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions { ContentSecurityPolicy = csp });
        Assert.NotEmpty(errors);
    }

    [Fact]
    public async Task Reviewed_external_tls_configuration_emits_hsts_and_a_signalr_compatible_csp()
    {
        var options = new SecurityHeadersOptions
        {
            ExternalTls = true,
            StrictTransportSecurity = SecurityHeaderPolicy.RecommendedHsts(),
            ContentSecurityPolicy = SecurityHeaderPolicy.RecommendedContentSecurityPolicy,
        };
        Assert.Empty(SecurityHeaderPolicy.Validate(options));

        var context = new DefaultHttpContext();
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask, Options.Create(options));

        await middleware.InvokeAsync(context);

        Assert.Equal(SecurityHeaderPolicy.RecommendedHsts(),
            context.Response.Headers["Strict-Transport-Security"].ToString());
        var csp = context.Response.Headers["Content-Security-Policy"].ToString();
        Assert.Contains("connect-src 'self' ws: wss:", csp, StringComparison.Ordinal);
        Assert.Contains("frame-ancestors 'none'", csp, StringComparison.Ordinal);
        Assert.Equal("DENY", context.Response.Headers["X-Frame-Options"].ToString());
    }

    [Fact]
    public void Disabled_headers_skip_validation()
    {
        var errors = SecurityHeaderPolicy.Validate(new SecurityHeadersOptions
        {
            Enabled = false,
            ExternalTls = true,
            FrameOptions = string.Empty,
        });

        Assert.Empty(errors);
    }

    [Fact]
    public void Deployment_validator_surfaces_header_policy_errors()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["MongoDb:ConnectionString"] = "mongodb://localhost:27017",
                ["MongoDb:DatabaseName"] = "Fabrik3D",
            })
            .Build();

        var errors = DeploymentConfigurationValidator.Validate(
            configuration,
            new HostingEnvironment { EnvironmentName = "Testing" },
            new DeploymentOptions { Profile = "Testing", EnableSwagger = true },
            new Fabrik3DAuthenticationOptions { Mode = "Test", SigningKey = "test-key" },
            new CorsOptions(),
            new OrchestrationOptions(),
            new SecurityHeadersOptions { ExternalTls = true });

        Assert.Contains(errors, e => e.Contains("SecurityHeaders:ExternalTls"));
    }
}
