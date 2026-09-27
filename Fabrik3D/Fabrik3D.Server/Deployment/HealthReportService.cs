using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Deployment;

/// <summary>Minimal MongoDB reachability probe used by readiness checks.</summary>
public interface IMongoHealthProbe
{
    Task<bool> IsReachableAsync(CancellationToken cancellationToken = default);
}

/// <summary>Default probe backed by the shared <see cref="MongoDbContext"/>.</summary>
public sealed class MongoHealthProbe : IMongoHealthProbe
{
    private readonly MongoDbContext _context;

    public MongoHealthProbe(MongoDbContext context) => _context = context;

    public Task<bool> IsReachableAsync(CancellationToken cancellationToken = default) =>
        _context.PingAsync(cancellationToken);
}

/// <summary>Read-only connector state summary (no endpoints or credentials).</summary>
public interface IConnectorHealthSummaryProvider
{
    IReadOnlyList<SupportBundleConnectorDto> GetSummaries();
}

/// <summary>Default summary provider over the three optional protocol adapters.</summary>
public sealed class ConnectorHealthSummaryProvider : IConnectorHealthSummaryProvider
{
    private readonly OpcUaConnector _opcUa;
    private readonly IOptions<OpcUaOptions> _opcUaOptions;
    private readonly MqttConnector _mqtt;
    private readonly IOptions<MqttOptions> _mqttOptions;
    private readonly ModbusConnector _modbus;
    private readonly IOptions<ModbusOptions> _modbusOptions;

    public ConnectorHealthSummaryProvider(
        OpcUaConnector opcUa,
        IOptions<OpcUaOptions> opcUaOptions,
        MqttConnector mqtt,
        IOptions<MqttOptions> mqttOptions,
        ModbusConnector modbus,
        IOptions<ModbusOptions> modbusOptions)
    {
        _opcUa = opcUa;
        _opcUaOptions = opcUaOptions;
        _mqtt = mqtt;
        _mqttOptions = mqttOptions;
        _modbus = modbus;
        _modbusOptions = modbusOptions;
    }

    public IReadOnlyList<SupportBundleConnectorDto> GetSummaries()
    {
        var opcUa = _opcUa.GetStatus();
        var mqtt = _mqtt.GetStatus();
        var modbus = _modbus.GetStatus();

        return
        [
            new SupportBundleConnectorDto("opcua", _opcUaOptions.Value.Enabled, opcUa.State.ToString(), opcUa.LastError),
            new SupportBundleConnectorDto("mqtt", _mqttOptions.Value.Enabled, mqtt.State.ToString(), mqtt.LastError),
            new SupportBundleConnectorDto("modbus", _modbusOptions.Value.Enabled, modbus.State.ToString(), modbus.LastError),
        ];
    }
}

/// <summary>
/// Builds the structured liveness/readiness report. Liveness only asserts that the process is
/// serving; readiness asserts that the dependencies required to do useful work are reachable.
/// </summary>
public sealed class HealthReportService
{
    private readonly IMongoHealthProbe _mongo;
    private readonly VersionInfo _version;
    private readonly IOptions<HistorianOptions> _historian;
    private readonly IConnectorHealthSummaryProvider _connectors;

    public HealthReportService(
        IMongoHealthProbe mongo,
        VersionInfo version,
        IOptions<HistorianOptions> historian,
        IConnectorHealthSummaryProvider connectors)
    {
        _mongo = mongo;
        _version = version;
        _historian = historian;
        _connectors = connectors;
    }

    public HealthReportDto BuildLiveness() => new(
        "Healthy",
        DateTime.UtcNow,
        _version.Version,
        [new HealthCheckDto("self", "Healthy", "Process is running.")]);

    public async Task<HealthReportDto> BuildReadinessAsync(CancellationToken cancellationToken = default)
    {
        var checks = new List<HealthCheckDto>();

        var mongoReachable = await _mongo.IsReachableAsync(cancellationToken);
        checks.Add(new HealthCheckDto(
            "mongo",
            mongoReachable ? "Healthy" : "Unhealthy",
            mongoReachable ? "MongoDB is reachable." : "MongoDB is not reachable."));

        var historianEnabled = _historian.Value.Enabled;
        checks.Add(new HealthCheckDto(
            "historian",
            !historianEnabled || mongoReachable ? "Healthy" : "Unhealthy",
            !historianEnabled
                ? "Historian is disabled."
                : mongoReachable ? "Historian storage is reachable." : "Historian storage is unreachable."));

        var enabledConnectors = _connectors.GetSummaries().Where(c => c.Enabled).ToList();
        var connectorStatus = enabledConnectors.Count == 0
            ? "Healthy"
            : enabledConnectors.All(c => c.State is "Connected" or "Running") ? "Healthy" : "Degraded";
        checks.Add(new HealthCheckDto(
            "connectors",
            connectorStatus,
            enabledConnectors.Count == 0
                ? "No connectors enabled."
                : string.Join(", ", enabledConnectors.Select(c => $"{c.Protocol}={c.State}"))));

        var status = checks.Any(c => c.Status == "Unhealthy")
            ? "Unhealthy"
            : checks.Any(c => c.Status == "Degraded") ? "Degraded" : "Healthy";

        return new HealthReportDto(status, DateTime.UtcNow, _version.Version, checks);
    }
}
