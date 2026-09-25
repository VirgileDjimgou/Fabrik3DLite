using System.Diagnostics;
using System.Reflection;
using System.Text;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.Signals;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Formatter;
using MQTTnet.Protocol;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Connector integration tests against a real Mosquitto broker started by Testcontainers
/// (<c>eclipse-mosquitto:2</c>). They prove connect, subscribe, telemetry mapping, reconnection
/// after a broker outage, duplicate handling, retained-value policy, malformed/unsupported payload
/// rejection, stale-timestamp rejection, command rejection and allow-listed delivery, Last Will
/// visibility and graceful shutdown.
/// </summary>
[Collection("mqtt-broker")]
public class MqttConnectorIntegrationTests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private const string TelemetryTopic = "fabrik3d/v1/cells/demo/equipment/robot-1/telemetry";
    private const string CommandTopic = "fabrik3d/v1/cells/demo/equipment/robot-1/command/start";

    private readonly ITestOutputHelper _output;

    public MqttConnectorIntegrationTests(ITestOutputHelper output) => _output = output;

    private static MqttOptions ConnectorOptions(MosquittoContainerFixture broker, bool allowWrites = false) => new()
    {
        Enabled = true,
        Broker = broker.BrokerUri,
        ClientId = "fabrik3d-it-" + Guid.NewGuid().ToString("N")[..10],
        QoS = 1,
        CleanSession = true,
        SessionExpirySeconds = 3600,
        ReconnectDelaySeconds = 1,
        MaxReconnectDelaySeconds = 2,
        ConnectTimeoutSeconds = 10,
        KeepAliveSeconds = 5,
        ProtocolVersion = "5.0",
        AllowAnonymousBroker = true,
        AllowWrites = allowWrites,
        StaleAfterMilliseconds = 30_000,
        TelemetryTopics = ["fabrik3d/v1/cells/+/equipment/+/telemetry"],
    };

    private static MqttConnector CreateConnector(MqttOptions options, SignalMirrorStore mirror)
        => new(Options.Create(options), mirror, NullLogger<MqttConnector>.Instance);

    private static MqttClientOptions RawClientOptions(MosquittoContainerFixture broker, string clientId)
        => new MqttClientOptionsBuilder()
            .WithTcpServer(broker.Host, broker.Port)
            .WithClientId(clientId)
            .WithProtocolVersion(MqttProtocolVersion.V500)
            .WithCleanSession(true)
            .WithTimeout(TimeSpan.FromSeconds(10))
            .Build();

    private static async Task PublishAsync(
        MosquittoContainerFixture broker, string topic, string payload, bool retain = false)
    {
        var client = new MqttFactory().CreateMqttClient();
        await client.ConnectAsync(RawClientOptions(broker, "pub-" + Guid.NewGuid().ToString("N")[..8]), CancellationToken.None);
        try
        {
            await client.PublishAsync(
                new MqttApplicationMessageBuilder()
                    .WithTopic(topic)
                    .WithPayload(payload)
                    .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                    .WithRetainFlag(retain)
                    .Build(),
                CancellationToken.None);
        }
        finally
        {
            if (client.IsConnected)
            {
                await client.DisconnectAsync(MqttClientDisconnectOptionsReason.NormalDisconnection, cancellationToken: CancellationToken.None);
            }

            client.Dispose();
        }
    }

    private static string TelemetryPayload(
        double value,
        string? timestampUtc = null,
        string? correlationId = null,
        string? sessionId = null,
        string? schemaVersion = "1.0",
        bool includeTimestamp = true)
    {
        var timestamp = timestampUtc ?? DateTimeOffset.UtcNow.ToString("O");
        var fields = new List<string>
        {
            $"\"schemaVersion\":\"{schemaVersion}\"",
            "\"equipmentId\":\"robot-1\"",
            "\"category\":\"robot\"",
            "\"executionState\":\"Running\"",
            $"\"measurements\":{{\"speed\":{value.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}",
        };

        if (includeTimestamp)
        {
            fields.Add($"\"timestampUtc\":\"{timestamp}\"");
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

    private static async Task<bool> WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
    {
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < timeout)
        {
            if (condition())
            {
                return true;
            }

            await Task.Delay(50);
        }

        return condition();
    }

    private static bool HasValue(SignalMirrorStore mirror, string signalId, double expected)
        => mirror.TryGetSample(signalId, out var sample) &&
           sample!.Value is not null &&
           Math.Abs(Convert.ToDouble(sample.Value) - expected) < 0.0001;

    private static async Task<(IMqttClient Client, TaskCompletionSource<string> Received)> StartSubscriberAsync(
        MosquittoContainerFixture broker, string topic)
    {
        var client = new MqttFactory().CreateMqttClient();
        var received = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        client.ApplicationMessageReceivedAsync += args =>
        {
            var segment = args.ApplicationMessage.PayloadSegment;
            var payload = segment.Count > 0 && segment.Array is not null
                ? Encoding.UTF8.GetString(segment.Array, segment.Offset, segment.Count)
                : string.Empty;
            received.TrySetResult(payload);
            return Task.CompletedTask;
        };

        await client.ConnectAsync(RawClientOptions(broker, "sub-" + Guid.NewGuid().ToString("N")[..8]), CancellationToken.None);
        await client.SubscribeAsync(
            new MqttClientSubscribeOptionsBuilder()
                .WithTopicFilter(filter => filter.WithTopic(topic).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce))
                .Build(),
            CancellationToken.None);

        return (client, received);
    }

    [Fact]
    public async Task Connects_subscribes_and_maps_telemetry_into_the_signal_mirror()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        _output.WriteLine($"MQTT fixture: image={broker.Image} endpoint={broker.BrokerUri}");
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");
        Assert.True(await WaitUntilAsync(() => connector.SubscriptionCount == 1, ObservationTimeout));

        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(2.5, sessionId: "sess-1", correlationId: "corr-1"));

        Assert.True(await WaitUntilAsync(() => HasValue(mirror, "robot-1.speed", 2.5), ObservationTimeout),
            "telemetry was not mapped into the mirror");
        Assert.True(mirror.TryGetSample("robot-1.speed", out var sample));
        Assert.Equal(SignalQuality.Good, sample!.Quality);
        Assert.Equal(SignalSource.Observed, sample.Source);
        Assert.Equal(SignalOrigin.Controller, sample.Origin);
        Assert.Equal(SignalDataType.Float, mirror.Definitions().Single(d => d.SignalId == "robot-1.speed").DataType);

        var status = connector.GetStatus();
        Assert.Equal(1, status.UpdatesAccepted);
        Assert.Equal(0, status.UpdatesRejected);

        _output.WriteLine($"Broker log excerpt:\n{await broker.GetLogsAsync()}");
        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Retained_telemetry_surfaces_only_as_historical_stale_state()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var staleTimestamp = DateTimeOffset.UtcNow.AddMinutes(-30).ToString("O");
        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(9.0, staleTimestamp, correlationId: "retained-old"), retain: true);

        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        options.StaleAfterMilliseconds = 5000;
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        Assert.True(await WaitUntilAsync(() => mirror.TryGetSample("robot-1.speed", out _), ObservationTimeout),
            "the retained telemetry value was not surfaced at all");
        Assert.True(mirror.TryGetSample("robot-1.speed", out var sample));
        Assert.NotEqual(SignalQuality.Good, sample!.Quality);
        Assert.Equal(SignalQuality.Stale, sample.Quality);
        Assert.True(connector.GetStatus().RetainedHistorical >= 1);

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Retained_telemetry_without_a_timestamp_is_rejected()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(4.0, includeTimestamp: false), retain: true);

        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        Assert.True(await WaitUntilAsync(() => connector.GetStatus().InvalidPayloads >= 1, ObservationTimeout),
            "the timestamp-less retained payload was not rejected");
        Assert.False(mirror.TryGetSample("robot-1.speed", out _));

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Malformed_and_unsupported_payloads_are_counted_and_skipped()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        await PublishAsync(broker, TelemetryTopic, "{ this is not json");
        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(1.0, schemaVersion: "2.0"));

        Assert.True(await WaitUntilAsync(() => connector.GetStatus().MalformedPayloads >= 1, ObservationTimeout));
        Assert.True(await WaitUntilAsync(() => connector.GetStatus().UnsupportedSchemas >= 1, ObservationTimeout));
        Assert.False(mirror.TryGetSample("robot-1.speed", out _));
        Assert.Equal(MqttConnectorState.Connected, connector.State);

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Duplicate_deliveries_are_ignored_by_correlation_id()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        var payload = TelemetryPayload(7.0, correlationId: "corr-dup", sessionId: "sess-dup");
        await PublishAsync(broker, TelemetryTopic, payload);
        await PublishAsync(broker, TelemetryTopic, payload);

        Assert.True(await WaitUntilAsync(() => connector.GetStatus().DuplicatesIgnored >= 1, ObservationTimeout),
            "the duplicate delivery was not detected");
        Assert.Equal(1, connector.GetStatus().UpdatesAccepted);

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Stale_timestamp_is_rejected_and_does_not_overwrite_the_newer_value()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(5.0, DateTimeOffset.UtcNow.ToString("O")));
        Assert.True(await WaitUntilAsync(() => HasValue(mirror, "robot-1.speed", 5.0), ObservationTimeout));

        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(1.0, DateTimeOffset.UtcNow.AddMinutes(-5).ToString("O")));
        Assert.True(await WaitUntilAsync(() => connector.GetStatus().StaleRejected >= 1, ObservationTimeout),
            "the stale timestamp was not rejected");

        Assert.True(HasValue(mirror, "robot-1.speed", 5.0), "a stale update overwrote the newer value");

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Rejects_non_allow_listed_commands_and_delivers_allow_listed_commands()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker, allowWrites: true);
        options.CommandAllowList = [CommandTopic];
        await using var connector = CreateConnector(options, mirror);

        var (subscriber, received) = await StartSubscriberAsync(broker, CommandTopic);
        try
        {
            await connector.StartAsync();
            Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
                $"connector did not connect: state={connector.State} lastError={connector.LastError}");

            var rejected = await connector.PublishCommandAsync(
                "fabrik3d/v1/cells/demo/equipment/robot-1/command/stop", "{}", CancellationToken.None);
            Assert.False(rejected.Accepted);
            Assert.Equal("not-allow-listed", rejected.RejectionReason);

            var retainedRejected = await connector.PublishCommandAsync(CommandTopic, "{}", retain: true, CancellationToken.None);
            Assert.False(retainedRejected.Accepted);
            Assert.Equal("retained-command-not-allowed", retainedRejected.RejectionReason);

            var accepted = await connector.PublishCommandAsync(CommandTopic, "{\"action\":\"start\"}", CancellationToken.None);
            Assert.True(accepted.Accepted, accepted.RejectionReason);

            var delivered = await received.Task.WaitAsync(ObservationTimeout);
            Assert.Equal("{\"action\":\"start\"}", delivered);
            Assert.Equal(1, connector.GetStatus().WritesAccepted);
            Assert.Equal(2, connector.GetStatus().WritesRejected);
        }
        finally
        {
            if (subscriber.IsConnected)
            {
                await subscriber.DisconnectAsync(MqttClientDisconnectOptionsReason.NormalDisconnection, cancellationToken: CancellationToken.None);
            }

            subscriber.Dispose();
            await connector.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task Last_will_is_armed_and_becomes_visible_on_an_abnormal_disconnect()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var willTopic = "fabrik3d/v1/cells/demo/equipment/robot-1/status";
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        options.WillTopic = willTopic;
        options.WillPayload = "{\"state\":\"offline\"}";
        options.WillRetain = false;
        await using var connector = CreateConnector(options, mirror);

        var (subscriber, received) = await StartSubscriberAsync(broker, willTopic);
        try
        {
            await connector.StartAsync();
            Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
                $"connector did not connect: state={connector.State} lastError={connector.LastError}");

            var clientField = typeof(MqttConnector).GetField("_client", BindingFlags.NonPublic | BindingFlags.Instance);
            var client = Assert.IsAssignableFrom<IMqttClient>(clientField!.GetValue(connector));

            await client.DisconnectAsync(
                new MqttClientDisconnectOptionsBuilder()
                    .WithReason(MqttClientDisconnectOptionsReason.DisconnectWithWillMessage)
                    .Build(),
                CancellationToken.None);

            var will = await received.Task.WaitAsync(ObservationTimeout);
            Assert.Equal("{\"state\":\"offline\"}", will);
        }
        finally
        {
            if (subscriber.IsConnected)
            {
                await subscriber.DisconnectAsync(MqttClientDisconnectOptionsReason.NormalDisconnection, cancellationToken: CancellationToken.None);
            }

            subscriber.Dispose();
            await connector.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task Reconnects_after_a_broker_restart_and_resumes_delivery()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");
        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(1.0));
        Assert.True(await WaitUntilAsync(() => HasValue(mirror, "robot-1.speed", 1.0), ObservationTimeout));

        // Reconnect latency is measured from the outage until the connector is connected again with
        // its subscriptions re-established. Outage detection depends on the MQTT keepalive, so the
        // test asserts the end state (reconnected + resubscribed + delivering) rather than a narrow
        // intermediate "noticed the outage" window.
        var reconnectWatch = Stopwatch.StartNew();
        await broker.RestartAsync();
        Assert.True(await WaitUntilAsync(
                () => connector.State == MqttConnectorState.Connected &&
                      connector.ReconnectCount >= 1 &&
                      connector.SubscriptionCount >= 1,
                ConnectTimeout),
            $"connector did not reconnect: state={connector.State} reconnects={connector.ReconnectCount} " +
            $"subscriptions={connector.SubscriptionCount} lastError={connector.LastError}");
        reconnectWatch.Stop();
        _output.WriteLine(
            $"Reconnect latency after broker restart: {reconnectWatch.ElapsedMilliseconds} ms " +
            $"(reconnect #{connector.ReconnectCount}, bounded backoff {options.ReconnectDelaySeconds}-{options.MaxReconnectDelaySeconds}s).");

        await PublishAsync(broker, TelemetryTopic, TelemetryPayload(8.0));
        Assert.True(await WaitUntilAsync(() => HasValue(mirror, "robot-1.speed", 8.0), ObservationTimeout),
            "value delivery did not resume after reconnection");

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Graceful_shutdown_disconnects_cleanly_and_leaves_the_broker_alive()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, new SignalMirrorStore());

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        await connector.StopAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(20));

        Assert.Equal(MqttConnectorState.Disabled, connector.State);
        Assert.Equal(0, connector.SubscriptionCount);

        // The broker must remain usable: a fresh client can still connect after our clean disconnect.
        var probe = new MqttFactory().CreateMqttClient();
        await probe.ConnectAsync(RawClientOptions(broker, "probe-" + Guid.NewGuid().ToString("N")[..8]), CancellationToken.None);
        Assert.True(probe.IsConnected);
        await probe.DisconnectAsync(MqttClientDisconnectOptionsReason.NormalDisconnection, cancellationToken: CancellationToken.None);
        probe.Dispose();
    }

    [Fact]
    public async Task Sustains_telemetry_delivery_and_records_throughput()
    {
        await using var broker = await MosquittoContainerFixture.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = ConnectorOptions(broker);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == MqttConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        const int updates = 100;
        var publisher = new MqttFactory().CreateMqttClient();
        await publisher.ConnectAsync(RawClientOptions(broker, "burst-" + Guid.NewGuid().ToString("N")[..8]), CancellationToken.None);

        var stopwatch = Stopwatch.StartNew();
        try
        {
            for (var index = 0; index < updates; index++)
            {
                await publisher.PublishAsync(
                    new MqttApplicationMessageBuilder()
                        .WithTopic(TelemetryTopic)
                        .WithPayload(TelemetryPayload(index))
                        .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                        .Build(),
                    CancellationToken.None);
            }
        }
        finally
        {
            if (publisher.IsConnected)
            {
                await publisher.DisconnectAsync(MqttClientDisconnectOptionsReason.NormalDisconnection, cancellationToken: CancellationToken.None);
            }

            publisher.Dispose();
        }

        Assert.True(await WaitUntilAsync(
                () => mirror.TryGetSample("robot-1.speed", out var sample) &&
                      sample!.Value is not null && Convert.ToDouble(sample.Value) >= 50d,
                ObservationTimeout),
            "the connector did not keep up with the telemetry burst");
        stopwatch.Stop();

        var status = connector.GetStatus();
        var perSecond = status.UpdatesAccepted / Math.Max(stopwatch.Elapsed.TotalSeconds, 0.001);
        _output.WriteLine(
            $"{updates} telemetry messages published in {stopwatch.ElapsedMilliseconds} ms; " +
            $"received={status.MessagesReceived}, accepted={status.UpdatesAccepted}, rejected={status.UpdatesRejected} " +
            $"({perSecond:F0} accepted/s).");

        Assert.True(status.UpdatesAccepted >= 20, $"expected sustained delivery, got {status.UpdatesAccepted}");
        Assert.Equal(0, status.UpdatesRejected);

        await connector.StopAsync(CancellationToken.None);
    }
}
