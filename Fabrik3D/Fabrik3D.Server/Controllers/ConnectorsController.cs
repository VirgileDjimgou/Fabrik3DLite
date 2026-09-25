using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Infrastructure.OpcUa;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Read-only industrial connector observability. Additive surface used by operators and
/// diagnostics; it never performs protocol writes.
/// </summary>
[ApiController]
[Route("api/connectors")]
public class ConnectorsController : ControllerBase
{
    private readonly OpcUaConnector _connector;
    private readonly OpcUaOptions _options;

    public ConnectorsController(OpcUaConnector connector, IOptions<OpcUaOptions> options)
    {
        _connector = connector;
        _options = options.Value;
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
}
