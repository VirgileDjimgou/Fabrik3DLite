using System.Text;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Signals;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Formatter;
using MQTTnet.Protocol;

namespace Fabrik3D.Infrastructure.Mqtt;

/// <summary>Lifecycle health of the MQTT connector.</summary>
public enum MqttConnectorState
{
    Disabled,
    Connecting,
    Connected,
    Degraded,
    Error,
}

/// <summary>Outcome of a connector publish attempt.</summary>
public sealed record MqttCommandResult(bool Accepted, string? RejectionReason);

/// <summary>Point-in-time connector health and diagnostics.</summary>
public sealed record MqttConnectorStatus(
    MqttConnectorState State,
    string? LastError,
    string? Broker,
    int ReconnectCount,
    int SubscriptionCount,
    long MessagesReceived,
    long UpdatesAccepted,
    long UpdatesRejected,
    long MalformedPayloads,
    long UnsupportedSchemas,
    long InvalidPayloads,
    long DuplicatesIgnored,
    long StaleRejected,
    long RetainedHistorical,
    long WriteAttempts,
    long WritesAccepted,
    long WritesRejected);

/// <summary>
/// Real, disabled-by-default MQTT client transport built on MQTTnet. It owns the client lifecycle,
/// bounded-backoff reconnection, declared telemetry/command subscriptions, an explicit QoS and
/// retained-message policy, session/Last Will semantics, versioned payload validation and
/// fail-closed publishing. Broker topics never leak into the domain: telemetry is translated into
/// protocol-independent <see cref="SignalMirrorStore"/> samples with explicit source and quality.
/// MQTT is an integration boundary only; it never carries application orchestration.
/// </summary>
public sealed class MqttConnector : IAsyncDisposable
{
    private readonly MqttOptions _options;
    private readonly SignalMirrorStore _mirror;
    private readonly ILogger<MqttConnector> _log;

    private readonly object _duplicateGate = new();
    private readonly HashSet<string> _duplicateSet = new(StringComparer.Ordinal);
    private readonly Queue<string> _duplicateOrder = new();

    private CancellationTokenSource? _cts;
    private Task? _loop;
    private IMqttClient? _client;
    private volatile TaskCompletionSource<bool>? _disconnectSignal;
    private volatile string? _pendingDisconnectError;

    private volatile MqttConnectorState _state = MqttConnectorState.Disabled;
    private volatile string? _lastError;
    private int _reconnectCount;
    private int _subscriptionCount;
    private long _messagesReceived;
    private long _updatesAccepted;
    private long _updatesRejected;
    private long _malformedPayloads;
    private long _unsupportedSchemas;
    private long _invalidPayloads;
    private long _duplicatesIgnored;
    private long _staleRejected;
    private long _retainedHistorical;
    private long _writeAttempts;
    private long _writesAccepted;
    private long _writesRejected;

    public MqttConnector(IOptions<MqttOptions> options, SignalMirrorStore mirror, ILogger<MqttConnector> log)
    {
        _options = options.Value;
        _mirror = mirror;
        _log = log;
    }

    /// <summary>Current health state.</summary>
    public MqttConnectorState State => _state;

    /// <summary>Backward-compatible health label (equals <see cref="State"/>).</summary>
    public string Health => _state.ToString();

    public string? LastError => _lastError;
    public int ReconnectCount => Volatile.Read(ref _reconnectCount);
    public int SubscriptionCount => Volatile.Read(ref _subscriptionCount);

    public bool IsWriteAllowed(string topic) => MqttMapping.CanPublishCommand(_options, topic);

