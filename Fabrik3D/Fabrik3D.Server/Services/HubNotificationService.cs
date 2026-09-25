using Fabrik3D.Contracts.Events;
using Fabrik3D.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Publishes typed events to all connected SignalR clients.
/// Inject this into any service that needs to broadcast real-time updates.
/// </summary>
public class HubNotificationService : IHubNotificationService
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
        _log.LogInformation("[Server][SignalR] JobStateChanged → job={JobId} {Old}→{New} correlation={CorrelationId}",
            evt.JobId, evt.OldStatus, evt.NewStatus, evt.CorrelationId);
        return _hub.Clients.All.SendAsync("JobStateChanged", evt);
    }

    public Task SimulationStateChangedAsync(SimulationStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] SimulationStateChanged → session={SessionId} status={Status} phase={Phase} machined={Machined}/{Total} correlation={CorrelationId}",
            evt.SessionId, evt.Status, evt.CurrentPhase, evt.MachinedCount, evt.TotalCount, evt.CorrelationId);
        return _hub.Clients.All.SendAsync("SimulationStateChanged", evt);
    }

    public Task TaskStateChangedAsync(TaskStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] TaskStateChanged → task={TaskId} job={JobId} {Old}→{New} correlation={CorrelationId}",
            evt.TaskId, evt.JobId, evt.OldStatus, evt.NewStatus, evt.CorrelationId);
        return _hub.Clients.All.SendAsync("TaskStateChanged", evt);
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

    public Task ControlAuthorityChangedAsync(ControlAuthorityChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] ControlAuthorityChanged → scope={Scope} {PreviousMode}→{Mode} state={State} owner={OwnerId} event={EventType} correlation={CorrelationId}",
            evt.Scope, evt.PreviousMode, evt.Mode, evt.State, evt.OwnerId, evt.EventType, evt.CorrelationId);
        return _hub.Clients.All.SendAsync("ControlAuthorityChanged", evt);
    }
}
