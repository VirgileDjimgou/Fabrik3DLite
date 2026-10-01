using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Observability;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Fabrik3D.Server.Hubs;

/// <summary>
/// Orchestration hub. Connections are authenticated with the same JWT bearer token and the same
/// Read policy as REST; the access token is supplied through SignalR's <c>access_token</c> query
/// parameter at negotiation and never logged. An expired token closes the connection and the
/// clients must explicitly re-authenticate instead of silently degrading to anonymous.
/// </summary>
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class OrchestrationHub : Hub
{
    private readonly ObservabilityMetrics? _metrics;
    private readonly SimulatorRegistry? _registry;

    public OrchestrationHub(ObservabilityMetrics? metrics = null, SimulatorRegistry? registry = null)
    {
        _metrics = metrics;
        _registry = registry;
    }

    public override async Task OnConnectedAsync()
    {
        _metrics?.RecordSignalRConnection(1);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _metrics?.RecordSignalRConnection(-1);
        _registry?.UnregisterByConnection(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Registers a simulator connection into its targeted dispatch group and records its cell
    /// capability (S51). The simulator id and cell id are validated server-side; the group is scoped
    /// by simulator id so a targeted execution request never reaches unrelated simulators.
    /// Re-registering after a reconnect is idempotent.
    /// </summary>
    public async Task RegisterSimulator(string simulatorId, string cellId)
    {
        if (string.IsNullOrWhiteSpace(simulatorId) || simulatorId.Length > 100)
        {
            throw new HubException("A valid simulator id is required.");
        }

        if (string.IsNullOrWhiteSpace(cellId) || cellId.Length > 100)
        {
            throw new HubException("A valid cell id is required.");
        }

        var id = simulatorId.Trim();
        await Groups.AddToGroupAsync(Context.ConnectionId, OrchestrationGroups.Simulator(id));
        _registry?.Register(id, cellId.Trim(), Context.ConnectionId, DateTime.UtcNow);
    }

    /// <summary>Removes a simulator connection from its targeted dispatch group and registry.</summary>
    public async Task UnregisterSimulator(string simulatorId)
    {
        if (string.IsNullOrWhiteSpace(simulatorId)) return;
        var id = simulatorId.Trim();
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, OrchestrationGroups.Simulator(id));
        _registry?.Unregister(id);
    }
}
