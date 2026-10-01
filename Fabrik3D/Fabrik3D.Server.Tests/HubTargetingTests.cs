using Fabrik3D.Contracts.Events;
using Fabrik3D.Server.Hubs;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S57 SignalR scoping negatives. Targeted lifecycle/command events must be published through the
/// assigned simulator group only, never through a global broadcast: an execution request or jog
/// command for one cell must be unreachable by unrelated clients or tenants.
/// </summary>
public class HubTargetingTests
{
    private sealed class RecordingProxy : IClientProxy
    {
        public List<(string Method, object?[] Args)> Sent { get; } = [];

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            Sent.Add((method, args));
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingHubClients : IHubClients
    {
        public Dictionary<string, RecordingProxy> GroupProxies { get; } = new(StringComparer.Ordinal);
        public RecordingProxy AllProxy { get; } = new();

        public IClientProxy All => AllProxy;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => AllProxy;
        public IClientProxy Client(string connectionId) => AllProxy;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => AllProxy;
        public IClientProxy Group(string groupName) =>
            GroupProxies.TryGetValue(groupName, out var proxy) ? proxy : GroupProxies[groupName] = new RecordingProxy();
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Group(groupName);
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => AllProxy;
        public IClientProxy User(string userId) => AllProxy;
        public IClientProxy Users(IReadOnlyList<string> userIds) => AllProxy;
    }

    private sealed class RecordingHubContext : IHubContext<OrchestrationHub>
    {
        public RecordingHubClients HubClients { get; } = new();
        public IHubClients Clients => HubClients;
        public IGroupManager Groups { get; } = new NoopGroupManager();
    }

    private sealed class NoopGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private static (HubNotificationService Service, RecordingHubContext Context) CreateService()
    {
        var context = new RecordingHubContext();
        return (new HubNotificationService(context, NullLogger<HubNotificationService>.Instance), context);
    }

    [Fact]
    public async Task Execution_dispatch_is_targeted_to_the_assigned_simulator_group()
    {
        var (service, context) = CreateService();
        var evt = new ExecutionDispatchRequestedEvent(
            "job-1", "session-1", "reference-cell", "sim-7", "corr-1",
            DateTime.UtcNow, DateTime.UtcNow.AddMinutes(1), ["task-1"]);

        await service.ExecutionDispatchRequestedAsync(evt);

        var groupName = OrchestrationGroups.Simulator("sim-7");
        Assert.True(context.HubClients.GroupProxies.ContainsKey(groupName));
        var sent = Assert.Single(context.HubClients.GroupProxies[groupName].Sent);
        Assert.Equal("ExecutionDispatchRequested", sent.Method);
        Assert.Empty(context.HubClients.AllProxy.Sent);
    }

    [Fact]
    public async Task Jog_command_is_targeted_to_the_assigned_simulator_group()
    {
        var (service, context) = CreateService();
        var evt = new JogCommandIssuedEvent(
            "reference-cell", "robot-1", "sim-9", "press", "J1", 1, "dm-1", "manual", "corr-2", DateTime.UtcNow);

        await service.JogCommandIssuedAsync(evt);

        var sent = Assert.Single(context.HubClients.GroupProxies[OrchestrationGroups.Simulator("sim-9")].Sent);
        Assert.Equal("JogCommandIssued", sent.Method);
        Assert.Empty(context.HubClients.AllProxy.Sent);
    }
}
