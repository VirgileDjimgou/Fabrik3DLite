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
    private readonly ILogger<HubNotificationService> _log;

    public HubNotificationService(IHubContext<OrchestrationHub> hub, ILogger<HubNotificationService> log)
    {
        _hub = hub;
        _log = log;
    }

    public Task JobStateChangedAsync(JobStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] JobStateChanged → job={JobId} {Old}→{New}",
            evt.JobId, evt.OldStatus, evt.NewStatus);
        return _hub.Clients.All.SendAsync("JobStateChanged", evt);
    }

    public Task SimulationStateChangedAsync(SimulationStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] SimulationStateChanged → session={SessionId} status={Status} phase={Phase} machined={Machined}/{Total}",
            evt.SessionId, evt.Status, evt.CurrentPhase, evt.MachinedCount, evt.TotalCount);
        return _hub.Clients.All.SendAsync("SimulationStateChanged", evt);
    }

    public Task AlarmRaisedAsync(AlarmRaisedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] AlarmRaised → {Code} {Title}", evt.Code, evt.Title);
        return _hub.Clients.All.SendAsync("AlarmRaised", evt);
    }

    public Task AlarmAcknowledgedAsync(AlarmAcknowledgedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] AlarmAcknowledged → {AlarmId}", evt.AlarmId);
        return _hub.Clients.All.SendAsync("AlarmAcknowledged", evt);
    }

    public Task OperatorMessageAsync(OperatorMessageEvent evt)
    {
        _log.LogInformation("[Server][SignalR] OperatorMessage → {Title}", evt.Title);
        return _hub.Clients.All.SendAsync("OperatorMessage", evt);
    }

    public Task MachineStateChangedAsync(MachineStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] MachineStateChanged → mode={Mode} sim={SimStatus} robot={Robot} cnc={Cnc} phase={Phase}",
            evt.MachineMode, evt.SimulationStatus, evt.RobotState, evt.CncState, evt.CurrentPhase);
        return _hub.Clients.All.SendAsync("MachineStateChanged", evt);
    }
}
