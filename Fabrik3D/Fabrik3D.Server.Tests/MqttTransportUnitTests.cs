using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.Server.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for the MQTT transport pieces that do not need a live broker: option validation,
/// topic/payload validation, schema version handling, quality/source and retained-message policy,
/// command allow-list, correlation/session metadata and the connector health surface.
/// Live-broker coverage lives in <see cref="MqttConnectorIntegrationTests"/>.
/// </summary>
public class MqttTransportUnitTests
{
    private static MqttOptions EnabledOptions() => new()
    {
        Enabled = true,
        Broker = "mqtt://localhost:1883",
        ClientId = "fabrik3d-test",
        TelemetryTopics = ["fabrik3d/v1/cells/+/equipment/+/telemetry"],
    };

    private const string TelemetryTopic = "fabrik3d/v1/cells/demo/equipment/robot-1/telemetry";

    private static string Payload(
        string? schemaVersion = "1.0",
        string? equipmentId = "robot-1",
        string? quality = null,
        string? source = null,
        string? timestampUtc = "2026-01-01T12:00:00Z",
        string? correlationId = null,
        string? sessionId = null,
        string measurements = "{\"speed\":1.5}")
    {
        var fields = new List<string>
        {
            $"\"schemaVersion\":{(schemaVersion is null ? "null" : $"\"{schemaVersion}\"")}",
            $"\"equipmentId\":{(equipmentId is null ? "null" : $"\"{equipmentId}\"")}",
            "\"category\":\"robot\"",
            "\"executionState\":\"Running\"",
            $"\"measurements\":{measurements}",
        };

        if (timestampUtc is not null)
        {
            fields.Add($"\"timestampUtc\":\"{timestampUtc}\"");
        }

        if (quality is not null)
        {
            fields.Add($"\"quality\":\"{quality}\"");
        }

        if (source is not null)
        {
            fields.Add($"\"source\":\"{source}\"");
        }

        if (correlationId is not null)
        {
            fields.Add($"\"correlationId\":\"{correlationId}\"");
        }

        if (sessionId is not null)
        {
            fields.Add($"\"sessionId\":\"{sessionId}\"");
        }

        return "{" + string.Join(",", fields) + "}";
    }

    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Disabled_connector_skips_validation_entirely()
    {
        var options = new MqttOptions
        {
            Enabled = false,
            Broker = "not-a-broker",
            QoS = 9,
            ReconnectDelaySeconds = 50,
            MaxReconnectDelaySeconds = 5,
            ProtocolVersion = "carrier-pigeon",
        };

        Assert.Empty(MqttOptionsValidator.Validate(options));
    }

    [Fact]
    public void Validator_reports_invalid_broker_protocol_and_signal_map()
    {
        var options = EnabledOptions();
        options.Broker = "http://localhost:1883";
        options.QoS = 7;
        options.ReconnectDelaySeconds = 10;
        options.MaxReconnectDelaySeconds = 5;
        options.ConnectTimeoutSeconds = 0;
        options.MaxPayloadBytes = 0;
        options.StaleAfterMilliseconds = 0;
        options.ProtocolVersion = "4.0";
        options.AllowUntrustedCertificates = true;
        options.UseTls = false;
        options.WillTopic = "fabrik3d/v1/cells/demo/equipment/robot-1/status";
        options.WillPayload = string.Empty;
        options.SignalMap =
        [
            new MqttSignalMapping { SignalId = "robot-1.Speed", Measurement = "speed", DataType = "quantum" },
            new MqttSignalMapping { SignalId = "robot-1.Speed", Measurement = "speed2" },
            new MqttSignalMapping { SignalId = "", Measurement = "speed3" },
        ];

        var errors = MqttOptionsValidator.Validate(options);

        Assert.Contains(errors, error => error.StartsWith("invalid-broker", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-qos", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-reconnect-policy", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-connect-timeout", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-payload-bound", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-stale-after", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-protocol-version", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("insecure-tls-policy", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-will", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-data-type", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("duplicate-signal-id", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.StartsWith("invalid-signal-map-entry", StringComparison.Ordinal));
    }

    [Fact]
    public void Untrusted_certificate_escape_hatch_is_valid_only_with_tls()
    {
        var options = EnabledOptions();
        options.UseTls = true;
        options.AllowUntrustedCertificates = true;

        Assert.Empty(MqttOptionsValidator.Validate(options));
    }

    [Fact]
    public void Backward_compatible_1_0_fixture_still_parses()
    {
        var fixture = File.ReadAllText(FindFixture())
            .Trim()
            .TrimStart('[')
            .TrimEnd(']');

        Assert.True(MqttMapping.TryParseTelemetry(TelemetryTopic, fixture, out var legacy));
        Assert.Equal("robot-1", legacy!.EquipmentId);
        Assert.Null(legacy.Source);
        Assert.Null(legacy.Quality);

        Assert.True(MqttMapping.TryParseTelemetry(
            TelemetryTopic, fixture, retained: false, EnabledOptions(), Now, out var sample, out var reason));
        Assert.Null(reason);
        Assert.Equal("robot-1", sample!.EquipmentId);
        Assert.Equal(SignalQuality.Good, sample.Quality);
        Assert.Equal(SignalSource.Observed, sample.Source);
        Assert.True(sample.Measurements.ContainsKey("speedMetersPerSecond"));
    }

    [Fact]
    public void Optional_source_quality_and_correlation_fields_are_parsed()
    {
        var payload = Payload(quality: "uncertain", source: "simulated", correlationId: "corr-1", sessionId: "sess-1");

        Assert.True(MqttMapping.TryParseTelemetry(
            TelemetryTopic, payload, retained: false, EnabledOptions(), Now, out var sample, out var reason));

        Assert.Null(reason);
        Assert.Equal(SignalQuality.Uncertain, sample!.Quality);
        Assert.Equal(SignalSource.Simulated, sample.Source);
        Assert.Equal("corr-1", sample.CorrelationId);
        Assert.Equal("sess-1", sample.SessionId);
    }

    [Fact]
    public void Unsupported_schema_malformed_json_and_missing_equipment_are_rejected()
    {
        var options = EnabledOptions();

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, Payload(schemaVersion: "2.0"), false, options, Now, out _, out var unsupported));
        Assert.Equal("unsupported-schema", unsupported);

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, "{not json", false, options, Now, out _, out var malformed));
        Assert.Equal("malformed-json", malformed);

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, Payload(equipmentId: ""), false, options, Now, out _, out var missing));
        Assert.Equal("missing-equipment-id", missing);
    }

    [Fact]
    public void Invalid_or_commanded_quality_and_source_are_rejected()
    {
        var options = EnabledOptions();

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, Payload(quality: "excellent"), false, options, Now, out _, out var quality));
        Assert.Equal("invalid-quality", quality);

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, Payload(source: "teleport"), false, options, Now, out _, out var source));
        Assert.Equal("invalid-source", source);

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, Payload(source: "commanded"), false, options, Now, out _, out var commanded));
        Assert.Equal("commanded-source-not-allowed", commanded);
    }

    [Fact]
    public void Unknown_topic_and_oversized_payload_are_rejected()
    {
        var options = EnabledOptions();

        Assert.False(MqttMapping.TryParseTelemetry("other/topic", Payload(), false, options, Now, out _, out var unknown));
        Assert.Equal("unknown-topic", unknown);

        options.MaxPayloadBytes = 20;
        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, Payload(), false, options, Now, out _, out var oversized));
        Assert.Equal("payload-too-large", oversized);
    }

    [Fact]
    public void Live_payload_without_timestamp_uses_arrival_time()
    {
        var payload = Payload(timestampUtc: null);

        Assert.True(MqttMapping.TryParseTelemetry(TelemetryTopic, payload, false, EnabledOptions(), Now, out var sample, out _));
        Assert.False(sample!.HasTimestamp);
        Assert.Equal(Now, sample.Timestamp);
        Assert.Equal(SignalQuality.Good, sample.Quality);
    }

    [Fact]
    public void Retained_without_timestamp_is_never_accepted()
    {
        var payload = Payload(timestampUtc: null);

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, payload, retained: true, EnabledOptions(), Now, out _, out var reason));
        Assert.Equal("retained-without-timestamp", reason);
    }

    [Fact]
    public void Retained_stale_value_is_downgraded_to_historical_stale_quality()
    {
        var options = EnabledOptions();
        options.StaleAfterMilliseconds = 5000;
        var payload = Payload(timestampUtc: "2026-01-01T11:00:00Z");

        Assert.True(MqttMapping.TryParseTelemetry(TelemetryTopic, payload, retained: true, options, Now, out var sample, out _));
        Assert.True(sample!.Retained);
        Assert.True(sample.Historical);
        Assert.Equal(SignalQuality.Stale, sample.Quality);
    }

    [Fact]
    public void Retained_fresh_value_keeps_its_declared_quality()
    {
        var options = EnabledOptions();
        options.StaleAfterMilliseconds = 5000;
        var payload = Payload(timestampUtc: "2026-01-01T11:59:58Z");

        Assert.True(MqttMapping.TryParseTelemetry(TelemetryTopic, payload, retained: true, options, Now, out var sample, out _));
        Assert.False(sample!.Historical);
        Assert.Equal(SignalQuality.Good, sample.Quality);
    }

    [Fact]
    public void Retained_telemetry_can_be_disabled_outright()
    {
        var options = EnabledOptions();
        options.AllowRetainedTelemetry = false;

        Assert.False(MqttMapping.TryParseTelemetry(TelemetryTopic, Payload(), retained: true, options, Now, out _, out var reason));
        Assert.Equal("retained-telemetry-disabled", reason);
    }

    [Fact]
    public void Wildcard_topic_matching_is_exact_per_level()
    {
        Assert.True(MqttMapping.TopicMatches("fabrik3d/v1/cells/+/equipment/+/telemetry", TelemetryTopic));
        Assert.True(MqttMapping.TopicMatches("fabrik3d/#", TelemetryTopic));
        Assert.False(MqttMapping.TopicMatches("fabrik3d/v1/cells/+/equipment/+/telemetry", "fabrik3d/v1/cells/demo/telemetry"));
        Assert.False(MqttMapping.TopicMatches("fabrik3d/v1/cells/demo/equipment/robot-1/telemetry", "fabrik3d/v1/cells/demo/equipment/robot-2/telemetry"));
    }

    [Fact]
    public void Measurement_conversion_and_data_type_inference_are_explicit()
    {
        using var document = JsonDocument.Parse("{\"a\":1.5,\"b\":7,\"c\":true,\"d\":\"on\",\"e\":null}");

        Assert.Equal(1.5d, MqttMapping.ConvertMeasurement(document.RootElement.GetProperty("a")));
        Assert.Equal(7L, MqttMapping.ConvertMeasurement(document.RootElement.GetProperty("b")));
        Assert.Equal(true, MqttMapping.ConvertMeasurement(document.RootElement.GetProperty("c")));
        Assert.Equal("on", MqttMapping.ConvertMeasurement(document.RootElement.GetProperty("d")));
        Assert.Null(MqttMapping.ConvertMeasurement(document.RootElement.GetProperty("e")));

        Assert.Equal(SignalDataType.Float, MqttMapping.InferDataType(document.RootElement.GetProperty("a")));
        Assert.Equal(SignalDataType.Int, MqttMapping.InferDataType(document.RootElement.GetProperty("b")));
        Assert.Equal(SignalDataType.Bool, MqttMapping.InferDataType(document.RootElement.GetProperty("c")));
        Assert.Equal(SignalDataType.String, MqttMapping.InferDataType(document.RootElement.GetProperty("d")));
    }

    [Fact]
    public void Command_policy_requires_enabled_writes_allow_list_and_explicit_retained_permission()
    {
        var topic = "fabrik3d/v1/cells/demo/equipment/robot-1/command/start";
        var options = new MqttOptions { Enabled = true, AllowWrites = true, CommandAllowList = [topic] };

        Assert.True(MqttMapping.CanPublishCommand(options, topic));
        Assert.False(MqttMapping.CanPublishCommand(options, topic, retain: true));
        options.AllowRetainedCommands = true;
        Assert.True(MqttMapping.CanPublishCommand(options, topic, retain: true));

        options.AllowWrites = false;
        Assert.False(MqttMapping.CanPublishCommand(options, topic));

        options.AllowWrites = true;
        options.CommandAllowList = [topic.ToUpperInvariant()];
        Assert.False(MqttMapping.CanPublishCommand(options, topic));
    }

    [Fact]
    public async Task Outbound_publishes_fail_closed_before_any_connection()
    {
        var mirror = new SignalMirrorStore();
        var topic = "fabrik3d/v1/cells/demo/equipment/robot-1/command/start";

        var disabled = new MqttOptions { Enabled = false };
        await using var disabledConnector = new MqttConnector(Options.Create(disabled), mirror, NullLogger<MqttConnector>.Instance);
        Assert.Equal("connector-disabled", (await disabledConnector.PublishCommandAsync(topic, "{}", CancellationToken.None)).RejectionReason);
        Assert.Equal("connector-disabled", (await disabledConnector.PublishTelemetryAsync(topic, "{}", false, CancellationToken.None)).RejectionReason);

        var readOnly = new MqttOptions { Enabled = true, AllowWrites = false, CommandAllowList = [topic] };
        await using var readOnlyConnector = new MqttConnector(Options.Create(readOnly), mirror, NullLogger<MqttConnector>.Instance);
        Assert.Equal("writes-disabled", (await readOnlyConnector.PublishCommandAsync(topic, "{}", CancellationToken.None)).RejectionReason);

        var notListed = new MqttOptions { Enabled = true, AllowWrites = true, CommandAllowList = [topic + "/other"] };
        await using var notListedConnector = new MqttConnector(Options.Create(notListed), mirror, NullLogger<MqttConnector>.Instance);
        Assert.Equal("not-allow-listed", (await notListedConnector.PublishCommandAsync(topic, "{}", CancellationToken.None)).RejectionReason);

        var retained = new MqttOptions { Enabled = true, AllowWrites = true, CommandAllowList = [topic], AllowRetainedCommands = false };
        await using var retainedConnector = new MqttConnector(Options.Create(retained), mirror, NullLogger<MqttConnector>.Instance);
        Assert.Equal("retained-command-not-allowed", (await retainedConnector.PublishCommandAsync(topic, "{}", true, CancellationToken.None)).RejectionReason);
    }

    [Fact]
    public void Connector_status_surface_maps_disabled_and_enabled_options()
    {
        var disabledOptions = Options.Create(new MqttOptions { Enabled = false });
        var disabledConnector = new MqttConnector(disabledOptions, new SignalMirrorStore(), NullLogger<MqttConnector>.Instance);
        var disabledOpcUa = Options.Create(new Fabrik3D.Infrastructure.OpcUa.OpcUaOptions { Enabled = false });
        var disabledOpcUaConnector = new Fabrik3D.Infrastructure.OpcUa.OpcUaConnector(
            disabledOpcUa, new SignalMirrorStore(), NullLogger<Fabrik3D.Infrastructure.OpcUa.OpcUaConnector>.Instance);
        var disabledModbusOptions = Options.Create(new Fabrik3D.Infrastructure.Modbus.ModbusOptions { Enabled = false });
        var disabledModbusConnector = new Fabrik3D.Infrastructure.Modbus.ModbusConnector(
            disabledModbusOptions, new SignalMirrorStore(), TimeProvider.System, NullLogger<Fabrik3D.Infrastructure.Modbus.ModbusConnector>.Instance);
        var controller = new ConnectorsController(
            disabledOpcUaConnector, disabledOpcUa, disabledConnector, disabledOptions, disabledModbusConnector, disabledModbusOptions);

        var disabledResult = Assert.IsType<OkObjectResult>(controller.GetMqtt());
        var disabledDto = Assert.IsType<ConnectorStatusDto>(disabledResult.Value);
        Assert.Equal("mqtt", disabledDto.Connector);
        Assert.Equal("Disabled", disabledDto.State);
        Assert.Null(disabledDto.Endpoint);
        Assert.Null(disabledDto.LastError);

        var enabledOptions = Options.Create(new MqttOptions { Enabled = true, Broker = "mqtt://127.0.0.1:1883" });
        var enabledConnector = new MqttConnector(enabledOptions, new SignalMirrorStore(), NullLogger<MqttConnector>.Instance);
        var enabledController = new ConnectorsController(
            disabledOpcUaConnector, disabledOpcUa, enabledConnector, enabledOptions, disabledModbusConnector, disabledModbusOptions);

        var enabledResult = Assert.IsType<OkObjectResult>(enabledController.GetMqtt());
        var enabledDto = Assert.IsType<ConnectorStatusDto>(enabledResult.Value);
        Assert.Equal("mqtt://127.0.0.1:1883", enabledDto.Endpoint);
        Assert.Equal("Disabled", enabledDto.State);
    }

    [Fact]
    public async Task Disabled_connector_start_is_inert()
    {
        var options = new MqttOptions { Enabled = false, Broker = "mqtt://127.0.0.1:1" };
        await using var connector = new MqttConnector(Options.Create(options), new SignalMirrorStore(), NullLogger<MqttConnector>.Instance);

        await connector.StartAsync();
        Assert.Equal(MqttConnectorState.Disabled, connector.State);
        Assert.Equal("Disabled", connector.Health);

        await connector.StopAsync(CancellationToken.None);
        Assert.Equal(MqttConnectorState.Disabled, connector.State);
    }

    [Fact]
    public async Task Invalid_enabled_configuration_reports_error_without_connecting()
    {
        var options = new MqttOptions { Enabled = true, Broker = "not-a-broker", ProtocolVersion = "4.0" };
        await using var connector = new MqttConnector(Options.Create(options), new SignalMirrorStore(), NullLogger<MqttConnector>.Instance);

        await connector.StartAsync();

        Assert.Equal(MqttConnectorState.Error, connector.State);
        Assert.False(string.IsNullOrWhiteSpace(connector.LastError));
        Assert.Equal("not-a-broker", connector.GetStatus().Broker);
        Assert.Equal(0, connector.ReconnectCount);
    }

    private static string FindFixture()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "docs", "demo", "mqtt-telemetry.fixture.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException("docs/demo/mqtt-telemetry.fixture.json was not found from the test output directory.");
    }
}
