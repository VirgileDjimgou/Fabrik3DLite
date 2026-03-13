using Fabrik3D.Contracts.Events;
using Fabrik3D.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Publishes typed events to all connected SignalR clients.
/// Inject this into any service that needs to broadcast real-time updates.
/// </summary>
public class HubNotificationService
{
    private readonly IHubContext<OrchestrationHub> _hub;

    public HubNotificationService(IHubContext<OrchestrationHub> hub) => _hub = hub;

    public Task JobStateChangedAsync(JobStateChangedEvent evt) =>
        _hub.Clients.All.SendAsync("JobStateChanged", evt);

    public Task SimulationStateChangedAsync(SimulationStateChangedEvent evt) =>
        _hub.Clients.All.SendAsync("SimulationStateChanged", evt);

    public Task AlarmRaisedAsync(AlarmRaisedEvent evt) =>
        _hub.Clients.All.SendAsync("AlarmRaised", evt);

    public Task AlarmAcknowledgedAsync(AlarmAcknowledgedEvent evt) =>
        _hub.Clients.All.SendAsync("AlarmAcknowledged", evt);

    public Task OperatorMessageAsync(OperatorMessageEvent evt) =>
        _hub.Clients.All.SendAsync("OperatorMessage", evt);

    public Task MachineStateChangedAsync(MachineStateChangedEvent evt) =>
        _hub.Clients.All.SendAsync("MachineStateChanged", evt);
}
