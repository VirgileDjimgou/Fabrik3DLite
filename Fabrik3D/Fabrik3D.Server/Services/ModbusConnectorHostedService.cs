using Fabrik3D.Infrastructure.Modbus;

namespace Fabrik3D.Server.Services;

public sealed class ModbusConnectorHostedService : IHostedService
{
    private readonly ModbusConnector _connector;
    private readonly ILogger<ModbusConnectorHostedService> _log;

    public ModbusConnectorHostedService(ModbusConnector connector, ILogger<ModbusConnectorHostedService> log)
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
            _log.LogWarning(ex, "Modbus connector did not shut down cleanly.");
        }
    }
}
