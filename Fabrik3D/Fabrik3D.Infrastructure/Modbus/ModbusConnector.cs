using System.Diagnostics;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Signals;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Infrastructure.Modbus;

/// <summary>Lifecycle health of the Modbus TCP connector.</summary>
public enum ModbusConnectorState
{
    Disabled,
    Connecting,
    Connected,
    Degraded,
    Error,
}

/// <summary>Outcome of a connector write attempt.</summary>
public sealed record ModbusWriteResult(bool Accepted, string? RejectionReason);

/// <summary>Per-point read/write diagnostics.</summary>
public sealed record ModbusPointStatus(
    string SignalId,
    string Area,
    int Address,
    long Reads,
    long ReadErrors,
    long Writes,
    long WriteErrors,
    double? LastLatencyMs,
    string? LastError);

/// <summary>Point-in-time connector health and diagnostics.</summary>
public sealed record ModbusConnectorStatus(
    ModbusConnectorState State,
    string? LastError,
    string? Endpoint,
    int ReconnectCount,
    int PointCount,
    long PollCycles,
    long UpdatesAccepted,
    long UpdatesRejected,
    long ReadErrors,
    long IllegalAddresses,
    long Timeouts,
    long WriteAttempts,
    long WritesAccepted,
    long WritesRejected,
    double? LastPollLatencyMs,
    double? AveragePollLatencyMs,
    IReadOnlyList<ModbusPointStatus> Points);

/// <summary>
/// Real, disabled-by-default Modbus TCP client connector. It polls the configured points on a single
/// connection, decodes them with the explicit mapping codec and maps values into the protocol-free
/// <see cref="SignalMirrorStore"/> as observed samples. Writes fail closed unless the connector is
/// enabled, writes are enabled, the point is writable and the signal is exactly allow-listed.
/// Addresses, endianness and unit ids never leave this adapter.
/// </summary>
public sealed class ModbusConnector : IAsyncDisposable
{
    private readonly ModbusOptions _options;
    private readonly SignalMirrorStore _mirror;
    private readonly TimeProvider _time;
    private readonly ILogger<ModbusConnector> _log;
    private readonly ModbusTcpProtocolClient _client = new();

    private readonly Dictionary<string, PointRuntime> _pointRuntime = new(StringComparer.Ordinal);
    private readonly object _statusGate = new();

    private CancellationTokenSource? _cts;
    private Task? _loop;

    private volatile ModbusConnectorState _state = ModbusConnectorState.Disabled;
    private volatile string? _lastError;
    private int _reconnectCount;
    private long _pollCycles;
    private long _updatesAccepted;
    private long _updatesRejected;
    private long _readErrors;
    private long _illegalAddresses;
    private long _timeouts;
    private long _writeAttempts;
    private long _writesAccepted;
    private long _writesRejected;
    private double _latencySumMs;
    private long _latencySamples;
    private double _lastPollLatencyMs;

    public ModbusConnector(
        IOptions<ModbusOptions> options,
        SignalMirrorStore mirror,
        TimeProvider timeProvider,
        ILogger<ModbusConnector> log)
    {
        _options = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _mirror = mirror ?? throw new ArgumentNullException(nameof(mirror));
        _time = timeProvider ?? TimeProvider.System;
        _log = log ?? throw new ArgumentNullException(nameof(log));

        foreach (var point in _options.Points)
        {
            if (!string.IsNullOrWhiteSpace(point.SignalId))
            {
                _pointRuntime[point.SignalId] = new PointRuntime();
            }
        }
    }

    public ModbusConnectorState State => _state;

    public string Health => _state.ToString();

    public string? LastError => _lastError;

    public int ReconnectCount => Volatile.Read(ref _reconnectCount);

    /// <summary>True when the connector master flags, the point direction and the allow-list all permit the write.</summary>
    public bool IsWriteAllowed(string signalId)
    {
        if (!_options.Enabled || !_options.AllowWrites || !_options.WriteAllowList.Contains(signalId, StringComparer.Ordinal))
        {
            return false;
        }

        var point = ModbusMapping.FindPoint(_options, signalId);
        return point is not null && ModbusCodec.DirectionAllowsWrite(ModbusMapping.EffectiveDirection(point));
    }

