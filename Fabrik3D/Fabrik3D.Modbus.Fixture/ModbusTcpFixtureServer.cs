using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;

namespace Fabrik3D.Modbus.Fixture;

/// <summary>
/// Purpose-built Modbus TCP server used only by the S35 connector integration tests. It is a real
/// TCP server that speaks the public Modbus TCP wire protocol (MBAP header plus function codes
/// 1/2/3/4/5/6/15/16) over loopback, so no OCI image, proprietary software or hand-started process
/// is required for the mandatory gates. It is explicitly not a product and is never shipped.
///
/// The implementation is intentionally independent of the connector's client code so a shared bug
/// cannot silently make both sides agree.
/// </summary>
public sealed class ModbusTcpFixtureServer : IAsyncDisposable
{
    private const int BankSize = 1024;
    private const byte ExceptionIllegalFunction = 0x01;
    private const byte ExceptionIllegalDataAddress = 0x02;
    private const byte ExceptionIllegalDataValue = 0x03;

    private readonly ushort[] _holdingRegisters = new ushort[BankSize];
    private readonly ushort[] _inputRegisters = new ushort[BankSize];
    private readonly bool[] _coils = new bool[BankSize];
    private readonly bool[] _discreteInputs = new bool[BankSize];
    private readonly object _gate = new();
    private readonly List<TcpClient> _clients = [];

    private TcpListener? _listener;
    private CancellationTokenSource? _cts;
    private Task? _acceptLoop;
    private int _port;
    private long _requestCount;
    private string? _lastRequest;

    public int Port => _port;

    public string Endpoint => $"127.0.0.1:{_port}";

    public bool IsRunning => _listener is not null;

    public long RequestCount => Interlocked.Read(ref _requestCount);

    public string? LastRequest => _lastRequest;

    /// <summary>When false the server accepts connections and consumes requests but never responds (timeout fixture).</summary>
    public bool Respond { get; set; } = true;

    public static async Task<ModbusTcpFixtureServer> StartAsync(int? port = null)
    {
        var fixture = new ModbusTcpFixtureServer();
        await fixture.StartCoreAsync(port).ConfigureAwait(false);
        return fixture;
    }

    /// <summary>Stops and restarts the server on the same port so a connected client observes a real outage.</summary>
    public async Task RestartAsync()
    {
        var port = _port;
        await StopCoreAsync().ConfigureAwait(false);
        await StartCoreAsync(port).ConfigureAwait(false);
    }

    /// <summary>Stops the listener and drops all client connections, simulating a PLC power-off.</summary>
    public Task StopAsync() => StopCoreAsync();

    /// <summary>Starts the server again on the port it previously used.</summary>
    public Task StartOnSamePortAsync() => StartCoreAsync(_port);

    private async Task StartCoreAsync(int? port)
    {
        Exception? lastError = null;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var listener = new TcpListener(IPAddress.Loopback, port ?? 0);
            listener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            try
            {
                listener.Start();
                _listener = listener;
                _port = ((IPEndPoint)listener.LocalEndpoint).Port;
                _cts = new CancellationTokenSource();
                _acceptLoop = Task.Run(() => AcceptLoopAsync(listener, _cts.Token), CancellationToken.None);
                return;
            }
            catch (SocketException ex)
            {
                lastError = ex;
                listener.Stop();
                await Task.Delay(150).ConfigureAwait(false);
            }
        }

