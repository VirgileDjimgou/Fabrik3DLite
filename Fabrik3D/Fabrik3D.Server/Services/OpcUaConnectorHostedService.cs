using Fabrik3D.Infrastructure.OpcUa;
namespace Fabrik3D.Server.Services;
public sealed class OpcUaConnectorHostedService : IHostedService
{
    private readonly OpcUaConnector _connector; public OpcUaConnectorHostedService(OpcUaConnector connector) => _connector = connector;
    public Task StartAsync(CancellationToken cancellationToken) => _connector.StartAsync();
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
