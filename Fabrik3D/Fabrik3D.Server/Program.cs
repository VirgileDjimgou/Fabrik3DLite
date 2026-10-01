using Fabrik3D.Domain.Control;
using Fabrik3D.Infrastructure;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Deployment;
using Fabrik3D.Server.Filters;
using Fabrik3D.Server.Simulation;
using Fabrik3D.Server.Hubs;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Observability;
using Fabrik3D.Server.Services;
using Fabrik3D.Server.Settings;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Apply the environment-specific deployment overlay (Production/OnPrem/Demo) selected by
// Deployment:Profile without changing the ASP.NET Core environment name. Production-like profiles
// therefore keep every production guard while still loading their own secure defaults.
var declaredProfile = builder.Configuration["Deployment:Profile"];
if (!string.IsNullOrWhiteSpace(declaredProfile)
    && !declaredProfile.Equals(builder.Environment.EnvironmentName, StringComparison.OrdinalIgnoreCase))
{
    builder.Configuration.AddJsonFile(
        $"appsettings.{declaredProfile}.json", optional: true, reloadOnChange: false);
}

// ── Infrastructure (MongoDB + repositories) ────────────────────────
builder.Services.AddInfrastructure(builder.Configuration);

// ── Observability (S49): OpenTelemetry-compatible traces, metrics and log enrichment ─
builder.Services.Configure<Fabrik3DObservabilityOptions>(
    builder.Configuration.GetSection(Fabrik3DObservabilityOptions.SectionName));
builder.Services.AddSingleton<ObservabilityMetrics>();
builder.Services.AddSingleton<ConnectorMetricsSampler>();
builder.Services.AddHostedService<ObservabilityConsoleExporter>();

// ── Deployment profile, versioning and diagnostics (S48) ───────────
builder.Services.Configure<DeploymentOptions>(
    builder.Configuration.GetSection(DeploymentOptions.SectionName));
builder.Services.AddSingleton<VersionInfo>();
builder.Services.AddSingleton<RecentLogBuffer>();
builder.Services.AddSingleton<Microsoft.Extensions.Logging.ILoggerProvider, RecentLogBufferProvider>();
builder.Services.AddSingleton<IMongoHealthProbe, MongoHealthProbe>();
builder.Services.AddSingleton<IConnectorHealthSummaryProvider, ConnectorHealthSummaryProvider>();
builder.Services.AddSingleton<HealthReportService>();
builder.Services.AddSingleton<SupportBundleBuilder>();
builder.Services.AddHostedService<SchemaMigrationHostedService>();

// ── Identity boundary (S42): authentication, role policies, CORS ───
builder.Services.AddFabrik3DAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddFabrik3DCors(builder.Configuration, builder.Environment);
builder.Services.AddFabrik3DAuthRateLimiting();

// ── Orchestration settings ─────────────────────────────────────────
builder.Services.Configure<OrchestrationOptions>(
    builder.Configuration.GetSection(OrchestrationOptions.SectionName));
builder.Services.Configure<SecurityHeadersOptions>(
    builder.Configuration.GetSection(SecurityHeadersOptions.SectionName));

// ── Tenancy (S43): organization context, administration and migration ─
builder.Services.Configure<TenancyOptions>(
    builder.Configuration.GetSection(TenancyOptions.SectionName));
builder.Services.AddSingleton<Fabrik3D.Domain.Organizations.ITenantContext, HttpTenantContext>();
builder.Services.AddSingleton<OrganizationService>();
builder.Services.AddHostedService<TenancyBootstrapService>();

// ── Training sessions and deterministic assessment (S44) ───────────
builder.Services.Configure<TrainingOptions>(
    builder.Configuration.GetSection(TrainingOptions.SectionName));
builder.Services.AddSingleton<TrainingService>();

// ── Services ───────────────────────────────────────────────────────
builder.Services.AddSingleton<HubNotificationService>();
builder.Services.AddSingleton<IHubNotificationService>(sp => sp.GetRequiredService<HubNotificationService>());
builder.Services.AddSingleton<SimulatorRegistry>();
builder.Services.AddSingleton<JobLifecycleCoordinator>();
builder.Services.AddSingleton<JobService>();
builder.Services.AddSingleton<DispatchService>();
builder.Services.AddSingleton<SimulationSessionService>();
builder.Services.AddSingleton<TaskService>();
builder.Services.AddSingleton<JobComposerService>();
builder.Services.AddSingleton<AlarmService>();
builder.Services.AddSingleton<OperatorMessageService>();
builder.Services.AddSingleton<MachineStateService>();
builder.Services.AddSingleton<CellTemplateService>();

// ── Authoritative robot positions and operator jog (S53) ───────────
builder.Services.AddSingleton<RobotStateService>();

// ── Signal mapping studio (S37) ────────────────────────────────────
builder.Services.AddSingleton<IInternalSignalCatalog, SignalMirrorCatalog>();
builder.Services.AddSingleton<SignalMappingStore>();
builder.Services.AddSingleton<SignalMappingApplyService>();

// ── Telemetry and event historian (S40) ────────────────────────────
builder.Services.AddSingleton<HistorianService>();