    public MqttConnectorStatus GetStatus() => new(
        _state,
        _lastError,
        _options.Enabled ? _options.Broker : null,
        ReconnectCount,
        SubscriptionCount,
        Interlocked.Read(ref _messagesReceived),
        Interlocked.Read(ref _updatesAccepted),
        Interlocked.Read(ref _updatesRejected),
        Interlocked.Read(ref _malformedPayloads),
        Interlocked.Read(ref _unsupportedSchemas),
        Interlocked.Read(ref _invalidPayloads),
        Interlocked.Read(ref _duplicatesIgnored),
        Interlocked.Read(ref _staleRejected),
        Interlocked.Read(ref _retainedHistorical),
        Interlocked.Read(ref _writeAttempts),
        Interlocked.Read(ref _writesAccepted),
        Interlocked.Read(ref _writesRejected));

    /// <summary>
    /// Starts the connector. Returns immediately for the disabled default (inert, warning-free) and
    /// otherwise runs connection work on a background task so the API event loop is never blocked.
    /// </summary>
    public Task StartAsync() => StartAsync(CancellationToken.None);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            _state = MqttConnectorState.Disabled;
            return Task.CompletedTask;
        }

        if (_cts is not null)
        {
            return Task.CompletedTask;
        }

        var errors = MqttOptionsValidator.Validate(_options);
        if (errors.Count > 0)
        {
            _state = MqttConnectorState.Error;
            _lastError = string.Join("; ", errors);
            _log.LogError("MQTT connector configuration is invalid: {Errors}", _lastError);
            return Task.CompletedTask;
        }

        if (_options.AllowUntrustedCertificates)
        {
            _log.LogWarning(
                "MQTT AllowUntrustedCertificates is enabled. This is a development-only setting and must not be used in production.");
        }

        if (_options.AllowAnonymousBroker)
        {
            _log.LogInformation("MQTT connector is configured for an anonymous development broker (AllowAnonymousBroker=true).");
        }

        RegisterConfiguredDefinitions();

        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _loop = Task.Run(() => RunAsync(_cts.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        var cts = _cts;
        var loop = _loop;
        if (cts is null)
        {
            _state = MqttConnectorState.Disabled;
            return;
        }

        await cts.CancelAsync().ConfigureAwait(false);
        if (loop is not null)
        {
            try
            {
                await loop.WaitAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // Shutdown requested while waiting; the loop observes the same cancellation.
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "MQTT connector loop ended with an exception during shutdown.");
            }
        }

        cts.Dispose();
        _cts = null;
        _loop = null;
        _state = MqttConnectorState.Disabled;
        Volatile.Write(ref _subscriptionCount, 0);
    }

    /// <summary>
    /// Publishes a command. Fails closed unless the connector is enabled, writes are enabled, the
    /// topic is exactly allow-listed and retained commands are explicitly permitted.
    /// </summary>
    public Task<MqttCommandResult> PublishCommandAsync(string topic, string payload, CancellationToken cancellationToken)
        => PublishCommandAsync(topic, payload, retain: false, cancellationToken);

    public async Task<MqttCommandResult> PublishCommandAsync(
        string topic, string payload, bool retain, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(topic);
        Interlocked.Increment(ref _writeAttempts);

        if (!_options.Enabled)
        {
            return Reject("connector-disabled");
        }

        if (!_options.AllowWrites)
        {
            return Reject("writes-disabled");
        }

        if (!_options.CommandAllowList.Contains(topic, StringComparer.Ordinal))
        {
            return Reject("not-allow-listed");
        }

        if (retain && !_options.AllowRetainedCommands)
        {
            return Reject("retained-command-not-allowed");
        }

        if (!IsWithinPayloadBound(payload))
        {
            return Reject("payload-too-large");
        }

        var client = _client;
        if (client is null || !client.IsConnected)
        {
            return Reject("not-connected");
        }

        try
        {
            var message = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(payload)
                .WithQualityOfServiceLevel(ToQualityOfService(_options.QoS))
                .WithRetainFlag(retain)
                .Build();

            await client.PublishAsync(message, cancellationToken).ConfigureAwait(false);
            Interlocked.Increment(ref _writesAccepted);
            return new MqttCommandResult(true, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Reject($"publish-failed:{ex.GetType().Name}");
        }
    }

    /// <summary>Publishes an outbound telemetry payload using the configured QoS. Fails closed when writes are disabled.</summary>
    public async Task<MqttCommandResult> PublishTelemetryAsync(
        string topic, string payload, bool retain, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(topic);
        Interlocked.Increment(ref _writeAttempts);

        if (!_options.Enabled)
        {
            return Reject("connector-disabled");
        }

        if (!_options.AllowWrites)
        {
            return Reject("writes-disabled");
        }

        if (!IsWithinPayloadBound(payload))
        {
            return Reject("payload-too-large");
        }

        var client = _client;
        if (client is null || !client.IsConnected)
        {
            return Reject("not-connected");
        }

        try
        {
            var message = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(payload)
                .WithQualityOfServiceLevel(ToQualityOfService(_options.QoS))
                .WithRetainFlag(retain)
                .Build();

            await client.PublishAsync(message, cancellationToken).ConfigureAwait(false);
            Interlocked.Increment(ref _writesAccepted);
            return new MqttCommandResult(true, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Reject($"publish-failed:{ex.GetType().Name}");
        }
    }

    private MqttCommandResult Reject(string reason)
    {
        Interlocked.Increment(ref _writesRejected);
        _log.LogDebug("MQTT publish rejected: {Reason}", reason);
        return new MqttCommandResult(false, reason);
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var everConnected = false;

        while (!cancellationToken.IsCancellationRequested)
        {
            IMqttClient? client = null;
            try
            {
                _state = MqttConnectorState.Connecting;
                _pendingDisconnectError = null;
                client = new MqttFactory().CreateMqttClient();
                WireClient(client);

                var signal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                _disconnectSignal = signal;

                using var registration = cancellationToken.Register(() => signal.TrySetResult(true));

                var result = await client.ConnectAsync(BuildClientOptions(), cancellationToken).ConfigureAwait(false);
                if (result.ResultCode != MqttClientConnectResultCode.Success)
                {
                    throw new InvalidOperationException($"broker refused the connection: {result.ResultCode}");
                }

                _client = client;
                everConnected = true;
                _lastError = null;

                // Subscriptions are established before the connector advertises Connected, so an
                // observer that publishes as soon as it sees Connected cannot lose the message to a
                // not-yet-active subscription (notably right after a reconnect).
                await SubscribeAsync(client, cancellationToken).ConfigureAwait(false);
                _state = MqttConnectorState.Connected;

                _log.LogInformation("MQTT connector connected to {Broker} (client {ClientId}, session present {SessionPresent}).",
                    _options.Broker, _options.ClientId, result.IsSessionPresent);

                await signal.Task.ConfigureAwait(false);

                if (_pendingDisconnectError is not null)
                {
                    _lastError = _pendingDisconnectError;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _lastError = $"{ex.GetType().Name}: {ex.Message}";
                _log.LogWarning(ex, "MQTT connector attempt to {Broker} failed.", _options.Broker);
            }
            finally
            {
                await DisposeClientAsync(client).ConfigureAwait(false);
                _client = null;
                _disconnectSignal = null;
                Volatile.Write(ref _subscriptionCount, 0);
            }

            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            Interlocked.Increment(ref _reconnectCount);
            _state = everConnected ? MqttConnectorState.Degraded : MqttConnectorState.Error;

            var delay = ComputeBackoff(ReconnectCount);
            _log.LogInformation("MQTT connector retrying in {DelaySeconds:F1}s (reconnect #{ReconnectCount}).",
                delay.TotalSeconds, ReconnectCount);

            try
            {
                await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _state = MqttConnectorState.Disabled;
    }

    private void WireClient(IMqttClient client)
    {
        client.DisconnectedAsync += args =>
        {
            if (args.Reason != MqttClientDisconnectReason.NormalDisconnection)
            {
                _pendingDisconnectError = args.Exception is not null
                    ? $"{args.Exception.GetType().Name}: {args.Exception.Message}"
                    : $"disconnected:{args.Reason}";
            }

            _disconnectSignal?.TrySetResult(true);
            return Task.CompletedTask;
        };

        client.ApplicationMessageReceivedAsync += OnMessageReceivedAsync;
    }

    private Task OnMessageReceivedAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        Interlocked.Increment(ref _messagesReceived);

        try
        {
            var message = args.ApplicationMessage;
            var topic = message.Topic ?? string.Empty;
            var segment = message.PayloadSegment;
            var payload = segment.Count > 0 && segment.Array is not null
                ? Encoding.UTF8.GetString(segment.Array, segment.Offset, segment.Count)
                : string.Empty;

            // Command topics are observed only; they are never used for application orchestration.
            if (MqttMapping.IsCommandTopic(topic, _options))
            {
                _log.LogDebug("MQTT command-topic message observed on {Topic} (ignored for orchestration).", topic);
                return Task.CompletedTask;
            }

            if (!MqttMapping.TryParseTelemetry(
                    topic, payload, message.Retain, _options, DateTimeOffset.UtcNow, out var sample, out var reason))
            {
                CountRejection(reason);
                _log.LogDebug("MQTT payload on {Topic} rejected: {Reason}.", topic, reason);
                return Task.CompletedTask;
            }

            var key = sample!.CorrelationId
                ?? $"{sample.SessionId}|{sample.Timestamp:O}|{sample.EquipmentId}";
            if (IsDuplicate(key))
            {
                Interlocked.Increment(ref _duplicatesIgnored);
                _log.LogDebug("MQTT duplicate delivery ignored for {EquipmentId} ({Key}).", sample.EquipmentId, key);
                return Task.CompletedTask;
            }

            ApplySample(sample);
        }
        catch (Exception ex)
        {
            Interlocked.Increment(ref _updatesRejected);
            _log.LogDebug(ex, "MQTT message could not be processed.");
        }

        return Task.CompletedTask;
    }

    private void CountRejection(string? reason)
    {
        switch (reason)
        {
            case "malformed-json":
            case "empty-payload":
                Interlocked.Increment(ref _malformedPayloads);
                break;
            case "unsupported-schema":
                Interlocked.Increment(ref _unsupportedSchemas);
                break;
            default:
                Interlocked.Increment(ref _invalidPayloads);
                break;
        }
    }

    private void ApplySample(MqttTelemetrySample sample)
    {
        foreach (var (measurement, element) in sample.Measurements)
        {
            if (string.IsNullOrWhiteSpace(measurement))
            {
                continue;
            }

            var mapping = MqttMapping.ResolveMapping(_options, sample.EquipmentId, measurement);
            var signalId = string.IsNullOrWhiteSpace(mapping?.SignalId)
                ? MqttMapping.BuildSignalId(sample.EquipmentId, measurement)
                : mapping!.SignalId;
            var dataType = mapping is not null && SignalVocabulary.TryParseDataType(mapping.DataType, out var declared)
                ? declared
                : MqttMapping.InferDataType(element);

            EnsureDefinition(signalId, sample.EquipmentId, mapping, dataType);

            var value = MqttMapping.ConvertMeasurement(element);
            var update = new IndustrialSignalUpdate(
                signalId,
                value,
                sample.Quality,
                sample.Source,
                SignalOrigin.Controller,
                sample.Timestamp);

            var result = _mirror.Apply(update);
            if (result.Accepted)
            {
                Interlocked.Increment(ref _updatesAccepted);
            }
            else
            {
                Interlocked.Increment(ref _updatesRejected);
                if (string.Equals(result.RejectionReason, "stale-timestamp", StringComparison.Ordinal))
                {
                    Interlocked.Increment(ref _staleRejected);
                }

                _log.LogDebug(
                    "MQTT update for {SignalId} rejected by mirror: {Reason} (quality {Quality}, value type {ValueType}).",
                    signalId, result.RejectionReason, update.Quality, update.Value?.GetType().Name ?? "null");
            }
        }

        if (sample.Retained && sample.Historical)
        {
            Interlocked.Increment(ref _retainedHistorical);
        }
    }

    private void EnsureDefinition(string signalId, string equipmentId, MqttSignalMapping? mapping, SignalDataType dataType)
    {
        if (_mirror.Definitions().Any(definition => string.Equals(definition.SignalId, signalId, StringComparison.Ordinal)))
        {
            return;
        }

        var definition = MqttMapping.ToDefinition(mapping, equipmentId, signalId, dataType, _options.StaleAfterMilliseconds);
        if (!_mirror.TryRegister(definition, out var error) && !string.Equals(error, "duplicate-signal", StringComparison.Ordinal))
        {
            _log.LogDebug("MQTT mirror definition for {SignalId} not registered: {Error}.", signalId, error);
        }
    }

    private async Task SubscribeAsync(IMqttClient client, CancellationToken cancellationToken)
    {
        var subscriptions = 0;
        var quality = ToQualityOfService(_options.QoS);

        foreach (var filter in _options.TelemetryTopics)
        {
            if (string.IsNullOrWhiteSpace(filter))
            {
                continue;
            }

            var options = new MqttClientSubscribeOptionsBuilder()
                .WithTopicFilter(builder => builder
                    .WithTopic(filter)
                    .WithQualityOfServiceLevel(quality)
                    .WithRetainHandling(MqttRetainHandling.SendAtSubscribe))
                .Build();

            var result = await client.SubscribeAsync(options, cancellationToken).ConfigureAwait(false);
            subscriptions += result.Items.Count;
        }

        foreach (var filter in _options.CommandTopics)
        {
            if (string.IsNullOrWhiteSpace(filter))
            {
                continue;
            }

            var options = new MqttClientSubscribeOptionsBuilder()
                .WithTopicFilter(builder => builder
                    .WithTopic(filter)
                    .WithQualityOfServiceLevel(quality)
                    .WithNoLocal(true)
                    .WithRetainHandling(MqttRetainHandling.DoNotSendOnSubscribe))
                .Build();

            await client.SubscribeAsync(options, cancellationToken).ConfigureAwait(false);
            subscriptions++;
        }

        Volatile.Write(ref _subscriptionCount, subscriptions);
        _log.LogInformation("MQTT connector subscribed to {Count} topic filter(s).", subscriptions);
    }

    private MqttClientOptions BuildClientOptions()
    {
        var uri = new Uri(_options.Broker);
        var protocol = ParseProtocolVersion(_options.ProtocolVersion);
        var useTls = _options.UseTls || uri.Scheme == "mqtts" || uri.Scheme == "ssl";
        var port = uri.Port > 0 ? uri.Port : useTls ? 8883 : 1883;

        var builder = new MqttClientOptionsBuilder()
            .WithClientId(_options.ClientId)
            .WithProtocolVersion(protocol)
            .WithCleanSession(_options.CleanSession)
            .WithKeepAlivePeriod(TimeSpan.FromSeconds(Math.Max(1, _options.KeepAliveSeconds)))
            .WithTimeout(TimeSpan.FromSeconds(Math.Max(1, _options.ConnectTimeoutSeconds)))
            .WithTcpServer(uri.Host, port);

        if (protocol == MqttProtocolVersion.V500)
        {
            builder.WithSessionExpiryInterval((uint)Math.Max(0, _options.SessionExpirySeconds));
        }

        if (!string.IsNullOrEmpty(_options.UserName))
        {
            builder.WithCredentials(_options.UserName, _options.Password ?? string.Empty);
        }

        if (!string.IsNullOrWhiteSpace(_options.WillTopic))
        {
            builder
                .WithWillTopic(_options.WillTopic)
                .WithWillPayload(_options.WillPayload)
                .WithWillRetain(_options.WillRetain)
                .WithWillQualityOfServiceLevel(ToQualityOfService(_options.QoS));
        }

        if (useTls)
        {
            builder.WithTlsOptions(options =>
            {
                options.UseTls();
                options.WithAllowUntrustedCertificates(_options.AllowUntrustedCertificates);
                options.WithIgnoreCertificateChainErrors(_options.AllowUntrustedCertificates);
                options.WithIgnoreCertificateRevocationErrors(_options.AllowUntrustedCertificates);
            });
        }

        return builder.Build();
    }

    private void RegisterConfiguredDefinitions()
    {
        foreach (var mapping in _options.SignalMap)
        {
            if (string.IsNullOrWhiteSpace(mapping.SignalId))
            {
                continue;
            }

            var equipmentId = mapping.EquipmentId ?? EquipmentFromSignalId(mapping.SignalId);
            var dataType = SignalVocabulary.TryParseDataType(mapping.DataType, out var parsed)
                ? parsed
                : SignalDataType.Float;

            EnsureDefinition(mapping.SignalId, equipmentId, mapping, dataType);
        }
    }

    private bool IsDuplicate(string key)
    {
        lock (_duplicateGate)
        {
            if (_duplicateSet.Contains(key))
            {
                return true;
            }

            _duplicateSet.Add(key);
            _duplicateOrder.Enqueue(key);

            var window = Math.Max(16, _options.DuplicateWindowSize);
            while (_duplicateOrder.Count > window)
            {
                _duplicateSet.Remove(_duplicateOrder.Dequeue());
            }

            return false;
        }
    }

    private bool IsWithinPayloadBound(string payload)
        => _options.MaxPayloadBytes <= 0 ||
           Encoding.UTF8.GetByteCount(payload ?? string.Empty) <= _options.MaxPayloadBytes;

    private TimeSpan ComputeBackoff(int attempt)
    {
        var baseSeconds = Math.Max(0, _options.ReconnectDelaySeconds);
        var maxSeconds = Math.Max(baseSeconds, _options.MaxReconnectDelaySeconds);
        if (baseSeconds == 0)
        {
            return TimeSpan.Zero;
        }

        var exponent = Math.Min(attempt - 1, 10);
        var seconds = Math.Min(maxSeconds, baseSeconds * Math.Pow(2, exponent));
        return TimeSpan.FromSeconds(seconds);
    }

    private static async Task DisposeClientAsync(IMqttClient? client)
    {
        if (client is null)
        {
            return;
        }

        try
        {
            if (client.IsConnected)
            {
                await client.DisconnectAsync(
                    new MqttClientDisconnectOptionsBuilder()
                        .WithReason(MqttClientDisconnectOptionsReason.NormalDisconnection)
                        .Build(),
                    CancellationToken.None).ConfigureAwait(false);
            }
        }
        catch (Exception)
        {
            // Best-effort disconnect; the client is disposed regardless.
        }

        client.Dispose();
    }

    private static MqttQualityOfServiceLevel ToQualityOfService(int qos) => qos switch
    {
        0 => MqttQualityOfServiceLevel.AtMostOnce,
        2 => MqttQualityOfServiceLevel.ExactlyOnce,
        _ => MqttQualityOfServiceLevel.AtLeastOnce,
    };

    private static MqttProtocolVersion ParseProtocolVersion(string? value)
        => string.Equals(value?.Trim(), "3.1.1", StringComparison.Ordinal)
            ? MqttProtocolVersion.V311
            : MqttProtocolVersion.V500;

    private static string EquipmentFromSignalId(string signalId)
    {
        var index = signalId.IndexOf('.', StringComparison.Ordinal);
        return index > 0 ? signalId[..index] : signalId;
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await StopAsync(CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "MQTT connector disposal failed.");
        }
    }
}
