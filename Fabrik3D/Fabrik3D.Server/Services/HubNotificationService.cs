using System.Diagnostics;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Infrastructure.Observability;
using Fabrik3D.Server.Hubs;
using Fabrik3D.Server.Observability;
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
    private readonly ObservabilityMetrics? _metrics;

    public HubNotificationService(
        IHubContext<OrchestrationHub> hub,
        ILogger<HubNotificationService> log,
        ObservabilityMetrics? metrics = null)
    {
        _hub = hub;
        _log = log;
        _metrics = metrics;
    }

    public Task JobStateChangedAsync(JobStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] JobStateChanged → job={JobId} {Old}→{New} correlation={CorrelationId}",
            evt.JobId, evt.OldStatus, evt.NewStatus, evt.CorrelationId);
        return SendAsync("JobStateChanged", evt, evt.CorrelationId);
    }

    public Task SimulationStateChangedAsync(SimulationStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] SimulationStateChanged → session={SessionId} status={Status} phase={Phase} machined={Machined}/{Total} correlation={CorrelationId}",
            evt.SessionId, evt.Status, evt.CurrentPhase, evt.MachinedCount, evt.TotalCount, evt.CorrelationId);
        return SendAsync("SimulationStateChanged", evt, evt.CorrelationId);
    }

    public Task TaskStateChangedAsync(TaskStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] TaskStateChanged → task={TaskId} job={JobId} {Old}→{New} correlation={CorrelationId}",
            evt.TaskId, evt.JobId, evt.OldStatus, evt.NewStatus, evt.CorrelationId);
        return SendAsync("TaskStateChanged", evt, evt.CorrelationId);
    }

    public Task AlarmRaisedAsync(AlarmRaisedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] AlarmRaised → {Code} {Title}", evt.Code, evt.Title);
        return SendAsync("AlarmRaised", evt, null);
    }

    public Task AlarmAcknowledgedAsync(AlarmAcknowledgedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] AlarmAcknowledged → {AlarmId}", evt.AlarmId);
        return SendAsync("AlarmAcknowledged", evt, null);
    }

    public Task OperatorMessageAsync(OperatorMessageEvent evt)
    {
        _log.LogInformation("[Server][SignalR] OperatorMessage → {Title}", evt.Title);
        return SendAsync("OperatorMessage", evt, null);
    }

    public Task MachineStateChangedAsync(MachineStateChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] MachineStateChanged → mode={Mode} sim={SimStatus} robot={Robot} cnc={Cnc} phase={Phase}",
            evt.MachineMode, evt.SimulationStatus, evt.RobotState, evt.CncState, evt.CurrentPhase);
        return SendAsync("MachineStateChanged", evt, null);
    }

    public Task ControlAuthorityChangedAsync(ControlAuthorityChangedEvent evt)
    {
        _log.LogInformation("[Server][SignalR] ControlAuthorityChanged → scope={Scope} {PreviousMode}→{Mode} state={State} owner={OwnerId} event={EventType} correlation={CorrelationId}",
            evt.Scope, evt.PreviousMode, evt.Mode, evt.State, evt.OwnerId, evt.EventType, evt.CorrelationId);
        _metrics?.RecordAuthorityTransition(evt.Scope, evt.Mode);
        return SendAsync("ControlAuthorityChanged", evt, evt.CorrelationId);
    }

    /// <summary>
    /// Pushes one event with an OTel-compatible span and message counter. The measurement is
    /// best-effort: it never changes delivery semantics and a missing listener is a no-op.
    /// </summary>
    private Task SendAsync(string eventName, object payload, string? correlationId)
    {
        using var activity = Fabrik3DTelemetry.StartActivity(
            Fabrik3DTelemetry.SignalRSendSpan,
            ActivityKind.Producer,
            new Dictionary<string, object?>
            {
                ["signalr.event"] = eventName,
                ["fabrik3d.correlation_id"] = correlationId,
            });
        _metrics?.RecordSignalRMessage(eventName);
        return _hub.Clients.All.SendAsync(eventName, payload);
    }
}
