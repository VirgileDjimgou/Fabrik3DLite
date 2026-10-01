using Fabrik3D.Contracts.Events;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Abstraction over SignalR so services stay testable without a hub connection.
/// </summary>
public interface IHubNotificationService
{
    Task JobStateChangedAsync(JobStateChangedEvent evt);
    Task SimulationStateChangedAsync(SimulationStateChangedEvent evt);
    Task TaskStateChangedAsync(TaskStateChangedEvent evt);
    Task AlarmRaisedAsync(AlarmRaisedEvent evt);
    Task AlarmAcknowledgedAsync(AlarmAcknowledgedEvent evt);
    Task OperatorMessageAsync(OperatorMessageEvent evt);
    Task MachineStateChangedAsync(MachineStateChangedEvent evt);
    Task ControlAuthorityChangedAsync(ControlAuthorityChangedEvent evt);

    /// <summary>
    /// Publishes a targeted execution request to the assigned simulator's group only (S51).
    /// </summary>
    Task ExecutionDispatchRequestedAsync(ExecutionDispatchRequestedEvent evt);

    /// <summary>Broadcasts a dispatch lifecycle change to HMI observers (S51).</summary>
    Task DispatchStateChangedAsync(DispatchStateChangedEvent evt);

    /// <summary>
    /// Publishes an authorized jog command to the assigned simulator's group only (S53). Never
    /// broadcast to unrelated simulators or tenants.
    /// </summary>
    Task JogCommandIssuedAsync(JogCommandIssuedEvent evt);
}
