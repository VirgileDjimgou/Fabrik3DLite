using System.Buffers.Binary;
using System.Net.Sockets;

namespace Fabrik3D.Infrastructure.Modbus;

/// <summary>
/// Small, self-contained Modbus TCP client transport based on the public Modbus Application
/// Protocol specification and the "Modbus Messaging on TCP/IP Implementation Guide". It is a client
/// (polling master) only: it opens one TCP connection, serializes transactions under a gate and
/// speaks the standard MBAP header plus function codes 1/2/3/4/5/6/15/16.
///
/// It deliberately implements only the wire subset Fabrik3D needs and adds no third-party transport
/// dependency; the choice is recorded in docs/architecture/MODBUS_TCP_ADAPTER.md. It claims no
/// conformance certification.
/// </summary>
public sealed class ModbusTcpProtocolClient : IAsyncDisposable
{
    public const byte FunctionReadCoils = 0x01;
    public const byte FunctionReadDiscreteInputs = 0x02;
    public const byte FunctionReadHoldingRegisters = 0x03;
    public const byte FunctionReadInputRegisters = 0x04;
    public const byte FunctionWriteSingleCoil = 0x05;
    public const byte FunctionWriteSingleRegister = 0x06;
    public const byte FunctionWriteMultipleCoils = 0x0F;
    public const byte FunctionWriteMultipleRegisters = 0x10;

    private readonly SemaphoreSlim _gate = new(1, 1);
    private TcpClient? _client;
    private NetworkStream? _stream;
    private ushort _transactionId;
    private int _requestTimeoutMilliseconds = 2000;

    public bool IsConnected => _client?.Connected == true && _stream is not null;

    public string? Endpoint { get; private set; }

    public Task ConnectAsync(string host, int port, int connectTimeoutMilliseconds, int requestTimeoutMilliseconds, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(host);
        _requestTimeoutMilliseconds = Math.Max(1, requestTimeoutMilliseconds);
        return ConnectCoreAsync(host, port, Math.Max(1, connectTimeoutMilliseconds), cancellationToken);
    }

    private async Task ConnectCoreAsync(string host, int port, int connectTimeoutMilliseconds, CancellationToken cancellationToken)
    {
        await DisconnectAsync().ConfigureAwait(false);
        var client = new TcpClient { NoDelay = true };
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(connectTimeoutMilliseconds);

        try
        {
            await client.ConnectAsync(host, port, timeout.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            client.Dispose();
            throw new ModbusTimeoutException($"Connecting to {host}:{port} timed out after {connectTimeoutMilliseconds} ms.");
        }
        catch
        {
            client.Dispose();
            throw;
        }

        _client = client;
        _stream = client.GetStream();
        Endpoint = $"{host}:{port}";
    }

    public Task DisconnectAsync()
    {
        try
        {
            _stream?.Dispose();
        }
        catch (Exception)
        {
            // Best-effort teardown; the client is disposed below.
        }

        _stream = null;

        try
        {
            _client?.Dispose();
        }
        catch (Exception)
        {
            // Best-effort teardown.
        }

        _client = null;
        Endpoint = null;
        return Task.CompletedTask;
    }

    public Task<bool[]> ReadCoilsAsync(byte unitId, ushort address, ushort count, CancellationToken cancellationToken)
    {
        ValidateCount(count, 1, 2000, nameof(count));
        var request = new byte[5];
        request[0] = FunctionReadCoils;
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(3), count);
        return ReadBitsAsync(unitId, request, count, cancellationToken);
    }

