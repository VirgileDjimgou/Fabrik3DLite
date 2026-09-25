using Fabrik3D.Server.Authentication;
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
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}
