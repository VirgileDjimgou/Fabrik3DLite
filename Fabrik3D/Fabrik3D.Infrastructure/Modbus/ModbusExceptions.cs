namespace Fabrik3D.Infrastructure.Modbus;

/// <summary>A Modbus exception response (function code with the high bit set) received from the peer.</summary>
public sealed class ModbusProtocolException : Exception
{
    public ModbusProtocolException(byte functionCode, byte exceptionCode)
        : base($"Modbus function 0x{functionCode:X2} failed with exception code 0x{exceptionCode:X2} ({MapCode(exceptionCode)}).")
    {
        FunctionCode = functionCode;
        ExceptionCode = exceptionCode;
    }

    public ModbusProtocolException(string message)
        : base(message)
    {
    }

    public byte FunctionCode { get; }

    public byte ExceptionCode { get; }

    /// <summary>Stable, non-localized diagnostic code for logging and health counters.</summary>
    public string Code => ExceptionCode == 0 ? "protocol-error" : MapCode(ExceptionCode);

    private static string MapCode(byte exceptionCode) => exceptionCode switch
    {
        0x01 => "illegal-function",
        0x02 => "illegal-data-address",
        0x03 => "illegal-data-value",
        0x04 => "slave-device-failure",
        0x05 => "acknowledge",
        0x06 => "slave-device-busy",
        0x08 => "memory-parity-error",
        0x0A => "gateway-path-unavailable",
        0x0B => "gateway-target-failed",
        _ => "unknown-exception",
    };
}

/// <summary>The configured request or connect timeout elapsed before a complete response arrived.</summary>
public sealed class ModbusTimeoutException : Exception
{
    public ModbusTimeoutException(string message, Exception? inner = null)
        : base(message, inner)
    {
    }
}