    public Task<bool[]> ReadDiscreteInputsAsync(byte unitId, ushort address, ushort count, CancellationToken cancellationToken)
    {
        ValidateCount(count, 1, 2000, nameof(count));
        var request = new byte[5];
        request[0] = FunctionReadDiscreteInputs;
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(3), count);
        return ReadBitsAsync(unitId, request, count, cancellationToken);
    }

    private async Task<bool[]> ReadBitsAsync(byte unitId, byte[] request, ushort count, CancellationToken cancellationToken)
    {
        var response = await ExecuteAsync(unitId, request, cancellationToken).ConfigureAwait(false);
        var expectedBytes = (count + 7) / 8;
        var byteCount = response[1];
        if (byteCount != expectedBytes || response.Length < 2 + byteCount)
        {
            throw new ModbusProtocolException(
                $"Malformed bit response: byte count {byteCount}, expected {expectedBytes}.");
        }

        var result = new bool[count];
        for (var index = 0; index < count; index++)
        {
            var value = response[2 + (index / 8)];
            result[index] = ((value >> (index % 8)) & 0x1) == 1;
        }

        return result;
    }

    public async Task<ushort[]> ReadHoldingRegistersAsync(byte unitId, ushort address, ushort count, CancellationToken cancellationToken)
        => await ReadRegistersAsync(FunctionReadHoldingRegisters, unitId, address, count, cancellationToken).ConfigureAwait(false);

    public async Task<ushort[]> ReadInputRegistersAsync(byte unitId, ushort address, ushort count, CancellationToken cancellationToken)
        => await ReadRegistersAsync(FunctionReadInputRegisters, unitId, address, count, cancellationToken).ConfigureAwait(false);

    private async Task<ushort[]> ReadRegistersAsync(
        byte function, byte unitId, ushort address, ushort count, CancellationToken cancellationToken)
    {
        ValidateCount(count, 1, 125, nameof(count));
        var request = new byte[5];
        request[0] = function;
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(3), count);

        var response = await ExecuteAsync(unitId, request, cancellationToken).ConfigureAwait(false);
        var byteCount = response[1];
        if (byteCount != count * 2 || response.Length < 2 + byteCount)
        {
            throw new ModbusProtocolException(
                $"Malformed register response: byte count {byteCount}, expected {count * 2}.");
        }

        return ModbusCodec.BytesToRegisters(response.AsSpan(2, byteCount));
    }

    public async Task WriteSingleCoilAsync(byte unitId, ushort address, bool value, CancellationToken cancellationToken)
    {
        var request = new byte[5];
        request[0] = FunctionWriteSingleCoil;
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(3), value ? (ushort)0xFF00 : (ushort)0x0000);
        await ExecuteAsync(unitId, request, cancellationToken).ConfigureAwait(false);
    }

    public async Task WriteSingleRegisterAsync(byte unitId, ushort address, ushort value, CancellationToken cancellationToken)
    {
        var request = new byte[5];
        request[0] = FunctionWriteSingleRegister;
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(3), value);
        await ExecuteAsync(unitId, request, cancellationToken).ConfigureAwait(false);
    }

    public async Task WriteMultipleCoilsAsync(byte unitId, ushort address, IReadOnlyList<bool> values, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(values);
        ValidateCount(values.Count, 1, 1968, nameof(values));
        var byteCount = (values.Count + 7) / 8;
        var request = new byte[6 + byteCount];
        request[0] = FunctionWriteMultipleCoils;
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(3), (ushort)values.Count);
        request[5] = (byte)byteCount;
        for (var index = 0; index < values.Count; index++)
        {
            if (values[index])
            {
                request[6 + (index / 8)] |= (byte)(1 << (index % 8));
            }
        }

        await ExecuteAsync(unitId, request, cancellationToken).ConfigureAwait(false);
    }

    public async Task WriteMultipleRegistersAsync(byte unitId, ushort address, IReadOnlyList<ushort> values, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(values);
        ValidateCount(values.Count, 1, 123, nameof(values));
        var request = new byte[6 + (values.Count * 2)];
        request[0] = FunctionWriteMultipleRegisters;
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(1), address);
        BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(3), (ushort)values.Count);
        request[5] = (byte)(values.Count * 2);
        for (var index = 0; index < values.Count; index++)
        {
            BinaryPrimitives.WriteUInt16BigEndian(request.AsSpan(6 + (index * 2), 2), values[index]);
        }

        await ExecuteAsync(unitId, request, cancellationToken).ConfigureAwait(false);
    }

    private async Task<byte[]> ExecuteAsync(byte unitId, byte[] requestPdu, CancellationToken cancellationToken)
    {
        var stream = _stream;
        if (stream is null || _client is null || !_client.Connected)
        {
            throw new InvalidOperationException("The Modbus TCP connection is not open.");
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var transactionId = unchecked(++_transactionId);
            var frame = BuildFrame(transactionId, unitId, requestPdu);

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(_requestTimeoutMilliseconds);
            try
            {
                await stream.WriteAsync(frame, timeout.Token).ConfigureAwait(false);
                var pdu = await ReadPduAsync(stream, transactionId, timeout.Token).ConfigureAwait(false);
                return ValidatePdu(requestPdu[0], pdu);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                await FaultAsync().ConfigureAwait(false);
                throw new ModbusTimeoutException(
                    $"No complete response for function 0x{requestPdu[0]:X2} within {_requestTimeoutMilliseconds} ms.");
            }
            catch (ModbusProtocolException)
            {
                throw;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception exception) when (exception is IOException or SocketException or ObjectDisposedException or InvalidOperationException)
            {
                await FaultAsync().ConfigureAwait(false);
                throw;
            }
        }
        finally
        {
            _gate.Release();
        }
    }

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

    private static async Task<byte[]> ReadPduAsync(NetworkStream stream, ushort expectedTransactionId, CancellationToken cancellationToken)
    {
        var header = new byte[7];
        await stream.ReadExactlyAsync(header.AsMemory(), cancellationToken).ConfigureAwait(false);

        var transactionId = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(0));
        var protocolId = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(2));
        var length = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(4));

        if (protocolId != 0)
        {
            throw new ModbusProtocolException($"Unexpected MBAP protocol identifier {protocolId} (expected 0).");
        }

        if (transactionId != expectedTransactionId)
        {
            throw new ModbusProtocolException(
                $"Transaction identifier mismatch: expected {expectedTransactionId}, received {transactionId}.");
        }

        if (length is < 2 or > 260)
        {
            throw new ModbusProtocolException($"Invalid MBAP length {length}.");
        }

        var pdu = new byte[length - 1];
        await stream.ReadExactlyAsync(pdu.AsMemory(), cancellationToken).ConfigureAwait(false);
        return pdu;
    }

    private static byte[] ValidatePdu(byte requestFunction, byte[] pdu)
    {
        if (pdu.Length == 0)
        {
            throw new ModbusProtocolException("Empty response PDU.");
        }

        if (pdu[0] == (requestFunction | 0x80))
        {
            var exceptionCode = pdu.Length >= 2 ? pdu[1] : (byte)0;
            throw new ModbusProtocolException(requestFunction, exceptionCode);
        }

        if (pdu[0] != requestFunction)
        {
            throw new ModbusProtocolException(
                $"Unexpected function code 0x{pdu[0]:X2} for request 0x{requestFunction:X2}.");
        }

        return pdu;
    }

    private async Task FaultAsync()
    {
        // A timed-out or broken frame leaves the stream unusable: drop the connection so the
        // connector reconnects cleanly instead of interpreting a stale frame as the next response.
        await DisconnectAsync().ConfigureAwait(false);
    }

    private static void ValidateCount(int count, int minimum, int maximum, string parameterName)
    {
        if (count < minimum || count > maximum)
        {
            throw new ArgumentOutOfRangeException(parameterName, count,
                $"A Modbus request supports {minimum}..{maximum} items per call.");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync().ConfigureAwait(false);
        _gate.Dispose();
    }
}
