using System.Text;
using System.Threading.RateLimiting;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Settings;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Fabrik3D.Server.Authentication;

/// <summary>
/// Registers the Fabrik3D server identity boundary: JWT bearer validation for API and hub access,
/// OIDC support for production, a guarded development/test identity mode, role policies and
/// environment-appropriate CORS.
/// </summary>
public static class Fabrik3DAuthenticationExtensions
{
    public const string CorsPolicyName = "Fabrik3DCors";
    public const string AuthRateLimitPolicy = "auth";

    public static IServiceCollection AddFabrik3DAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.Configure<Fabrik3DAuthenticationOptions>(
            configuration.GetSection(Fabrik3DAuthenticationOptions.SectionName));

        services.AddOptions<Fabrik3DAuthenticationOptions>()
            .Configure(options =>
                options.Mode = Fabrik3DAuthenticationOptions.ResolveMode(options.Mode, environment.EnvironmentName))
            .PostConfigure(options =>
            {
                if (options.IsDevelopmentLike && string.IsNullOrWhiteSpace(options.SigningKey))
                {
                    // Ephemeral, process-local and never committed. Logged by the host on startup.
                    options.SigningKey = DevelopmentTokenIssuer.CreateEphemeralKey();
                }
            });

        services.AddHttpContextAccessor();
        services.AddSingleton<ICurrentIdentity, HttpCurrentIdentity>();
        services.AddSingleton<DevelopmentTokenIssuer>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer();

        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<Fabrik3DAuthenticationOptions>>((bearer, auth) => ConfigureBearer(bearer, auth.Value));

        services.AddAuthorization();
        services.AddOptions<AuthorizationOptions>()
            .Configure<IOptions<Fabrik3DAuthenticationOptions>>((authz, auth) => ConfigurePolicies(authz, auth.Value));

        return services;
    }

    /// <summary>
    /// Registers the environment-appropriate CORS policy. Production never accepts arbitrary
    /// origins: cross-origin access is limited to explicitly configured origins, while local
    /// development/testing keeps the Vite proxy working.
    /// </summary>
    public static IServiceCollection AddFabrik3DCors(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var options = configuration.GetSection(CorsOptions.SectionName).Get<CorsOptions>() ?? new CorsOptions();

        services.AddCors(cors =>
        {
            cors.AddPolicy(CorsPolicyName, policy =>
            {
                switch (CorsPolicyRules.Resolve(options.AllowedOrigins, environment.IsProduction()))
                {
                    case CorsOriginMode.Explicit:
                        policy.WithOrigins(options.AllowedOrigins)
                            .AllowAnyHeader()
                            .AllowAnyMethod()
                            .AllowCredentials();
                        break;

                    case CorsOriginMode.DevelopmentReflectAny:
                        // Local development/testing: reflect any origin so the Vite dev server and
                        // loopback e2e hosts work. Never applied in Production.
                        policy.SetIsOriginAllowed(_ => true)
                            .AllowAnyHeader()
                            .AllowAnyMethod()
                            .AllowCredentials();
                        break;

                    default:
                        // Production without configured origins: deny cross-origin browser access and
                        // allow same-origin. No wildcard and no wildcard-with-credentials.
                        policy.WithOrigins(Array.Empty<string>())
                            .AllowAnyHeader()
                            .AllowAnyMethod();
                        break;
                }
            });
        });

        return services;
    }

    /// <summary>Rate limiter registration for authentication-sensitive endpoints.</summary>
    public static IServiceCollection AddFabrik3DAuthRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.AddPolicy(AuthRateLimitPolicy, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 30,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0,
                    }));
        });

        return services;
    }

    private static void ConfigureBearer(JwtBearerOptions bearer, Fabrik3DAuthenticationOptions auth)
    {
        bearer.MapInboundClaims = false;
        bearer.SaveToken = false;
        bearer.RequireHttpsMetadata = auth.RequireHttpsMetadata;

        var validation = new TokenValidationParameters
        {
            NameClaimType = Fabrik3DClaimTypes.Name,
            RoleClaimType = Fabrik3DClaimTypes.Role,
            ClockSkew = TimeSpan.FromSeconds(Math.Clamp(auth.ClockSkewSeconds, 0, 300)),
            ValidateIssuer = auth.ValidateIssuer,
            ValidateAudience = auth.ValidateAudience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
        };

        switch (auth.NormalizedMode)
        {
            case Fabrik3DAuthenticationOptions.Modes.Oidc:
                bearer.Authority = auth.Authority;
                bearer.Audience = auth.Audience;
                if (!string.IsNullOrWhiteSpace(auth.Issuer)) validation.ValidIssuer = auth.Issuer;
                if (string.IsNullOrWhiteSpace(auth.Audience)) validation.ValidateAudience = false;
                break;

            case Fabrik3DAuthenticationOptions.Modes.Development:
            case Fabrik3DAuthenticationOptions.Modes.Test:
                validation.ValidIssuer = auth.EffectiveIssuer;
                validation.ValidAudience = auth.EffectiveAudience;
                validation.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(auth.SigningKey!));
                break;

            default:
                // Explicit local emergency fallback (refused in Production by the startup guard).
                validation.ValidateIssuer = false;
                validation.ValidateAudience = false;
                validation.ValidateIssuerSigningKey = false;
                validation.RequireSignedTokens = false;
                validation.ValidateLifetime = false;
                break;
        }

        bearer.TokenValidationParameters = validation;
        bearer.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // SignalR WebSockets cannot set an Authorization header during negotiation, so the
                // access token is passed as a query string parameter for the hub path only. It is
                // never logged and never used for REST.
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            },
            OnChallenge = async context =>
            {
                context.HandleResponse();
                if (context.Response.HasStarted) return;
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new ApiErrorDto(
                    "unauthorized",
                    "Authentication is required for this operation.",
                    StatusCodes.Status401Unauthorized));
            },
            OnForbidden = async context =>
            {
                if (context.Response.HasStarted) return;
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new ApiErrorDto(
                    "forbidden",
                    "The authenticated principal is not authorized for this operation.",
                    StatusCodes.Status403Forbidden));
            },
        };
    }

    private static void ConfigurePolicies(AuthorizationOptions authorization, Fabrik3DAuthenticationOptions auth)
    {
        var permissive = auth.NormalizedMode == Fabrik3DAuthenticationOptions.Modes.None;

        authorization.DefaultPolicy = permissive
            ? AllowAll()
            : new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();

        authorization.FallbackPolicy = BuildPolicy(Fabrik3DPolicies.Read, permissive);

        foreach (var (policy, roles) in Fabrik3DPolicies.PermissionMatrix)
        {
            authorization.AddPolicy(policy, permissive
                ? AllowAll()
                : new AuthorizationPolicyBuilder()
                    .RequireAuthenticatedUser()
                    .RequireRole(roles)
                    .Build());
        }

        authorization.AddPolicy(Fabrik3DPolicies.Authenticated, permissive
            ? AllowAll()
            : new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
    }

    private static AuthorizationPolicy BuildPolicy(string policy, bool permissive)
        => permissive ? AllowAll() : new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .RequireRole(Fabrik3DPolicies.RolesFor(policy))
            .Build();

    private static AuthorizationPolicy AllowAll()
        => new AuthorizationPolicyBuilder().RequireAssertion(_ => true).Build();
}
