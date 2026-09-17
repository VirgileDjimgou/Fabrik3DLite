using Fabrik3D.Contracts.Events;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Settings;
using Fabrik3D.Server.Services;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Testcontainers.MongoDb;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Shared MongoDB Testcontainer and orchestration service wiring for integration tests.
/// </summary>
public sealed class OrchestrationFixture : IAsyncLifetime
{
    private readonly MongoDbContainer _container = new MongoDbBuilder()
        .WithImage("mongo:7.0")
        .Build();

    public RecordingHub Hub { get; } = new();
    public MongoDbContext Context { get; private set; } = null!;
    public JobRepository Jobs { get; private set; } = null!;
    public TaskRepository Tasks { get; private set; } = null!;
    public SimulationSessionRepository Sessions { get; private set; } = null!;
    public JobService JobService { get; private set; } = null!;
    public TaskService TaskService { get; private set; } = null!;
    public SimulationSessionService SessionService { get; private set; } = null!;
    public HeartbeatMonitorService Monitor { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        Context = new MongoDbContext(Options.Create(new MongoDbSettings
        {
            ConnectionString = _container.GetConnectionString(),
            DatabaseName = $"Fabrik3D_tests_{Guid.NewGuid():N}",
        }));

        Jobs = new JobRepository(Context);
        Tasks = new TaskRepository(Context);
        Sessions = new SimulationSessionRepository(Context);

        var options = Options.Create(new OrchestrationOptions
        {
            HeartbeatTimeoutSeconds = 5,
            HeartbeatCheckIntervalSeconds = 1,
        });

        JobService = new JobService(
            Jobs, Tasks, Sessions, Hub, NullLogger<JobService>.Instance, options);
        TaskService = new TaskService(
            Tasks, Jobs, Sessions, Hub, NullLogger<TaskService>.Instance);
        SessionService = new SimulationSessionService(
            Sessions, Hub, NullLogger<SimulationSessionService>.Instance);
        Monitor = new HeartbeatMonitorService(
            Sessions, Hub, NullLogger<HeartbeatMonitorService>.Instance, options);
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();
}

[CollectionDefinition(Name)]
public sealed class OrchestrationCollection : ICollectionFixture<OrchestrationFixture>
{
    public const string Name = "isolated-orchestration-mongodb";
}

/// <summary>
/// Hub fake that records every broadcast instead of sending over SignalR.
/// </summary>
public sealed class RecordingHub : IHubNotificationService
{
    private readonly List<object> _events = new();

    public IReadOnlyList<object> Events => _events;

    public Task JobStateChangedAsync(JobStateChangedEvent evt)
    {
        lock (_events) _events.Add(evt);
        return Task.CompletedTask;
    }

    public Task SimulationStateChangedAsync(SimulationStateChangedEvent evt)
    {
        lock (_events) _events.Add(evt);
        return Task.CompletedTask;
    }

    public Task TaskStateChangedAsync(TaskStateChangedEvent evt)
    {
        lock (_events) _events.Add(evt);
        return Task.CompletedTask;
    }

    public Task AlarmRaisedAsync(AlarmRaisedEvent evt) => Task.CompletedTask;
    public Task AlarmAcknowledgedAsync(AlarmAcknowledgedEvent evt) => Task.CompletedTask;
    public Task OperatorMessageAsync(OperatorMessageEvent evt) => Task.CompletedTask;
    public Task MachineStateChangedAsync(MachineStateChangedEvent evt) => Task.CompletedTask;
}
