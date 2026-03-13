using Fabrik3D.Server.Hubs;
using Fabrik3D.Server.Repositories;
using Fabrik3D.Server.Services;
using Fabrik3D.Server.Settings;

var builder = WebApplication.CreateBuilder(args);

// ── MongoDB ────────────────────────────────────────────────────────
builder.Services.Configure<MongoDbSettings>(
    builder.Configuration.GetSection(MongoDbSettings.SectionName));
builder.Services.AddSingleton<MongoDbContext>();

// ── Repositories ───────────────────────────────────────────────────
builder.Services.AddSingleton<JobRepository>();
builder.Services.AddSingleton<TaskRepository>();
builder.Services.AddSingleton<SimulationSessionRepository>();
builder.Services.AddSingleton<AlarmRepository>();
builder.Services.AddSingleton<OperatorMessageRepository>();
builder.Services.AddSingleton<MachineStateRepository>();

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

app.UseDefaultFiles();
app.UseStaticFiles();

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

app.UseHttpsRedirection();
app.UseCors("DevCors");
app.UseAuthorization();

app.MapControllers();
app.MapHub<OrchestrationHub>("/hubs/orchestration");
app.MapFallbackToFile("/index.html");

app.Run();