        throw new InvalidOperationException("Unable to start the Modbus fixture listener.", lastError);
    }

    private async Task AcceptLoopAsync(TcpListener listener, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await listener.AcceptTcpClientAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception)
            {
                break;
            }

            lock (_gate)
            {
                _clients.Add(client);
            }

            _ = Task.Run(() => HandleClientAsync(client, cancellationToken), CancellationToken.None);
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        client.NoDelay = true;
        var stream = client.GetStream();
        var header = new byte[7];

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                if (!await TryReadExactlyAsync(stream, header, 7, cancellationToken).ConfigureAwait(false))
                {
                    break;
                }

                var transactionId = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(0));
                var protocolId = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(2));
                var length = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(4));
                var unitId = header[6];

                if (protocolId != 0 || length < 2 || length > 260)
                {
                    break;
                }

                var pdu = new byte[length - 1];
                if (!await TryReadExactlyAsync(stream, pdu, pdu.Length, cancellationToken).ConfigureAwait(false))
                {
                    break;
                }

                Interlocked.Increment(ref _requestCount);
                _lastRequest = Describe(unitId, pdu);

                if (!Respond)
                {
                    // Keep the connection open but never answer, to exercise the request timeout.
                    continue;
                }

                var responsePdu = HandlePdu(pdu);
                if (responsePdu is null)
                {
                    continue;
                }

                var frame = BuildFrame(transactionId, unitId, responsePdu);
                await stream.WriteAsync(frame, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // Fixture shutdown.
        }
        catch (IOException)
        {
            // Client went away.
        }
        finally
        {
            lock (_gate)
            {
                _clients.Remove(client);
            }

            try
            {
                client.Dispose();
            }
            catch
            {
                // Best-effort teardown.
            }
        }
    }

    private byte[]? HandlePdu(byte[] pdu)
    {
        if (pdu.Length == 0)
        {
            return null;
        }

        var function = pdu[0];
        switch (function)
        {
            case 0x01:
                return HandleReadBits(pdu, _coils);
            case 0x02:
                return HandleReadBits(pdu, _discreteInputs);
            case 0x03:
                return HandleReadRegisters(pdu, _holdingRegisters);
            case 0x04:
                return HandleReadRegisters(pdu, _inputRegisters);
            case 0x05:
                return HandleWriteSingleCoil(pdu);
            case 0x06:
                return HandleWriteSingleRegister(pdu);
            case 0x0F:
                return HandleWriteMultipleCoils(pdu);
            case 0x10:
                return HandleWriteMultipleRegisters(pdu);
            default:
                return ExceptionResponse(function, ExceptionIllegalFunction);
        }
    }

    private byte[] HandleReadBits(byte[] pdu, bool[] bank)
    {
        if (pdu.Length < 5)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        var address = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(1));
        var quantity = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(3));
        if (quantity is < 1 or > 2000)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        lock (_gate)
        {
            if (address + quantity > bank.Length)
            {
                return ExceptionResponse(pdu[0], ExceptionIllegalDataAddress);
            }

            var byteCount = (quantity + 7) / 8;
            var response = new byte[2 + byteCount];
            response[0] = pdu[0];
            response[1] = (byte)byteCount;
            for (var index = 0; index < quantity; index++)
            {
                if (bank[address + index])
                {
                    response[2 + (index / 8)] |= (byte)(1 << (index % 8));
                }
            }

            return response;
        }
    }

    private byte[] HandleReadRegisters(byte[] pdu, ushort[] bank)
    {
        if (pdu.Length < 5)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        var address = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(1));
        var quantity = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(3));
        if (quantity is < 1 or > 125)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        lock (_gate)
        {
            if (address + quantity > bank.Length)
            {
                return ExceptionResponse(pdu[0], ExceptionIllegalDataAddress);
            }

            var response = new byte[2 + (quantity * 2)];
            response[0] = pdu[0];
            response[1] = (byte)(quantity * 2);
            for (var index = 0; index < quantity; index++)
            {
                BinaryPrimitives.WriteUInt16BigEndian(response.AsSpan(2 + (index * 2), 2), bank[address + index]);
            }

            return response;
        }
    }

    private byte[] HandleWriteSingleCoil(byte[] pdu)
    {
        if (pdu.Length < 5)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        var address = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(1));
        var raw = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(3));
        if (raw is not (0xFF00 or 0x0000))
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        lock (_gate)
        {
            if (address >= _coils.Length)
            {
                return ExceptionResponse(pdu[0], ExceptionIllegalDataAddress);
            }

            _coils[address] = raw == 0xFF00;
        }

        return Echo(pdu);
    }

    private byte[] HandleWriteSingleRegister(byte[] pdu)
    {
        if (pdu.Length < 5)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        var address = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(1));
        var value = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(3));
        lock (_gate)
        {
            if (address >= _holdingRegisters.Length)
            {
                return ExceptionResponse(pdu[0], ExceptionIllegalDataAddress);
            }

            _holdingRegisters[address] = value;
        }

        return Echo(pdu);
    }

    private byte[] HandleWriteMultipleCoils(byte[] pdu)
    {
        if (pdu.Length < 6)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        var address = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(1));
        var quantity = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(3));
        var byteCount = pdu[5];
        if (quantity is < 1 or > 1968 || byteCount != (quantity + 7) / 8 || pdu.Length < 6 + byteCount)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        lock (_gate)
        {
            if (address + quantity > _coils.Length)
            {
                return ExceptionResponse(pdu[0], ExceptionIllegalDataAddress);
            }

            for (var index = 0; index < quantity; index++)
            {
                _coils[address + index] = ((pdu[6 + (index / 8)] >> (index % 8)) & 0x1) == 1;
            }
        }

        return WriteMultipleEcho(pdu, address, quantity);
    }

    private byte[] HandleWriteMultipleRegisters(byte[] pdu)
    {
        if (pdu.Length < 6)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        var address = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(1));
        var quantity = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(3));
        var byteCount = pdu[5];
        if (quantity is < 1 or > 123 || byteCount != quantity * 2 || pdu.Length < 6 + byteCount)
        {
            return ExceptionResponse(pdu[0], ExceptionIllegalDataValue);
        }

        lock (_gate)
        {
            if (address + quantity > _holdingRegisters.Length)
            {
                return ExceptionResponse(pdu[0], ExceptionIllegalDataAddress);
            }

            for (var index = 0; index < quantity; index++)
            {
                _holdingRegisters[address + index] = BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(6 + (index * 2), 2));
            }
        }

        return WriteMultipleEcho(pdu, address, quantity);
    }

    private static byte[] Echo(byte[] pdu)
    {
        var response = new byte[pdu.Length];
        Array.Copy(pdu, response, pdu.Length);
        return response;
    }

    private static byte[] WriteMultipleEcho(byte[] pdu, ushort address, ushort quantity)
    {
        var response = new byte[5];
        response[0] = pdu[0];
        BinaryPrimitives.WriteUInt16BigEndian(response.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(response.AsSpan(3), quantity);
        return response;
    }

    private static byte[] ExceptionResponse(byte function, byte exceptionCode)
        => [(byte)(function | 0x80), exceptionCode];

    private static byte[] BuildFrame(ushort transactionId, byte unitId, byte[] pdu)
    {
        var frame = new byte[7 + pdu.Length];
        BinaryPrimitives.WriteUInt16BigEndian(frame.AsSpan(0), transactionId);
        BinaryPrimitives.WriteUInt16BigEndian(frame.AsSpan(2), 0);
        BinaryPrimitives.WriteUInt16BigEndian(frame.AsSpan(4), (ushort)(pdu.Length + 1));
        frame[6] = unitId;
        pdu.CopyTo(frame, 7);
        return frame;
    }

    private static async Task<bool> TryReadExactlyAsync(Stream stream, byte[] buffer, int count, CancellationToken cancellationToken)
    {
        var offset = 0;
        while (offset < count)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset, count - offset), cancellationToken).ConfigureAwait(false);
            if (read == 0)
            {
                return false;
            }

            offset += read;
        }

        return true;
    }

    private static string Describe(byte unitId, byte[] pdu)
    {
        var function = pdu[0];
        var detail = pdu.Length >= 5
            ? $"addr={BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(1))} value={BinaryPrimitives.ReadUInt16BigEndian(pdu.AsSpan(3))}"
            : $"bytes={pdu.Length}";
        return $"unit={unitId} function=0x{function:X2} {detail}";
    }

    // ── Bank accessors used by tests to arrange and observe state ────────────────────────────────

    public void SetHoldingRegister(int address, ushort value)
    {
        lock (_gate)
        {
            _holdingRegisters[address] = value;
        }
    }

    public ushort GetHoldingRegister(int address)
    {
        lock (_gate)
        {
            return _holdingRegisters[address];
        }
    }

    public void SetInputRegister(int address, ushort value)
    {
        lock (_gate)
        {
            _inputRegisters[address] = value;
        }
    }

    public void SetCoil(int address, bool value)
    {
        lock (_gate)
        {
            _coils[address] = value;
        }
    }

    public bool GetCoil(int address)
    {
        lock (_gate)
        {
            return _coils[address];
        }
    }

    public void SetDiscreteInput(int address, bool value)
    {
        lock (_gate)
        {
            _discreteInputs[address] = value;
        }
    }

    public bool GetDiscreteInput(int address)
    {
        lock (_gate)
        {
            return _discreteInputs[address];
        }
    }

    private Task StopCoreAsync()
    {
        _cts?.Cancel();
        _listener?.Stop();
        _listener = null;

        lock (_gate)
        {
            foreach (var client in _clients)
            {
                try
                {
                    client.Dispose();
                }
                catch
                {
                    // Best-effort teardown.
                }
            }

            _clients.Clear();
        }

        try
        {
            _acceptLoop?.Wait(TimeSpan.FromSeconds(5));
        }
        catch
        {
            // The accept loop is best-effort on shutdown.
        }

        _acceptLoop = null;
        _cts?.Dispose();
        _cts = null;
        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        await StopCoreAsync().ConfigureAwait(false);
    }
}
