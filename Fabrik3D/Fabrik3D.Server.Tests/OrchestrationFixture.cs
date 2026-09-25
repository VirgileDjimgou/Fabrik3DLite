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
    public ControlAuthorityRepository Authorities { get; private set; } = null!;
    public JobService JobService { get; private set; } = null!;
    public TaskService TaskService { get; private set; } = null!;
    public SimulationSessionService SessionService { get; private set; } = null!;
    public ControlAuthorityService AuthorityService { get; private set; } = null!;
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
        Authorities = new ControlAuthorityRepository(Context);

        var options = Options.Create(new OrchestrationOptions
        {
            HeartbeatTimeoutSeconds = 5,
            HeartbeatCheckIntervalSeconds = 1,
            AuthorityLeaseSeconds = 30,
            RequireAuthorityConfirmation = true,
        });

        JobService = new JobService(
            Jobs, Tasks, Sessions, Hub, NullLogger<JobService>.Instance, options);
        TaskService = new TaskService(
            Tasks, Jobs, Sessions, Hub, NullLogger<TaskService>.Instance);
        SessionService = new SimulationSessionService(
            Sessions, Hub, NullLogger<SimulationSessionService>.Instance);
        AuthorityService = new ControlAuthorityService(
            Authorities, Hub, new AlwaysReadyOwnerProbe(), options, TimeProvider.System,
            NullLogger<ControlAuthorityService>.Instance);
        Monitor = new HeartbeatMonitorService(
            Sessions, Hub, NullLogger<HeartbeatMonitorService>.Instance, options, AuthorityService);
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

    public Task ControlAuthorityChangedAsync(ControlAuthorityChangedEvent evt)
    {
        lock (_events) _events.Add(evt);
        return Task.CompletedTask;
    }
}

/// <summary>Deterministic owner probe: every owner is ready. Used by authority integration tests.</summary>
public sealed class AlwaysReadyOwnerProbe : Fabrik3D.Domain.Control.IControlAuthorityOwnerProbe
{
    public Task<bool> IsOwnerReadyAsync(
        Fabrik3D.Contracts.Enums.ControlAuthorityOwnerKind ownerKind,
        string ownerId,
        CancellationToken cancellationToken = default)
        => Task.FromResult(true);
}

/// <summary>Deterministic owner probe that refuses a specific owner id.</summary>
public sealed class UnreadyOwnerProbe : Fabrik3D.Domain.Control.IControlAuthorityOwnerProbe
{
    private readonly string _unreadyOwnerId;

    public UnreadyOwnerProbe(string unreadyOwnerId) => _unreadyOwnerId = unreadyOwnerId;

    public Task<bool> IsOwnerReadyAsync(
        Fabrik3D.Contracts.Enums.ControlAuthorityOwnerKind ownerKind,
        string ownerId,
        CancellationToken cancellationToken = default)
        => Task.FromResult(!string.Equals(ownerId, _unreadyOwnerId, StringComparison.Ordinal));
}