    public ModbusConnectorStatus GetStatus()
    {
        List<ModbusPointStatus> points;
        lock (_statusGate)
        {
            points = _pointRuntime
                .OrderBy(entry => entry.Key, StringComparer.Ordinal)
                .Select(entry => entry.Value.ToStatus(entry.Key, DescribePoint(entry.Key)))                .ToList();
        }

        var samples = Interlocked.Read(ref _latencySamples);
        var pollCycles = Interlocked.Read(ref _pollCycles);
        return new ModbusConnectorStatus(
            _state,
            _lastError,
            _options.Enabled ? $"{_options.Host}:{_options.Port}" : null,
            ReconnectCount,
            _options.Points.Count,
            pollCycles,
            Interlocked.Read(ref _updatesAccepted),
            Interlocked.Read(ref _updatesRejected),
            Interlocked.Read(ref _readErrors),
            Interlocked.Read(ref _illegalAddresses),
            Interlocked.Read(ref _timeouts),
            Interlocked.Read(ref _writeAttempts),
            Interlocked.Read(ref _writesAccepted),
            Interlocked.Read(ref _writesRejected),
            pollCycles == 0 ? null : _lastPollLatencyMs,
            samples == 0 ? null : _latencySumMs / samples,
            points);
    }

    public Task StartAsync() => StartAsync(CancellationToken.None);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            _state = ModbusConnectorState.Disabled;
            return Task.CompletedTask;
        }

        if (_cts is not null)
        {
            return Task.CompletedTask;
        }

        var errors = ModbusMapping.Validate(_options);
        if (errors.Count > 0)
        {
            _state = ModbusConnectorState.Error;
            _lastError = string.Join("; ", errors);
            _log.LogError("Modbus connector configuration is invalid: {Errors}", _lastError);
            return Task.CompletedTask;
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
            _state = ModbusConnectorState.Disabled;
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
                _log.LogDebug(ex, "Modbus connector loop ended with an exception during shutdown.");
            }
        }

        cts.Dispose();
        _cts = null;
        _loop = null;
        await _client.DisconnectAsync().ConfigureAwait(false);
        _state = ModbusConnectorState.Disabled;
    }

    /// <summary>
    /// Writes an engineering value to a mapped point. Fails closed unless the connector is enabled,
    /// writes are enabled, the point allows writes and the signal id is exactly allow-listed.
    /// </summary>
    public async Task<ModbusWriteResult> WriteAsync(string signalId, object? value, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(signalId);
        Interlocked.Increment(ref _writeAttempts);

        if (!_options.Enabled)
        {
            return RejectWrite(signalId, value, "connector-disabled");
        }

        if (!_options.AllowWrites)
        {
            return RejectWrite(signalId, value, "writes-disabled");
        }

        var point = ModbusMapping.FindPoint(_options, signalId);
        if (point is null)
        {
            return RejectWrite(signalId, value, "unknown-signal");
        }

        if (!ModbusCodec.DirectionAllowsWrite(ModbusMapping.EffectiveDirection(point)))
        {
            return RejectWrite(signalId, value, "not-writable-signal");
        }

        if (!_options.WriteAllowList.Contains(signalId, StringComparer.Ordinal))
        {
            return RejectWrite(signalId, value, "not-allow-listed");
        }

        if (!_client.IsConnected)
        {
            return RejectWrite(signalId, value, "not-connected");
        }

        if (!ModbusCodec.TryParseArea(point.Area, out var area))
        {
            return RejectWrite(signalId, value, "invalid-area");
        }

        var unitId = (byte)ModbusMapping.EffectiveUnitId(_options, point);
        var address = (ushort)ModbusMapping.EffectiveZeroBasedAddress(_options, point);

        try
        {
            if (ModbusMapping.IsRegisterBitPoint(point))
            {
                if (value is not bool boolean)
                {
                    return RejectWrite(signalId, value, "invalid-value");
                }

                // Read-modify-write preserves the other bits of the shared register.
                var current = await _client.ReadHoldingRegistersAsync(unitId, address, 1, cancellationToken).ConfigureAwait(false);
                var updated = ModbusCodec.ApplyBit(current[0], boolean, point.BitIndex ?? 0);
                await _client.WriteSingleRegisterAsync(unitId, address, updated, cancellationToken).ConfigureAwait(false);
            }
            else if (area == ModbusArea.Coil)
            {
                if (value is not bool coil)
                {
                    return RejectWrite(signalId, value, "invalid-value");
                }

                await _client.WriteSingleCoilAsync(unitId, address, coil, cancellationToken).ConfigureAwait(false);
            }
            else if (area == ModbusArea.HoldingRegister)
            {
                var registers = ModbusCodec.EncodeRegisters(value, point);
                await _client.WriteMultipleRegistersAsync(unitId, address, registers, cancellationToken).ConfigureAwait(false);
            }
            else
            {
                return RejectWrite(signalId, value, "not-writable-signal");
            }
        }
        catch (ModbusProtocolException ex)
        {
            RecordPointWrite(signalId, false, ex.Code);
            return RejectWrite(signalId, value, $"write-rejected:{ex.Code}");
        }
        catch (ModbusTimeoutException)
        {
            RecordPointWrite(signalId, false, "timeout");
            Interlocked.Increment(ref _timeouts);
            return RejectWrite(signalId, value, "write-timeout");
        }
        catch (ArgumentException)
        {
            return RejectWrite(signalId, value, "invalid-value");
        }
        catch (InvalidOperationException)
        {
            return RejectWrite(signalId, value, "not-connected");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            RecordPointWrite(signalId, false, ex.GetType().Name);
            return RejectWrite(signalId, value, $"write-failed:{ex.GetType().Name}");
        }

        Interlocked.Increment(ref _writesAccepted);
        RecordPointWrite(signalId, true, null);

        var written = NormalizeMirrorValue(value, point);
        var update = new IndustrialSignalUpdate(
            signalId, written, SignalQuality.Good, SignalSource.Commanded, SignalOrigin.Controller, _time.GetUtcNow());
        var result = _mirror.Apply(update);
        if (!result.Accepted)
        {
            Interlocked.Increment(ref _updatesRejected);
            _log.LogDebug("Modbus commanded mirror update for {SignalId} was rejected: {Reason}.", signalId, result.RejectionReason);
        }

        return new ModbusWriteResult(true, null);
    }

    private ModbusWriteResult RejectWrite(string signalId, object? value, string reason)
    {
        Interlocked.Increment(ref _writesRejected);
        RecordPointWrite(signalId, false, reason);
        _log.LogDebug("Modbus write to {SignalId} ({Value}) rejected: {Reason}.", signalId, ModbusCodec.Format(value), reason);
        return new ModbusWriteResult(false, reason);
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var everConnected = false;

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                _state = ModbusConnectorState.Connecting;
                await _client.ConnectAsync(
                    _options.Host, _options.Port,
                    _options.ConnectTimeoutMilliseconds, _options.RequestTimeoutMilliseconds,
                    cancellationToken).ConfigureAwait(false);

                everConnected = true;
                _state = ModbusConnectorState.Connected;
                _lastError = null;
                _log.LogInformation("Modbus connector connected to {Endpoint} (unit {UnitId}).", _client.Endpoint, _options.UnitId);

                await PollLoopAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (ModbusTimeoutException ex)
            {
                _lastError = ex.Message;
                _log.LogWarning("Modbus connection to {Host}:{Port} timed out.", _options.Host, _options.Port);
            }
            catch (Exception ex)
            {
                _lastError = $"{ex.GetType().Name}: {ex.Message}";
                _log.LogWarning(ex, "Modbus connector attempt to {Host}:{Port} failed.", _options.Host, _options.Port);
            }
            finally
            {
                await _client.DisconnectAsync().ConfigureAwait(false);
            }

            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            Interlocked.Increment(ref _reconnectCount);
            _state = everConnected ? ModbusConnectorState.Degraded : ModbusConnectorState.Error;

            var delay = ComputeBackoff(ReconnectCount);
            _log.LogInformation("Modbus connector retrying in {DelaySeconds:F1}s (reconnect #{ReconnectCount}).",
                delay.TotalSeconds, ReconnectCount);
            try
            {
                await Task.Delay(delay, _time, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _state = ModbusConnectorState.Disabled;
    }

    private async Task PollLoopAsync(CancellationToken cancellationToken)
    {
        var readPoints = _options.Points
            .Where(point => ModbusCodec.DirectionAllowsRead(ModbusMapping.EffectiveDirection(point)))
            .ToList();
        var lastPollTimestamps = new Dictionary<string, long>(StringComparer.Ordinal);

        while (!cancellationToken.IsCancellationRequested)
        {
            var cycleStart = Stopwatch.GetTimestamp();
            foreach (var point in readPoints)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!ShouldPoll(point, lastPollTimestamps, cycleStart))
                {
                    continue;
                }

                lastPollTimestamps[point.SignalId] = cycleStart;
                try
                {
                    var pointWatch = Stopwatch.StartNew();
                    await ReadPointAsync(point, cancellationToken).ConfigureAwait(false);
                    pointWatch.Stop();
                    RecordLatency(point.SignalId, pointWatch.Elapsed.TotalMilliseconds, true, null);
                    Interlocked.Increment(ref _updatesAccepted);
                }
                catch (ModbusProtocolException ex)
                {
                    Interlocked.Increment(ref _readErrors);
                    if (string.Equals(ex.Code, "illegal-data-address", StringComparison.Ordinal))
                    {
                        Interlocked.Increment(ref _illegalAddresses);
                    }

                    RecordLatency(point.SignalId, 0, false, ex.Code);
                    _log.LogDebug("Modbus read for {SignalId} failed: {Code}.", point.SignalId, ex.Code);
                }
                catch (ModbusTimeoutException ex)
                {
                    Interlocked.Increment(ref _readErrors);
                    Interlocked.Increment(ref _timeouts);
                    RecordLatency(point.SignalId, 0, false, "timeout");
                    _log.LogDebug(ex, "Modbus read for {SignalId} timed out; reconnecting.", point.SignalId);

                    // A missing response desynchronizes the stream: the client dropped the
                    // connection, so leave the poll loop and reconnect instead of reading on.
                    return;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    Interlocked.Increment(ref _readErrors);
                    RecordLatency(point.SignalId, 0, false, ex.GetType().Name);
                    _log.LogWarning(ex, "Modbus read for {SignalId} failed; reconnecting.", point.SignalId);
                    throw;
                }
            }

            Interlocked.Increment(ref _pollCycles);
            var cycleElapsedMs = ElapsedMilliseconds(cycleStart);
            Interlocked.Exchange(ref _lastPollLatencyMs, cycleElapsedMs);

            var remaining = _options.PollIntervalMilliseconds - cycleElapsedMs;
            if (remaining > 0)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(remaining), _time, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }

    private async Task ReadPointAsync(ModbusPointMapping point, CancellationToken cancellationToken)
    {
        if (!ModbusCodec.TryParseArea(point.Area, out var area))
        {
            throw new ModbusProtocolException($"Point '{point.SignalId}' declares an unknown area.");
        }

        var unitId = (byte)ModbusMapping.EffectiveUnitId(_options, point);
        var address = (ushort)ModbusMapping.EffectiveZeroBasedAddress(_options, point);
        var wordCount = (ushort)ModbusCodec.RegisterCount(point);

        object value;
        switch (area)
        {
            case ModbusArea.Coil:
                value = (await _client.ReadCoilsAsync(unitId, address, 1, cancellationToken).ConfigureAwait(false))[0];
                break;
            case ModbusArea.DiscreteInput:
                value = (await _client.ReadDiscreteInputsAsync(unitId, address, 1, cancellationToken).ConfigureAwait(false))[0];
                break;
            case ModbusArea.InputRegister:
                value = ModbusCodec.DecodeRegisters(
                    await _client.ReadInputRegistersAsync(unitId, address, wordCount, cancellationToken).ConfigureAwait(false), point);
                break;
            case ModbusArea.HoldingRegister:
                value = ModbusCodec.DecodeRegisters(
                    await _client.ReadHoldingRegistersAsync(unitId, address, wordCount, cancellationToken).ConfigureAwait(false), point);
                break;
            default:
                throw new ModbusProtocolException($"Point '{point.SignalId}' declares an unknown area.");
        }

        var update = new IndustrialSignalUpdate(
            point.SignalId, value, SignalQuality.Good, SignalSource.Observed, SignalOrigin.Controller, _time.GetUtcNow());
        var result = _mirror.Apply(update);
        if (!result.Accepted)
        {
            Interlocked.Increment(ref _updatesRejected);
            _log.LogDebug("Modbus mirror update for {SignalId} rejected: {Reason}.", point.SignalId, result.RejectionReason);
        }
    }

    private bool ShouldPoll(ModbusPointMapping point, Dictionary<string, long> lastPollTimestamps, long now)
    {
        var interval = ModbusMapping.EffectivePollIntervalMs(_options, point);
        if (!lastPollTimestamps.TryGetValue(point.SignalId, out var previous))
        {
            return true;
        }

        return ElapsedMillisecondsSince(previous, now) >= interval;
    }

    private static double ElapsedMilliseconds(long startTimestamp)
        => (Stopwatch.GetTimestamp() - startTimestamp) * 1000.0 / Stopwatch.Frequency;

    private static double ElapsedMillisecondsSince(long startTimestamp, long endTimestamp)
        => (endTimestamp - startTimestamp) * 1000.0 / Stopwatch.Frequency;

    private void RecordLatency(string signalId, double latencyMs, bool success, string? error)
    {
        lock (_statusGate)
        {
            if (_pointRuntime.TryGetValue(signalId, out var runtime))
            {
                if (success)
                {
                    runtime.Reads++;
                    runtime.LastLatencyMs = latencyMs;
                }
                else
                {
                    runtime.ReadErrors++;
                    runtime.LastError = error;
                }
            }
        }

        if (success && latencyMs > 0)
        {
            lock (_statusGate)
            {
                _latencySumMs += latencyMs;
                _latencySamples++;
            }
        }
    }

    private void RecordPointWrite(string signalId, bool success, string? error)
    {
        if (!_pointRuntime.TryGetValue(signalId, out var runtime))
        {
            return;
        }

        lock (_statusGate)
        {
            if (success)
            {
                runtime.Writes++;
            }
            else
            {
                runtime.WriteErrors++;
                runtime.LastError = error;
            }
        }
    }

    private void RegisterConfiguredDefinitions()
    {
        foreach (var point in _options.Points)
        {
            if (string.IsNullOrWhiteSpace(point.SignalId))
            {
                continue;
            }

            var definition = ModbusMapping.ToDefinition(_options, point);
            if (!_mirror.TryRegister(definition, out var error) &&
                !string.Equals(error, "duplicate-signal", StringComparison.Ordinal))
            {
                _log.LogDebug("Modbus mirror definition for {SignalId} not registered: {Error}.", point.SignalId, error);
            }
        }
    }

    private static object? NormalizeMirrorValue(object? value, ModbusPointMapping point)
    {
        if (string.Equals(point.DataType, "bool", StringComparison.OrdinalIgnoreCase))
        {
            return value is bool boolean && boolean;
        }

        return value switch
        {
            sbyte or byte or short or ushort or int or uint => Convert.ToInt64(value),
            long => value,
            float f => (double)f,
            double => value,
            _ => value,
        };
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
        return TimeSpan.FromSeconds(Math.Min(maxSeconds, baseSeconds * Math.Pow(2, exponent)));
    }

    private string DescribePoint(string signalId)
    {
        var point = ModbusMapping.FindPoint(_options, signalId);
        if (point is null)
        {
            return signalId;
        }

        return ModbusCodec.TryParseArea(point.Area, out var area)
            ? $"{ModbusCodec.ToWire(area)}@{point.Address}"
            : $"{point.Area}@{point.Address}";
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await StopAsync(CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Modbus connector disposal failed.");
        }

        await _client.DisposeAsync().ConfigureAwait(false);
    }

    private sealed class PointRuntime
    {
        public long Reads;
        public long ReadErrors;
        public long Writes;
        public long WriteErrors;
        public double? LastLatencyMs;
        public string? LastError;

        public ModbusPointStatus ToStatus(string signalId, string description)
        {
            var (area, address) = SplitDescription(description);
            return new ModbusPointStatus(signalId, area, address, Reads, ReadErrors, Writes, WriteErrors, LastLatencyMs, LastError);
        }

        private static (string Area, int Address) SplitDescription(string description)
        {
            var index = description.IndexOf('@', StringComparison.Ordinal);
            if (index <= 0)
            {
                return (description, -1);
            }

            return int.TryParse(description[(index + 1)..], out var address)
                ? (description[..index], address)
                : (description[..index], -1);
        }
    }
}
