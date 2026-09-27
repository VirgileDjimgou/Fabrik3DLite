using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Server.Observability;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Read-only sampler that projects the three optional protocol adapters' existing health counters
/// into metric gauges at scrape time (S49). It never connects, writes or mutates connector state,
/// and it is safe to call from an authenticated diagnostics request.
/// </summary>
public sealed class ConnectorMetricsSampler
{
    private readonly OpcUaConnector _opcUa;
    private readonly IOptions<OpcUaOptions> _opcUaOptions;
    private readonly MqttConnector _mqtt;
    private readonly IOptions<MqttOptions> _mqttOptions;
    private readonly ModbusConnector _modbus;
    private readonly IOptions<ModbusOptions> _modbusOptions;

    public ConnectorMetricsSampler(
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

    public IReadOnlyList<MetricSeries> Sample()
    {
        var series = new List<MetricSeries>();
        var opcUa = _opcUa.GetStatus();
        var mqtt = _mqtt.GetStatus();
        var modbus = _modbus.GetStatus();

        AddConnector(series, "opcua", _opcUaOptions.Value.Enabled, opcUa.State.ToString(),
            opcUa.ReconnectCount, opcUa.UpdatesAccepted, opcUa.UpdatesRejected,
            opcUa.WritesAccepted, opcUa.WritesRejected);
        AddConnector(series, "mqtt", _mqttOptions.Value.Enabled, mqtt.State.ToString(),
            mqtt.ReconnectCount, mqtt.UpdatesAccepted, mqtt.UpdatesRejected,
            mqtt.WritesAccepted, mqtt.WritesRejected);
        AddConnector(series, "modbus", _modbusOptions.Value.Enabled, modbus.State.ToString(),
            modbus.ReconnectCount, modbus.UpdatesAccepted, modbus.UpdatesRejected,
            modbus.WritesAccepted, modbus.WritesRejected);

        return series;
    }

    private static void AddConnector(
        List<MetricSeries> series,
        string protocol,
        bool enabled,
        string state,
        long reconnects,
        long updatesAccepted,
        long updatesRejected,
        long writesAccepted,
        long writesRejected)
    {
        var connected = state is "Connected" or "Running";
        series.Add(Gauge("fabrik3d.connector.enabled", protocol, null, enabled ? 1 : 0));
        series.Add(Gauge("fabrik3d.connector.connected", protocol, null, connected ? 1 : 0));
        series.Add(Gauge("fabrik3d.connector.reconnects", protocol, null, reconnects));
        series.Add(Gauge("fabrik3d.connector.updates", protocol, "accepted", updatesAccepted));
        series.Add(Gauge("fabrik3d.connector.updates", protocol, "rejected", updatesRejected));
        series.Add(Gauge("fabrik3d.connector.writes", protocol, "accepted", writesAccepted));
        series.Add(Gauge("fabrik3d.connector.writes", protocol, "rejected", writesRejected));
    }

    private static MetricSeries Gauge(string name, string protocol, string? outcome, double value)
    {
        var tags = new Dictionary<string, string>(StringComparer.Ordinal) { ["protocol"] = protocol };
        if (outcome is not null) tags["outcome"] = outcome;
        return new MetricSeries(name, MetricKind.Gauge, tags, value, 1, value, value, value);
    }
}
