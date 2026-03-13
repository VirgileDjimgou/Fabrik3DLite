using Microsoft.AspNetCore.SignalR;

namespace Fabrik3D.Server.Hubs;

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
