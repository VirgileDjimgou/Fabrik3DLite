using Fabrik3D.Infrastructure.OpcUa;
namespace Fabrik3D.Server.Services;
public sealed class OpcUaConnectorHostedService : IHostedService
{
    private readonly OpcUaConnector _connector;
    private readonly ILogger<OpcUaConnectorHostedService> _log;

    public OpcUaConnectorHostedService(OpcUaConnector connector, ILogger<OpcUaConnectorHostedService> log)
    {
        _connector = connector;
        _log = log;
    }

    public Task StartAsync(CancellationToken cancellationToken) => _connector.StartAsync(cancellationToken);

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _connector.StopAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "OPC UA connector did not shut down cleanly.");
        }
    }
}
