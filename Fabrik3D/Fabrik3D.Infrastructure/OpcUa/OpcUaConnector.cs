using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
namespace Fabrik3D.Infrastructure.OpcUa;
/** Transport-independent boundary; a deployed OPC UA client can implement subscription behind this class. */
public class OpcUaConnector
{
    private readonly OpcUaOptions _options; private readonly ILogger<OpcUaConnector> _log;
    public string Health { get; private set; } = "Disabled";
    public OpcUaConnector(IOptions<OpcUaOptions> options, ILogger<OpcUaConnector> log) { _options = options.Value; _log = log; }
    public Task StartAsync() { Health = _options.Enabled ? "Unavailable" : "Disabled"; if (_options.Enabled) _log.LogWarning("OPC UA transport is optional; connector starts read-only at {Endpoint}", _options.Endpoint); return Task.CompletedTask; }
    public bool IsWriteAllowed(string nodeId) => OpcUaMapping.CanWrite(_options, nodeId);
}
