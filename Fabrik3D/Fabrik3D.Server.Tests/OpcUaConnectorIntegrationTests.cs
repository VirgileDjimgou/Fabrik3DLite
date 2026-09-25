using System.Diagnostics;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.OpcUa.Fixture;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Opc.Ua;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Connector integration tests against the real, in-process OPC UA fixture
/// (<c>Fabrik3D.OpcUa.Fixture</c>): real TCP transport, secure channel, sessions, subscriptions and
/// monitored items. They prove connect, subscribe, quality/timestamp mapping, write policy,
/// invalid nodes, staleness, certificate trust and reconnection with no proprietary software.
/// </summary>
public class OpcUaConnectorIntegrationTests
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan ObservationTimeout = TimeSpan.FromSeconds(20);

    private readonly ITestOutputHelper _output;

    public OpcUaConnectorIntegrationTests(ITestOutputHelper output) => _output = output;

    private static OpcUaConnector CreateConnector(OpcUaOptions options, SignalMirrorStore mirror)
        => new(Options.Create(options), mirror, NullLogger<OpcUaConnector>.Instance);

    private static string TempTrustStore()
        => Path.Combine(Path.GetTempPath(), "fabrik3d-opcua-tests", Guid.NewGuid().ToString("N"));

    private static OpcUaOptions BaseOptions(
        string endpoint,
        IReadOnlyList<OpcUaNodeMapEntry> nodeMap,
        string securityPolicy = "None",
        int staleAfterMilliseconds = 30_000,
        bool autoAccept = false)
        => new()
        {
            Enabled = true,
            Endpoint = endpoint,
            SecurityPolicy = securityPolicy,
            CertificateTrustStore = TempTrustStore(),
            AutoAcceptUntrustedCertificates = autoAccept,
            ReconnectDelaySeconds = 1,
            MaxReconnectDelaySeconds = 2,
            SamplingIntervalMilliseconds = 100,
            PublishingIntervalMilliseconds = 200,
            OperationTimeoutMilliseconds = 10_000,
            SessionTimeoutMilliseconds = 30_000,
            StaleAfterMilliseconds = staleAfterMilliseconds,
            NodeMap = nodeMap.ToList(),
        };

    private static OpcUaNodeMapEntry Entry(
        OpcUaTestServer fixture,
        string identifier,
        string signalId,
        bool writable = false,
        string dataType = "float")
    {
        var separator = signalId.IndexOf('.', StringComparison.Ordinal);
        return new OpcUaNodeMapEntry
        {
            SignalId = signalId,
            NodeId = fixture.NodeIdText(identifier),
            EquipmentId = signalId[..separator],
            Name = signalId[(separator + 1)..],
            Writable = writable,
            Direction = "input-to-controller",
            DataType = dataType,
        };
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

    private static bool SampleWithValue(SignalMirrorStore mirror, string signalId, object? value)
        => mirror.TryGetSample(signalId, out var sample) && Equals(sample!.Value, value);

    [Fact]
    public async Task Disabled_connector_is_inert_and_does_not_create_a_trust_store()
    {
        var trustStore = TempTrustStore();
        var options = new OpcUaOptions { Enabled = false, CertificateTrustStore = trustStore };
        await using var connector = CreateConnector(options, new SignalMirrorStore());

        await connector.StartAsync();

        Assert.Equal(OpcUaConnectorState.Disabled, connector.State);
        Assert.False(Directory.Exists(trustStore));
        await connector.StopAsync(CancellationToken.None);
        Assert.Equal(OpcUaConnectorState.Disabled, connector.State);
    }

    [Fact]
    public async Task Connects_subscribes_and_maps_value_quality_and_timestamp()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = BaseOptions(fixture.EndpointUrl,
        [
            Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed"),
            Entry(fixture, "Fabrik3D/Robot/ExecutionState", "robot-1.ExecutionState", dataType: "string"),
        ]);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");
        Assert.True(await WaitUntilAsync(() => connector.MonitoredItemCount == 2, ObservationTimeout), "monitored items were not created");

        fixture.SetValue("Fabrik3D/Robot/Speed", 2.5d);

        Assert.True(await WaitUntilAsync(() => SampleWithValue(mirror, "robot-1.Speed", 2.5d), ObservationTimeout),
            "the subscription did not deliver the changed value to the mirror");
        Assert.True(mirror.TryGetSample("robot-1.Speed", out var sample));
        Assert.Equal(SignalQuality.Good, sample!.Quality);
        Assert.Equal(SignalSource.Observed, sample.Source);
        Assert.Equal(SignalOrigin.Controller, sample.Origin);
        Assert.True((DateTimeOffset.UtcNow - sample.Timestamp).Duration() < TimeSpan.FromMinutes(1),
            $"sample timestamp {sample.Timestamp} is not close to now");

        // OPC UA sends a bad status without a value; the connector must keep the last known value
        // and store the degraded quality instead of rejecting or coercing it.
        fixture.SetValue("Fabrik3D/Robot/Speed", 3.0d, StatusCodes.Bad);
        Assert.True(await WaitUntilAsync(
            () => mirror.TryGetSample("robot-1.Speed", out var bad) &&
                  bad!.Quality == SignalQuality.Bad && Equals(bad.Value, 2.5d),
            ObservationTimeout),
            "a bad status did not preserve the last known value with degraded quality");

        fixture.SetValue("Fabrik3D/Robot/Speed", 3.0d, StatusCodes.Good);
        Assert.True(await WaitUntilAsync(
            () => mirror.TryGetSample("robot-1.Speed", out var recovered) &&
                  recovered!.Quality == SignalQuality.Good && Equals(recovered.Value, 3.0d),
            ObservationTimeout),
            "the recovery to good quality was not delivered");

        fixture.SetValue("Fabrik3D/Robot/Speed", 3.0d, StatusCodes.Bad);
        Assert.True(await WaitUntilAsync(
            () => mirror.TryGetSample("robot-1.Speed", out var statusOnly) &&
                  statusOnly!.Quality == SignalQuality.Bad && Equals(statusOnly.Value, 3.0d),
            ObservationTimeout),
            "a status-only bad update did not preserve the last known value with degraded quality");

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Subscription_samples_become_stale_by_read_time_without_mutation()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = BaseOptions(fixture.EndpointUrl,
            [Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed")], staleAfterMilliseconds: 500);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        fixture.SetValue("Fabrik3D/Robot/Speed", 4.0d);
        Assert.True(await WaitUntilAsync(() => SampleWithValue(mirror, "robot-1.Speed", 4.0d), ObservationTimeout));
        Assert.True(mirror.TryGetSample("robot-1.Speed", out var fresh));
        Assert.Equal(SignalQuality.Good, fresh!.Quality);

        Assert.True(mirror.TryGetSample("robot-1.Speed", fresh.Timestamp.AddMilliseconds(501), out var stale));
        Assert.Equal(SignalQuality.Stale, stale!.Quality);
        Assert.Equal(SignalQuality.Good, fresh.Quality);
    }

    [Fact]
    public async Task Invalid_node_ids_produce_diagnostics_without_crashing_the_connector()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = BaseOptions(fixture.EndpointUrl,
        [
            Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed"),
            Entry(fixture, "Fabrik3D/Robot/DoesNotExist", "robot-1.Missing"),
        ]);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");
        Assert.True(await WaitUntilAsync(() => connector.MonitoredItemCount == 1, ObservationTimeout),
            $"expected only the valid node to be monitored, got {connector.MonitoredItemCount}");

        fixture.SetValue("Fabrik3D/Robot/Speed", 6.0d);
        Assert.True(await WaitUntilAsync(() => SampleWithValue(mirror, "robot-1.Speed", 6.0d), ObservationTimeout),
            "the connector stopped working after an invalid node id");
        Assert.Equal(OpcUaConnectorState.Connected, connector.State);
    }

    [Fact]
    public async Task Write_policy_rejects_prohibited_writes_and_the_fixture_observes_the_allow_listed_write()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var mirror = new SignalMirrorStore();
        var startNodeId = fixture.NodeIdText("Fabrik3D/Robot/Start");
        var options = BaseOptions(fixture.EndpointUrl,
        [
            Entry(fixture, "Fabrik3D/Robot/Start", "robot-1.Start", writable: true, dataType: "bool"),
            Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed", writable: false),
            Entry(fixture, "Fabrik3D/Robot/Counter", "robot-1.Counter", writable: true, dataType: "int"),
        ]);
        options.AllowWrites = true;
        options.WriteAllowList = [startNodeId];
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        var notWritable = await connector.WriteAsync("robot-1.Speed", 9.0d, CancellationToken.None);
        Assert.False(notWritable.Accepted);
        Assert.Equal("not-writable-signal", notWritable.RejectionReason);

        var notAllowListed = await connector.WriteAsync("robot-1.Counter", 5, CancellationToken.None);
        Assert.False(notAllowListed.Accepted);
        Assert.Equal("not-allow-listed", notAllowListed.RejectionReason);

        var accepted = await connector.WriteAsync("robot-1.Start", true, CancellationToken.None);
        Assert.True(accepted.Accepted, accepted.RejectionReason);

        Assert.True(await WaitUntilAsync(() => true.Equals(fixture.GetValue("Fabrik3D/Robot/Start")), ObservationTimeout),
            "the fixture never observed the allow-listed write");
        Assert.True(mirror.TryGetSample("robot-1.Start", out var sample));
        Assert.Equal(SignalSource.Commanded, sample!.Source);
        Assert.Equal(SignalQuality.Good, sample.Quality);

        var status = connector.GetStatus();
        Assert.Equal(3, status.WriteAttempts);
        Assert.Equal(1, status.WritesAccepted);
        Assert.Equal(2, status.WritesRejected);
    }

    [Fact]
    public async Task Secure_endpoint_refuses_an_untrusted_server_certificate()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var options = BaseOptions(fixture.EndpointUrl,
            [Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed")],
            securityPolicy: "Basic256Sha256",
            autoAccept: false);
        await using var connector = CreateConnector(options, new SignalMirrorStore());

        await connector.StartAsync();

        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Error, ConnectTimeout),
            $"expected a certificate/trust failure, state={connector.State} lastError={connector.LastError}");
        Assert.NotEqual(OpcUaConnectorState.Connected, connector.State);
        Assert.False(string.IsNullOrWhiteSpace(connector.LastError));
        _output.WriteLine($"Trust failure surfaced as: {connector.LastError}");
    }

    [Fact]
    public async Task Secure_endpoint_connects_when_development_trust_is_explicit()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var options = BaseOptions(fixture.EndpointUrl,
            [Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed")],
            securityPolicy: "Basic256Sha256",
            autoAccept: true);
        await using var connector = CreateConnector(options, new SignalMirrorStore());

        await connector.StartAsync();

        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"secure connection failed: state={connector.State} lastError={connector.LastError}");
    }

    [Fact]
    public async Task Reconnects_after_the_fixture_restarts_and_resumes_delivery()
    {
        var port = OpcUaTestServer.ReserveLoopbackPort();
        var fixture = await OpcUaTestServer.StartAsync(port: port);
        var mirror = new SignalMirrorStore();
        var options = BaseOptions(fixture.EndpointUrl, [Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed")]);
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");
        fixture.SetValue("Fabrik3D/Robot/Speed", 1.0d);
        Assert.True(await WaitUntilAsync(() => SampleWithValue(mirror, "robot-1.Speed", 1.0d), ObservationTimeout));

        await fixture.DisposeAsync();
        Assert.True(await WaitUntilAsync(() => connector.State != OpcUaConnectorState.Connected, ObservationTimeout),
            "the connector did not notice the fixture loss");

        await using var restarted = await OpcUaTestServer.StartAsync(port: port);
        Assert.True(await WaitUntilAsync(
            () => connector.State == OpcUaConnectorState.Connected && connector.ReconnectCount >= 1,
            ConnectTimeout),
            $"connector did not reconnect: state={connector.State} reconnects={connector.ReconnectCount} lastError={connector.LastError}");

        restarted.SetValue("Fabrik3D/Robot/Speed", 8.0d);
        Assert.True(await WaitUntilAsync(() => SampleWithValue(mirror, "robot-1.Speed", 8.0d), ObservationTimeout),
            "value delivery did not resume after reconnection");

        await connector.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Graceful_shutdown_closes_the_session_and_leaves_the_fixture_alive()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var options = BaseOptions(fixture.EndpointUrl, [Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed")]);
        await using var connector = CreateConnector(options, new SignalMirrorStore());

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        await connector.StopAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(15));

        Assert.Equal(OpcUaConnectorState.Disabled, connector.State);
        Assert.Equal(0, connector.MonitoredItemCount);
        fixture.SetValue("Fabrik3D/Robot/Speed", 5.0d);
        Assert.Equal(5.0d, fixture.GetValue("Fabrik3D/Robot/Speed"));
    }

    [Fact]
    public async Task Subscription_sustains_updates_and_records_throughput()
    {
        await using var fixture = await OpcUaTestServer.StartAsync();
        var mirror = new SignalMirrorStore();
        var options = BaseOptions(fixture.EndpointUrl, [Entry(fixture, "Fabrik3D/Robot/Speed", "robot-1.Speed")]);
        options.SamplingIntervalMilliseconds = 50;
        options.PublishingIntervalMilliseconds = 100;
        await using var connector = CreateConnector(options, mirror);

        await connector.StartAsync();
        Assert.True(await WaitUntilAsync(() => connector.State == OpcUaConnectorState.Connected, ConnectTimeout),
            $"connector did not connect: state={connector.State} lastError={connector.LastError}");

        const int updates = 100;
        var stopwatch = Stopwatch.StartNew();
        for (var index = 0; index < updates; index++)
        {
            fixture.SetValue("Fabrik3D/Robot/Speed", (double)index);
            await Task.Delay(10);
        }

        Assert.True(await WaitUntilAsync(
            () => mirror.TryGetSample("robot-1.Speed", out var sample) && Convert.ToDouble(sample!.Value) >= 50d,
            ObservationTimeout),
            "the subscription did not keep up with the update burst");
        stopwatch.Stop();

        var status = connector.GetStatus();
        var perSecond = status.NotificationsReceived / Math.Max(stopwatch.Elapsed.TotalSeconds, 0.001);
        _output.WriteLine(
            $"{updates} fixture updates in {stopwatch.ElapsedMilliseconds} ms; notifications={status.NotificationsReceived}, " +
            $"accepted={status.UpdatesAccepted}, rejected={status.UpdatesRejected} ({perSecond:F0} notifications/s).");

        Assert.True(status.NotificationsReceived >= 10,
            $"expected sustained notification delivery, got {status.NotificationsReceived}");
        Assert.True(status.UpdatesAccepted >= 10, $"expected accepted updates, got {status.UpdatesAccepted}");
    }
}
