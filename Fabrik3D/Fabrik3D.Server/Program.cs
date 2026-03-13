using Fabrik3D.Infrastructure;
using Fabrik3D.Server.Hubs;
using Fabrik3D.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Infrastructure (MongoDB + repositories) ────────────────────────
builder.Services.AddInfrastructure(builder.Configuration);

// ── Services ───────────────────────────────────────────────────────
builder.Services.AddSingleton<HubNotificationService>();
builder.Services.AddSingleton<JobService>();
builder.Services.AddSingleton<SimulationSessionService>();
builder.Services.AddSingleton<AlarmService>();
builder.Services.AddSingleton<OperatorMessageService>();
builder.Services.AddSingleton<MachineStateService>();

// ── ASP.NET Core ───────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
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
if (app.Environment.IsDevelopment())
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

app.UseHttpsRedirection();
app.UseAuthorization();

app.MapControllers();
app.MapHub<OrchestrationHub>("/hubs/orchestration");

app.Run();
