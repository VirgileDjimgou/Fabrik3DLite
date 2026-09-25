using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Signals;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Opc.Ua;
using Opc.Ua.Client;
using Opc.Ua.Configuration;

namespace Fabrik3D.Infrastructure.OpcUa;

/// <summary>Lifecycle health of the OPC UA connector.</summary>
public enum OpcUaConnectorState
{
    Disabled,
    Connecting,
    Connected,
    Degraded,
    Error,
}

/// <summary>Outcome of a connector write attempt.</summary>
public sealed record OpcUaWriteResult(bool Accepted, string? RejectionReason);

/// <summary>Point-in-time connector health and diagnostics.</summary>
public sealed record OpcUaConnectorStatus(
    OpcUaConnectorState State,
    string? LastError,
    int ReconnectCount,
    int MonitoredItemCount,
    long NotificationsReceived,
    long UpdatesAccepted,
    long UpdatesRejected,
    long WriteAttempts,
    long WritesAccepted,
    long WritesRejected);

/// <summary>
/// Real, disabled-by-default OPC UA client transport. It owns a secure session, a subscription
/// with monitored items derived from an explicit node map, bounded-backoff reconnection, an
/// explicit write policy and diagnostics. Protocol node ids never leave this adapter: values are
/// translated into protocol-independent <see cref="SignalMirrorStore"/> samples.
/// Aligned with selected OPC UA concepts; it does not claim IEC 62541 certification.
/// </summary>
public sealed class OpcUaConnector : IAsyncDisposable
{
    private static readonly ITelemetryContext Telemetry =
        DefaultTelemetry.Create(builder => builder.SetMinimumLevel(LogLevel.Warning));

    private readonly OpcUaOptions _options;
    private readonly SignalMirrorStore _mirror;
    private readonly ILogger<OpcUaConnector> _log;
    private readonly Dictionary<string, OpcUaNodeMapEntry> _entriesBySignalId = new(StringComparer.Ordinal);
    private readonly Dictionary<string, OpcUaNodeMapEntry> _entriesByNodeId = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _sessionGate = new(1, 1);

    private ApplicationInstance? _application;
    private ApplicationConfiguration? _configuration;
    private ISession? _session;
    private Subscription? _subscription;
    private CancellationTokenSource? _cts;
    private Task? _loop;

    private volatile OpcUaConnectorState _state = OpcUaConnectorState.Disabled;
    private volatile string? _lastError;
    private int _reconnectCount;
    private int _monitoredItemCount;
    private long _notificationsReceived;
    private long _updatesAccepted;
    private long _updatesRejected;
    private long _writeAttempts;
    private long _writesAccepted;
    private long _writesRejected;

    public OpcUaConnector(IOptions<OpcUaOptions> options, SignalMirrorStore mirror, ILogger<OpcUaConnector> log)
    {
        _options = options.Value;
        _mirror = mirror;
        _log = log;

        foreach (var entry in _options.NodeMap)
        {
            if (!string.IsNullOrWhiteSpace(entry.SignalId))
            {
                _entriesBySignalId[entry.SignalId] = entry;
            }

            if (!string.IsNullOrWhiteSpace(entry.NodeId))
            {
                _entriesByNodeId[entry.NodeId] = entry;
            }
        }
    }

    /// <summary>Current health state.</summary>
    public OpcUaConnectorState State => _state;

    /// <summary>Backward-compatible health label (equals <see cref="State"/>).</summary>
    public string Health => _state.ToString();

    public string? LastError => _lastError;
    public int ReconnectCount => Volatile.Read(ref _reconnectCount);
    public int MonitoredItemCount => Volatile.Read(ref _monitoredItemCount);

    public bool IsWriteAllowed(string nodeId) => OpcUaMapping.CanWrite(_options, nodeId);

    public OpcUaConnectorStatus GetStatus() => new(
        _state,
        _lastError,
        ReconnectCount,
        MonitoredItemCount,
        Interlocked.Read(ref _notificationsReceived),
        Interlocked.Read(ref _updatesAccepted),
        Interlocked.Read(ref _updatesRejected),
        Interlocked.Read(ref _writeAttempts),
        Interlocked.Read(ref _writesAccepted),
        Interlocked.Read(ref _writesRejected));

