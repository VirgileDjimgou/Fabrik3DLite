using Fabrik3D.Server.Authentication;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.Internal;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for the role/permission matrix, mode resolution and the startup guard that refuses
/// development authentication in Production.
/// </summary>
public class IdentityPolicyTests
{
    private static IHostEnvironment Env(string name) => new HostingEnvironment
    {
        EnvironmentName = name,
        ApplicationName = "Fabrik3D.Server.Tests",
    };

    [Fact]
    public void Permission_matrix_matches_the_documented_roles()
    {
        Assert.Equal(
            new[] { Fabrik3DRoles.Learner, Fabrik3DRoles.Instructor, Fabrik3DRoles.Engineer, Fabrik3DRoles.Operator, Fabrik3DRoles.Administrator, Fabrik3DRoles.PublicDemo },
            Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Read));

        Assert.Equal(
            new[] { Fabrik3DRoles.Operator, Fabrik3DRoles.Engineer, Fabrik3DRoles.Administrator },
            Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Operate));

        Assert.Equal(
            new[] { Fabrik3DRoles.Engineer, Fabrik3DRoles.Administrator },
            Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Engineer));

        Assert.Equal(
            new[] { Fabrik3DRoles.Instructor, Fabrik3DRoles.Administrator },
            Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Instruct));

        Assert.Equal(
            new[] { Fabrik3DRoles.Learner, Fabrik3DRoles.Instructor, Fabrik3DRoles.Administrator },
            Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Train));

        Assert.Equal(new[] { Fabrik3DRoles.Administrator }, Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Admin));

        // Public demo can only ever read.
        Assert.DoesNotContain(Fabrik3DRoles.PublicDemo, Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Operate));
        Assert.DoesNotContain(Fabrik3DRoles.PublicDemo, Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Train));
        Assert.DoesNotContain(Fabrik3DRoles.PublicDemo, Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Engineer));
        Assert.DoesNotContain(Fabrik3DRoles.PublicDemo, Fabrik3DPolicies.RolesFor(Fabrik3DPolicies.Admin));
    }

    [Fact]
    public void Unknown_policy_has_no_roles()
        => Assert.Empty(Fabrik3DPolicies.RolesFor("Fabrik3D.DoesNotExist"));

    [Fact]
    public void Public_demo_role_is_only_assignable_when_enabled()
    {
        Assert.True(Fabrik3DRoles.IsAssignable(Fabrik3DRoles.Operator, publicDemoEnabled: false));
        Assert.False(Fabrik3DRoles.IsAssignable(Fabrik3DRoles.PublicDemo, publicDemoEnabled: false));
        Assert.True(Fabrik3DRoles.IsAssignable(Fabrik3DRoles.PublicDemo, publicDemoEnabled: true));
        Assert.False(Fabrik3DRoles.IsAssignable("Root", publicDemoEnabled: true));
    }

    [Theory]
    [InlineData("Production", null, "Oidc")]
    [InlineData("Testing", null, "Test")]
    [InlineData("Development", null, "Development")]
    [InlineData("Production", "Test", "Test")]
    public void Mode_resolution_prefers_explicit_configuration(string environment, string? configured, string expected)
        => Assert.Equal(expected, Fabrik3DAuthenticationOptions.ResolveMode(configured, environment));

    [Fact]
    public void Mode_normalization_maps_documented_aliases()
    {
        Assert.Equal(Fabrik3DAuthenticationOptions.Modes.Oidc, new Fabrik3DAuthenticationOptions { Mode = "oidc" }.NormalizedMode);
        Assert.Equal(Fabrik3DAuthenticationOptions.Modes.Development, new Fabrik3DAuthenticationOptions { Mode = "dev" }.NormalizedMode);
        Assert.Equal(Fabrik3DAuthenticationOptions.Modes.Test, new Fabrik3DAuthenticationOptions { Mode = "TEST" }.NormalizedMode);
        Assert.Equal(Fabrik3DAuthenticationOptions.Modes.None, new Fabrik3DAuthenticationOptions { Mode = "legacy" }.NormalizedMode);
    }

    [Theory]
    [InlineData("Development")]
    [InlineData("Test")]
    [InlineData("None")]
    public void Production_refuses_every_non_oidc_mode(string mode)
    {
        var options = new Fabrik3DAuthenticationOptions { Mode = mode, SigningKey = new string('k', 64) };
        var ex = Assert.Throws<InvalidOperationException>(
            () => AuthenticationStartupGuard.ValidateOrThrow(options, Env("Production")));
        Assert.Contains("refused in Production", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Production_refuses_oidc_without_an_authority()
    {
        var options = new Fabrik3DAuthenticationOptions { Mode = "Oidc" };
        var ex = Assert.Throws<InvalidOperationException>(
            () => AuthenticationStartupGuard.ValidateOrThrow(options, Env("Production")));
        Assert.Contains("Authority is required", ex.Message);
    }

    [Fact]
    public void Production_refuses_insecure_metadata_and_dev_signing_keys()
    {
        var insecureMetadata = new Fabrik3DAuthenticationOptions
        {
            Mode = "Oidc",
            Authority = "https://identity.example/",
            RequireHttpsMetadata = false,
        };
        Assert.Throws<InvalidOperationException>(
            () => AuthenticationStartupGuard.ValidateOrThrow(insecureMetadata, Env("Production")));

        var devKeyInProduction = new Fabrik3DAuthenticationOptions
        {
            Mode = "Oidc",
            Authority = "https://identity.example/",
            SigningKey = new string('k', 64),
        };
        Assert.Throws<InvalidOperationException>(
            () => AuthenticationStartupGuard.ValidateOrThrow(devKeyInProduction, Env("Production")));
    }

    [Fact]
    public void Valid_production_oidc_configuration_is_accepted()
    {
        var options = new Fabrik3DAuthenticationOptions
        {
            Mode = "Oidc",
            Authority = "https://identity.example/",
            Audience = "fabrik3d-api",
        };
        AuthenticationStartupGuard.ValidateOrThrow(options, Env("Production"));
    }

    [Fact]
    public void Development_identity_mode_is_accepted_outside_production_and_requires_a_key()
    {
        var withKey = new Fabrik3DAuthenticationOptions { Mode = "Development", SigningKey = new string('k', 64) };
        AuthenticationStartupGuard.ValidateOrThrow(withKey, Env("Development"));

        var withoutKey = new Fabrik3DAuthenticationOptions { Mode = "Development" };
        Assert.Throws<InvalidOperationException>(
            () => AuthenticationStartupGuard.ValidateOrThrow(withoutKey, Env("Development")));
    }
}
