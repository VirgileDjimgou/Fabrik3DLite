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
}