    /// <summary>
    /// Starts the connector. Returns immediately for the disabled default (inert, warning-free)
    /// and otherwise runs connection work on a background task so the API event loop is never blocked.
    /// </summary>
    public Task StartAsync() => StartAsync(CancellationToken.None);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            _state = OpcUaConnectorState.Disabled;
            return Task.CompletedTask;
        }

        if (_cts is not null)
        {
            return Task.CompletedTask;
        }

        var errors = OpcUaOptionsValidator.Validate(_options);
        if (errors.Count > 0)
        {
            _state = OpcUaConnectorState.Error;
            _lastError = string.Join("; ", errors);
            _log.LogError("OPC UA connector configuration is invalid: {Errors}", _lastError);
            return Task.CompletedTask;
        }

        if (_options.AutoAcceptUntrustedCertificates)
        {
            _log.LogWarning(
                "OPC UA AutoAcceptUntrustedCertificates is enabled. This is a development-only setting and must not be used in production.");
        }

        RegisterMirrorDefinitions();

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
            _state = OpcUaConnectorState.Disabled;
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
                _log.LogDebug(ex, "OPC UA connector loop ended with an exception during shutdown.");
            }
        }

        await CleanupSessionAsync().ConfigureAwait(false);
        cts.Dispose();
        _cts = null;
        _loop = null;
        _state = OpcUaConnectorState.Disabled;
    }

    /// <summary>
    /// Writes a value to a mapped signal. Fails closed unless the connector is enabled, writes are
    /// enabled, the node id is exactly allow-listed and the signal is declared writable.
    /// </summary>
    public async Task<OpcUaWriteResult> WriteAsync(string signalId, object? value, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _writeAttempts);

        if (!_options.Enabled)
        {
            return RejectWrite("connector-disabled");
        }

        if (!_options.AllowWrites)
        {
            return RejectWrite("writes-disabled");
        }

        if (!_entriesBySignalId.TryGetValue(signalId, out var entry))
        {
            return RejectWrite("unknown-signal");
        }

        if (!entry.Writable)
        {
            return RejectWrite("not-writable-signal");
        }

        if (!_options.WriteAllowList.Contains(entry.NodeId, StringComparer.Ordinal))
        {
            return RejectWrite("not-allow-listed");
        }

        var session = _session;
        if (session is null || !session.Connected)
        {
            return RejectWrite("not-connected");
        }

        if (!NodeId.TryParse(entry.NodeId, out var nodeId))
        {
            return RejectWrite("invalid-node-id");
        }

        try
        {
            var writeValue = new WriteValue
            {
                NodeId = nodeId,
                AttributeId = Attributes.Value,
                Value = new DataValue(new Variant(value)),
            };

            var response = await session
                .WriteAsync(null, new WriteValueCollection { writeValue }, cancellationToken)
                .ConfigureAwait(false);

            var result = response.Results.Count > 0 ? response.Results[0] : StatusCodes.BadUnexpectedError;
            if (StatusCode.IsGood(result))
            {
                Interlocked.Increment(ref _writesAccepted);
                _mirror.Apply(new IndustrialSignalUpdate(
                    entry.SignalId,
                    value,
                    SignalQuality.Good,
                    SignalSource.Commanded,
                    SignalOrigin.Controller,
                    DateTimeOffset.UtcNow));
                return new OpcUaWriteResult(true, null);
            }

            return RejectWrite($"write-rejected:{result}");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return RejectWrite($"write-failed:{ex.GetType().Name}");
        }
    }

    private OpcUaWriteResult RejectWrite(string reason)
    {
        Interlocked.Increment(ref _writesRejected);
        _log.LogDebug("OPC UA write rejected: {Reason}", reason);
        return new OpcUaWriteResult(false, reason);
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var everConnected = false;

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                _state = OpcUaConnectorState.Connecting;
                var session = await ConnectAsync(cancellationToken).ConfigureAwait(false);
                _session = session;
                everConnected = true;
                _state = OpcUaConnectorState.Connected;
                _lastError = null;
                _log.LogInformation("OPC UA connector connected to {Endpoint} with {Count} monitored items.",
                    _options.Endpoint, MonitoredItemCount);

                await WaitForSessionEndAsync(session, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _lastError = $"{ex.GetType().Name}: {ex.Message}";
                _log.LogWarning(ex, "OPC UA connector attempt to {Endpoint} failed.", _options.Endpoint);
            }
            finally
            {
                await CleanupSessionAsync().ConfigureAwait(false);
            }

            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            Interlocked.Increment(ref _reconnectCount);
            _state = everConnected ? OpcUaConnectorState.Degraded : OpcUaConnectorState.Error;

            var delay = ComputeBackoff(ReconnectCount);
            _log.LogInformation("OPC UA connector retrying in {DelaySeconds:F1}s (reconnect #{ReconnectCount}).",
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

        _state = OpcUaConnectorState.Disabled;
    }

    private async Task<ISession> ConnectAsync(CancellationToken cancellationToken)
    {
        await _sessionGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var configuration = await GetConfigurationAsync(cancellationToken).ConfigureAwait(false);
            var useSecurity = !string.Equals(_options.SecurityPolicy, "None", StringComparison.OrdinalIgnoreCase);

            var endpointDescription = await CoreClientUtils
                .SelectEndpointAsync(configuration, _options.Endpoint, useSecurity, Telemetry, cancellationToken)
                .ConfigureAwait(false);

            if (endpointDescription is null)
            {
                throw new ServiceResultException(StatusCodes.BadNotConnected,
                    $"No matching endpoint available at {_options.Endpoint}.");
            }

            var endpoint = new ConfiguredEndpoint(null, endpointDescription, EndpointConfiguration.Create(configuration));
            var factory = new DefaultSessionFactory(Telemetry);
            var identity = BuildIdentity();

            var session = await factory.CreateAsync(
                configuration,
                endpoint,
                updateBeforeConnect: true,
                checkDomain: false,
                _options.ApplicationName,
                (uint)_options.SessionTimeoutMilliseconds,
                identity,
                null,
                cancellationToken).ConfigureAwait(false);

            if (session is null || !session.Connected)
            {
                throw new ServiceResultException(StatusCodes.BadConnectionClosed, "Session could not be established.");
            }

            session.KeepAliveInterval = Math.Max(1000, _options.PublishingIntervalMilliseconds);
            await CreateSubscriptionAsync(session, cancellationToken).ConfigureAwait(false);
            return session;
        }
        finally
        {
            _sessionGate.Release();
        }
    }

    private async Task<ApplicationConfiguration> GetConfigurationAsync(CancellationToken cancellationToken)
    {
        if (_configuration is not null)
        {
            return _configuration;
        }

        var pkiRoot = Path.GetFullPath(_options.CertificateTrustStore);
        var appRoot = Path.Combine(pkiRoot, "own");
        var rejectedRoot = Path.Combine(pkiRoot, "rejected");
        Directory.CreateDirectory(appRoot);
        Directory.CreateDirectory(rejectedRoot);

        var subjectName = $"CN={_options.ApplicationName}, O=Fabrik3D";
        var application = new ApplicationInstance(Telemetry)
        {
            ApplicationName = _options.ApplicationName,
            ApplicationType = ApplicationType.Client,
        };

        var applicationCertificate = new CertificateIdentifier
        {
            StoreType = CertificateStoreType.Directory,
            StorePath = appRoot,
            SubjectName = subjectName,
            CertificateType = ObjectTypeIds.RsaSha256ApplicationCertificateType,
        };

        var configuration = await application
            .Build($"urn:fabrik3d:opcua:{_options.ApplicationName}", "urn:fabrik3d:product")
            .SetOperationTimeout(_options.OperationTimeoutMilliseconds)
            .AsClient()
            .AddSecurityConfiguration(new CertificateIdentifierCollection { applicationCertificate }, pkiRoot, rejectedRoot)
            .SetAutoAcceptUntrustedCertificates(_options.AutoAcceptUntrustedCertificates)
            .SetAddAppCertToTrustedStore(false)
            .SetRejectSHA1SignedCertificates(false)
            .CreateAsync(cancellationToken)
            .ConfigureAwait(false);

        application.ApplicationConfiguration = configuration;
        await application.CheckApplicationInstanceCertificatesAsync(true, null, cancellationToken).ConfigureAwait(false);

        _application = application;
        _configuration = configuration;
        return configuration;
    }

    private IUserIdentity BuildIdentity()
    {
        if (!string.IsNullOrEmpty(_options.UserName))
        {
            var passwordBytes = System.Text.Encoding.UTF8.GetBytes(_options.Password ?? string.Empty);
            return new UserIdentity(_options.UserName, passwordBytes);
        }

        return new UserIdentity(new AnonymousIdentityToken());
    }

    private async Task CreateSubscriptionAsync(ISession session, CancellationToken cancellationToken)
    {
        var subscription = new Subscription(session.DefaultSubscription)
        {
            DisplayName = "Fabrik3D mirror",
            PublishingInterval = _options.PublishingIntervalMilliseconds,
            KeepAliveCount = 10,
            LifetimeCount = 30,
            MaxNotificationsPerPublish = 0,
            PublishingEnabled = true,
            TimestampsToReturn = TimestampsToReturn.Both,
            Priority = 10,
        };

        session.AddSubscription(subscription);
        await subscription.CreateAsync(cancellationToken).ConfigureAwait(false);

        var mapped = 0;
        foreach (var entry in _options.NodeMap)
        {
            if (!NodeId.TryParse(entry.NodeId, out var startNodeId))
            {
                _log.LogWarning("OPC UA node map entry {SignalId} has an invalid node id and was skipped.", entry.SignalId);
                continue;
            }

            var monitoredItem = new MonitoredItem(subscription.DefaultItem)
            {
                DisplayName = entry.SignalId,
                StartNodeId = startNodeId,
                AttributeId = Attributes.Value,
                SamplingInterval = _options.SamplingIntervalMilliseconds,
                QueueSize = 10,
                DiscardOldest = true,
            };
            monitoredItem.Notification += OnMonitoredItemNotification;
            subscription.AddItem(monitoredItem);
        }

        await subscription.ApplyChangesAsync(cancellationToken).ConfigureAwait(false);

        foreach (var item in subscription.MonitoredItems)
        {
            if (item.Status.Error is not null && StatusCode.IsBad(item.Status.Error.StatusCode))
            {
                _log.LogWarning("OPC UA monitored item {DisplayName} ({NodeId}) could not be created: {Error}",
                    item.DisplayName, item.StartNodeId, item.Status.Error);
                continue;
            }

            mapped++;
        }

        _subscription = subscription;
        Volatile.Write(ref _monitoredItemCount, mapped);
    }

    private void OnMonitoredItemNotification(MonitoredItem item, MonitoredItemNotificationEventArgs e)
    {
        Interlocked.Increment(ref _notificationsReceived);

        if (e.NotificationValue is not MonitoredItemNotification notification)
        {
            return;
        }

        var nodeIdText = item.StartNodeId?.ToString();
        if (nodeIdText is null || !_entriesByNodeId.TryGetValue(nodeIdText, out var entry))
        {
            return;
        }

        try
        {
            var update = OpcUaMapping.ToMirrorUpdate(entry, notification.Value, DateTimeOffset.UtcNow);

            // OPC UA status-change notifications can carry a bad/uncertain status without a value.
            // Preserve the last known value and store the degraded quality; never coerce to good.
            if (update.Value is null && update.Quality != SignalQuality.Good &&
                _mirror.TryGetSample(entry.SignalId, out var previous) && previous is not null)
            {
                update = update with { Value = previous.Value };
            }

            var result = _mirror.Apply(update);
            if (result.Accepted)
            {
                Interlocked.Increment(ref _updatesAccepted);
            }
            else
            {
                Interlocked.Increment(ref _updatesRejected);
                _log.LogDebug(
                    "OPC UA update for {SignalId} rejected by mirror: {Reason} (quality {Quality}, value type {ValueType}).",
                    entry.SignalId, result.RejectionReason, update.Quality, update.Value?.GetType().Name ?? "null");
            }
        }
        catch (Exception ex)
        {
            Interlocked.Increment(ref _updatesRejected);
            _log.LogDebug(ex, "OPC UA notification for {SignalId} could not be mapped.", entry.SignalId);
        }
    }

    private static async Task WaitForSessionEndAsync(ISession session, CancellationToken cancellationToken)
    {
        var ended = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        void OnKeepAlive(ISession _, KeepAliveEventArgs e)
        {
            if (e.Status is not null && ServiceResult.IsNotGood(e.Status))
            {
                ended.TrySetResult(true);
            }
        }

        session.KeepAlive += OnKeepAlive;
        try
        {
            using var registration = cancellationToken.Register(() => ended.TrySetResult(true));
            await ended.Task.ConfigureAwait(false);
        }
        finally
        {
            session.KeepAlive -= OnKeepAlive;
        }
    }

    private void RegisterMirrorDefinitions()
    {
        foreach (var entry in _options.NodeMap)
        {
            if (string.IsNullOrWhiteSpace(entry.SignalId))
            {
                continue;
            }

            var definition = OpcUaMapping.ToDefinition(entry) with
            {
                StaleAfterMs = entry.StaleAfterMilliseconds ?? _options.StaleAfterMilliseconds,
            };

            if (!_mirror.TryRegister(definition, out var error))
            {
                _log.LogDebug("OPC UA mirror definition for {SignalId} not registered: {Error}.", entry.SignalId, error);
            }
        }
    }

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

    private async Task CleanupSessionAsync()
    {
        var subscription = _subscription;
        _subscription = null;
        var session = _session;
        _session = null;
        Volatile.Write(ref _monitoredItemCount, 0);

        if (subscription is not null)
        {
            try
            {
                await subscription.DeleteAsync(silent: true, CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "OPC UA subscription cleanup failed.");
            }

            subscription.Dispose();
        }

        if (session is not null)
        {
            try
            {
                await session.CloseAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "OPC UA session cleanup failed.");
            }

            session.Dispose();
        }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await StopAsync(CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "OPC UA connector disposal failed.");
        }

        _sessionGate.Dispose();
    }
}
