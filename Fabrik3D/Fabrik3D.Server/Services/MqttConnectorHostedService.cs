using Fabrik3D.Infrastructure.Mqtt;

namespace Fabrik3D.Server.Services;

public sealed class MqttConnectorHostedService : IHostedService
{
    private readonly MqttConnector _connector;
    private readonly ILogger<MqttConnectorHostedService> _log;

    public MqttConnectorHostedService(MqttConnector connector, ILogger<MqttConnectorHostedService> log)
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
            _log.LogWarning(ex, "MQTT connector did not shut down cleanly.");
        }
    }
}