// ── Control authority (S36) ────────────────────────────────────────
builder.Services.AddSingleton<IControlAuthorityOwnerProbe, ConnectorAuthorityOwnerProbe>();
builder.Services.AddSingleton<ControlAuthorityService>();
builder.Services.AddSingleton<IControlAuthorityGate>(sp => sp.GetRequiredService<ControlAuthorityService>());
builder.Services.AddSingleton<ReferenceCellLoop>();

builder.Services.AddHostedService<HeartbeatMonitorService>();
builder.Services.AddHostedService<OpcUaConnectorHostedService>();
builder.Services.AddHostedService<MqttConnectorHostedService>();
builder.Services.AddHostedService<ModbusConnectorHostedService>();
builder.Services.AddHostedService<HistorianRetentionService>();

// ── ASP.NET Core ───────────────────────────────────────────────────
builder.Services.AddControllers(options =>
{
    options.Filters.Add<ApiErrorResultFilter>();
    options.Filters.Add<OrchestrationConflictExceptionFilter>();
    options.Filters.Add<JobComposerValidationExceptionFilter>();
});
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var details = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => entry.Key,
                entry => entry.Value!.Errors.Select(error => error.ErrorMessage).ToArray());

        return new BadRequestObjectResult(new ApiErrorDto(
            "validation_failed",
            "One or more request fields are invalid.",
            StatusCodes.Status400BadRequest,
            details));
    };
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SupportNonNullableReferenceTypes();
    c.SwaggerDoc("v1", new()
    {
        Title = "Fabrik3D Orchestration API",
        Version = "v1",
        Description = "Industrial HMI / simulator orchestration backend"
    });
});

// ── SignalR ────────────────────────────────────────────────────────
builder.Services.AddSignalR();

var app = builder.Build();

// Fail startup rather than serve anonymous mutations when production identity is misconfigured.
var authenticationOptions = app.Services.GetRequiredService<IOptions<Fabrik3DAuthenticationOptions>>().Value;
AuthenticationStartupGuard.ValidateOrThrow(authenticationOptions, app.Environment);

// Fail fast on invalid or unsafe deployment configuration instead of starting partially secure.
var deploymentOptions = app.Services.GetRequiredService<IOptions<DeploymentOptions>>().Value;
var corsOptions = app.Services.GetRequiredService<IOptions<CorsOptions>>().Value;
var orchestrationOptions = app.Services.GetRequiredService<IOptions<OrchestrationOptions>>().Value;
var securityHeadersOptions = app.Services.GetRequiredService<IOptions<SecurityHeadersOptions>>().Value;
var configurationErrors = DeploymentConfigurationValidator.Validate(
    app.Configuration,
    app.Environment,
    deploymentOptions,
    authenticationOptions,
    corsOptions,
    orchestrationOptions,
    securityHeadersOptions);
if (configurationErrors.Count > 0)
{
    throw new InvalidOperationException(
        "Invalid deployment configuration:" + Environment.NewLine + " - " +
        string.Join(Environment.NewLine + " - ", configurationErrors));
}

if (authenticationOptions.IsDevelopmentLike)
{
    app.Logger.LogWarning(
        "[Server][Auth] {Mode} authentication is active (issuer={Issuer}). This mode is for local development, CI and the clearly-labelled public demo only and is refused in Production.",
        authenticationOptions.NormalizedMode, authenticationOptions.EffectiveIssuer);
}
else if (authenticationOptions.NormalizedMode == Fabrik3DAuthenticationOptions.Modes.None)
{
    app.Logger.LogWarning(
        "[Server][Auth] Authentication:Mode=None disables server-side authorization. Local emergency fallback only; anonymous mutations are accepted.");
}


// Production traffic reaches Kestrel through the internal Nginx proxy and a
// Cloudflare Tunnel. Trust forwarded scheme information before HTTPS handling.
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
forwardedHeaders.KnownNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaders);

// Configure the HTTP request pipeline.
// Swagger is a development/diagnostic surface. It is enabled only when the resolved deployment
// configuration allows it; production-like profiles keep it off unless explicitly opted in.
if (deploymentOptions.ResolveSwaggerEnabled(app.Environment.EnvironmentName))
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Fabrik3D API v1");
        c.DocumentTitle = "Fabrik3D API";
    });
}

// OWASP-aligned response hardening headers on every response.
app.UseMiddleware<SecurityHeadersMiddleware>();

// CORS must come before any endpoint-producing middleware
app.UseCors(Fabrik3DAuthenticationExtensions.CorsPolicyName);

// Correlation ids on every command, state update and log entry
app.UseMiddleware<CorrelationIdMiddleware>();

// OpenTelemetry-compatible request spans + API latency metrics + structured log enrichment
app.UseMiddleware<ObservabilityMiddleware>();

if (!app.Environment.IsEnvironment("Testing"))
{
    app.UseHttpsRedirection();
}
app.UseRateLimiter();
app.UseAuthentication();
// Tenant context is resolved from the authenticated principal (and validated membership only); it
// never trusts a client-supplied organization id.
app.UseMiddleware<TenantContextMiddleware>();
app.UseAuthorization();

app.MapControllers();
app.MapHub<OrchestrationHub>("/hubs/orchestration");

app.Run();

/// <summary>Exposed for WebApplicationFactory-based integration tests.</summary>
public partial class Program;

