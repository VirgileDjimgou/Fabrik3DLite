using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Server.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Read-only industrial connector observability. Additive surface used by operators and
/// diagnostics; it never performs protocol writes.
/// </summary>
[ApiController]
[Route("api/connectors")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class ConnectorsController : ControllerBase
{
    private readonly OpcUaConnector _connector;
    private readonly OpcUaOptions _options;
    private readonly MqttConnector _mqttConnector;
    private readonly MqttOptions _mqttOptions;
    private readonly ModbusConnector _modbusConnector;
    private readonly ModbusOptions _modbusOptions;

    public ConnectorsController(
        OpcUaConnector connector,
        IOptions<OpcUaOptions> options,
        MqttConnector mqttConnector,
        IOptions<MqttOptions> mqttOptions,
        ModbusConnector modbusConnector,
        IOptions<ModbusOptions> modbusOptions)
    {
        _connector = connector;
        _options = options.Value;
        _mqttConnector = mqttConnector;
        _mqttOptions = mqttOptions.Value;
        _modbusConnector = modbusConnector;
        _modbusOptions = modbusOptions.Value;
    }

    /// <summary>OPC UA connector health and diagnostics.</summary>
    [HttpGet("opcua")]
    [ProducesResponseType(typeof(ConnectorStatusDto), 200)]
    public IActionResult GetOpcUa()
    {
        var status = _connector.GetStatus();
        return Ok(new ConnectorStatusDto(
            "opcua",
            status.State.ToString(),
            _options.Enabled ? _options.Endpoint : null,
            status.LastError,
            status.ReconnectCount,
            status.MonitoredItemCount,
            status.NotificationsReceived,
            status.UpdatesAccepted,
            status.UpdatesRejected,
            status.WriteAttempts,
            status.WritesAccepted,
            status.WritesRejected,
            DateTimeOffset.UtcNow));
    }

    /// <summary>MQTT connector health and diagnostics.</summary>
    [HttpGet("mqtt")]
    [ProducesResponseType(typeof(ConnectorStatusDto), 200)]
    public IActionResult GetMqtt()
    {
        var status = _mqttConnector.GetStatus();
        return Ok(new ConnectorStatusDto(
            "mqtt",
            status.State.ToString(),
            _mqttOptions.Enabled ? _mqttOptions.Broker : null,
            status.LastError,
            status.ReconnectCount,
            status.SubscriptionCount,
            status.MessagesReceived,
            status.UpdatesAccepted,
            status.UpdatesRejected,
            status.WriteAttempts,
            status.WritesAccepted,
            status.WritesRejected,
            DateTimeOffset.UtcNow));
    }

    /// <summary>Modbus TCP connector health and diagnostics.</summary>
    [HttpGet("modbus")]
    [ProducesResponseType(typeof(ConnectorStatusDto), 200)]
    public IActionResult GetModbus()
    {
        var status = _modbusConnector.GetStatus();
        return Ok(new ConnectorStatusDto(
            "modbus",
            status.State.ToString(),
            _modbusOptions.Enabled ? $"{_modbusOptions.Host}:{_modbusOptions.Port}" : null,
            status.LastError,
            status.ReconnectCount,
            status.PointCount,
            status.PollCycles,
            status.UpdatesAccepted,
            status.UpdatesRejected,
            status.WriteAttempts,
            status.WritesAccepted,
            status.WritesRejected,
            DateTimeOffset.UtcNow));
    }
}
