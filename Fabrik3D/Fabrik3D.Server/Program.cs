using Fabrik3D.Infrastructure;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Filters;
using Fabrik3D.Server.Hubs;
using Fabrik3D.Server.Middleware;
using Fabrik3D.Server.Services;
using Fabrik3D.Server.Settings;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

// ── Infrastructure (MongoDB + repositories) ────────────────────────
builder.Services.AddInfrastructure(builder.Configuration);

// ── Orchestration settings ─────────────────────────────────────────
builder.Services.Configure<OrchestrationOptions>(
    builder.Configuration.GetSection(OrchestrationOptions.SectionName));

// ── Services ───────────────────────────────────────────────────────
builder.Services.AddSingleton<HubNotificationService>();
builder.Services.AddSingleton<IHubNotificationService>(sp => sp.GetRequiredService<HubNotificationService>());
builder.Services.AddSingleton<JobService>();
builder.Services.AddSingleton<SimulationSessionService>();
builder.Services.AddSingleton<TaskService>();
builder.Services.AddSingleton<AlarmService>();
builder.Services.AddSingleton<OperatorMessageService>();
builder.Services.AddSingleton<MachineStateService>();
builder.Services.AddHostedService<HeartbeatMonitorService>();

// ── ASP.NET Core ───────────────────────────────────────────────────
builder.Services.AddControllers(options =>
{
    options.Filters.Add<ApiErrorResultFilter>();
    options.Filters.Add<OrchestrationConflictExceptionFilter>();
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

// ── CORS (allow the Vite dev server) ───────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Fabrik3D API v1");
        c.DocumentTitle = "Fabrik3D API";
    });
}

// CORS must come before any endpoint-producing middleware
app.UseCors("DevCors");

// Correlation ids on every command, state update and log entry
app.UseMiddleware<CorrelationIdMiddleware>();

if (!app.Environment.IsEnvironment("Testing"))
{
    app.UseHttpsRedirection();
}
app.UseAuthorization();

app.MapControllers();
app.MapHub<OrchestrationHub>("/hubs/orchestration");

app.Run();
