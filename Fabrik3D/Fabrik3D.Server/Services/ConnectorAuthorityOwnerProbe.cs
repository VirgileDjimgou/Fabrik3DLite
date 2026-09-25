using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Handover precondition probe for connector owners. A connector owner is only ready when the
/// matching connector is <c>Connected</c> (disabled, connecting, degraded or errored all fail
/// closed). Unknown owners are refused so a typo cannot silently grant authority.
/// </summary>
public sealed class ConnectorAuthorityOwnerProbe : IControlAuthorityOwnerProbe
{
    private readonly OpcUaConnector _opcUa;
    private readonly MqttConnector _mqtt;
    private readonly ModbusConnector _modbus;

    public ConnectorAuthorityOwnerProbe(OpcUaConnector opcUa, MqttConnector mqtt, ModbusConnector modbus)
    {
        _opcUa = opcUa;
        _mqtt = mqtt;
        _modbus = modbus;
    }

    public Task<bool> IsOwnerReadyAsync(
        ControlAuthorityOwnerKind ownerKind, string ownerId, CancellationToken cancellationToken = default)
    {
        if (ownerKind != ControlAuthorityOwnerKind.Connector)
        {
            // Simulator owners are validated by session ownership elsewhere; only connector owners
            // have a transport health precondition here.
            return Task.FromResult(true);
        }

        var ready = ownerId.Trim().ToLowerInvariant() switch
        {
            "opcua" => _opcUa.State == OpcUaConnectorState.Connected,
            "mqtt" => _mqtt.State == MqttConnectorState.Connected,
            "modbus" => _modbus.State == ModbusConnectorState.Connected,
            _ => false,
        };

        return Task.FromResult(ready);
    }
}
