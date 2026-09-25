using System.Buffers.Binary;
using System.Globalization;

namespace Fabrik3D.Infrastructure.Modbus;

/// <summary>
/// Pure, deterministic Modbus wire codec. It converts between raw 16-bit registers (or coils) and
/// typed, scaled engineering values using only the explicit settings declared on a
/// <see cref="ModbusPointMapping"/>: data type, width, byte order, word order, bit index, scale and
/// offset. No byte order is ever inferred from the data or the platform.
/// </summary>
public static class ModbusCodec
{
    public static bool TryParseArea(string? value, out ModbusArea area)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "coil": area = ModbusArea.Coil; return true;
            case "discrete-input":
            case "discreteinput": area = ModbusArea.DiscreteInput; return true;
            case "input-register":
            case "inputregister": area = ModbusArea.InputRegister; return true;
            case "holding-register":
            case "holdingregister": area = ModbusArea.HoldingRegister; return true;
            default: area = ModbusArea.HoldingRegister; return false;
        }
    }

    public static string ToWire(ModbusArea area) => area switch
    {
        ModbusArea.Coil => "coil",
        ModbusArea.DiscreteInput => "discrete-input",
        ModbusArea.InputRegister => "input-register",
        ModbusArea.HoldingRegister => "holding-register",
        _ => "holding-register",
    };

    public static bool TryParseByteOrder(string? value, out ModbusByteOrder order)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "big-endian":
            case "bigendian": order = ModbusByteOrder.BigEndian; return true;
            case "little-endian":
            case "littleendian": order = ModbusByteOrder.LittleEndian; return true;
            default: order = ModbusByteOrder.BigEndian; return false;
        }
    }

    public static bool TryParseWordOrder(string? value, out ModbusWordOrder order)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "high-word-first":
            case "highwordfirst": order = ModbusWordOrder.HighWordFirst; return true;
            case "low-word-first":
            case "lowwordfirst": order = ModbusWordOrder.LowWordFirst; return true;
            default: order = ModbusWordOrder.HighWordFirst; return false;
        }
    }

    public static bool TryParseDirection(string? value, out ModbusPointDirection direction)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "read": direction = ModbusPointDirection.Read; return true;
            case "write": direction = ModbusPointDirection.Write; return true;
            case "read-write":
            case "readwrite": direction = ModbusPointDirection.ReadWrite; return true;
            default: direction = ModbusPointDirection.Read; return false;
        }
    }

    public static bool IsRegisterArea(ModbusArea area)
        => area is ModbusArea.InputRegister or ModbusArea.HoldingRegister;

    public static bool AreaAllowsWrite(ModbusArea area)
        => area is ModbusArea.Coil or ModbusArea.HoldingRegister;

    public static bool DirectionAllowsRead(ModbusPointDirection direction)
        => direction is ModbusPointDirection.Read or ModbusPointDirection.ReadWrite;

    public static bool DirectionAllowsWrite(ModbusPointDirection direction)
        => direction is ModbusPointDirection.Write or ModbusPointDirection.ReadWrite;

    /// <summary>Number of 16-bit registers occupied by a point (1 for bit areas).</summary>
    public static int RegisterCount(ModbusPointMapping point)
    {
        ArgumentNullException.ThrowIfNull(point);
        return point.Width <= 16 ? 1 : point.Width / 16;
    }

    /// <summary>Translates a configured address to the zero-based wire address.</summary>
    public static int NormalizeAddress(int address, string? convention)
        => IsOneBased(convention) ? address - 1 : address;

    public static bool IsOneBased(string? convention)
        => string.Equals(convention?.Trim(), "one-based", StringComparison.OrdinalIgnoreCase);

    public static bool IsKnownAddressConvention(string? convention)
        => convention is not null &&
           (convention.Trim().Equals("zero-based", StringComparison.OrdinalIgnoreCase) ||
            convention.Trim().Equals("one-based", StringComparison.OrdinalIgnoreCase));

    /// <summary>Decodes a register point (including a boolean mapped to a single bit) into a typed engineering value.</summary>
    public static object DecodeRegisters(IReadOnlyList<ushort> registers, ModbusPointMapping point)
    {
        ArgumentNullException.ThrowIfNull(point);
        ArgumentNullException.ThrowIfNull(registers);

        var count = RegisterCount(point);
        if (registers.Count < count)
        {
            throw new ArgumentException("Not enough registers to decode the point.", nameof(registers));
        }

        if (string.Equals(point.DataType, "bool", StringComparison.OrdinalIgnoreCase))
        {
            var bitIndex = point.BitIndex ?? 0;
            return ((registers[0] >> bitIndex) & 0x1) == 1;
        }

        var words = ToLogicalWords(registers, count, ParseByteOrder(point), ParseWordOrder(point));
        var raw = Combine(words);

        return Interpret(raw, point);
    }

    /// <summary>Decodes a coil/discrete-input bit into a boolean.</summary>
    public static bool DecodeCoil(bool value) => value;

    /// <summary>Encodes a typed engineering value into the registers to transmit, in wire (address) order.</summary>
    public static ushort[] EncodeRegisters(object? value, ModbusPointMapping point)
    {
        ArgumentNullException.ThrowIfNull(point);
        var count = RegisterCount(point);

        if (string.Equals(point.DataType, "bool", StringComparison.OrdinalIgnoreCase))
        {
            if (value is not bool boolean)
            {
                throw new ArgumentException("A boolean point requires a boolean value.", nameof(value));
            }

            return [ApplyBit(0, boolean, point.BitIndex ?? 0)];
        }

        var scaled = ApplyScaleInverse(value, point);
        var raw = ToRawBits(scaled, point);
        var logicalWords = Split(raw, count);
        return ToWireWords(logicalWords, count, ParseByteOrder(point), ParseWordOrder(point));
    }

    private static ModbusByteOrder ParseByteOrder(ModbusPointMapping point)
        => TryParseByteOrder(point.ByteOrder, out var order) ? order : ModbusByteOrder.BigEndian;

    private static ModbusWordOrder ParseWordOrder(ModbusPointMapping point)
        => TryParseWordOrder(point.WordOrder, out var order) ? order : ModbusWordOrder.HighWordFirst;

    private static ushort[] ToLogicalWords(IReadOnlyList<ushort> registers, int count, ModbusByteOrder byteOrder, ModbusWordOrder wordOrder)
    {
        var words = new ushort[count];
        for (var index = 0; index < count; index++)
        {
            var word = registers[index];
            if (byteOrder == ModbusByteOrder.LittleEndian)
            {
                word = (ushort)((word >> 8) | (word << 8));
            }

            words[index] = word;
        }

        if (wordOrder == ModbusWordOrder.LowWordFirst)
        {
            Array.Reverse(words);
        }

        return words;
    }

    private static ushort[] ToWireWords(ushort[] logicalWords, int count, ModbusByteOrder byteOrder, ModbusWordOrder wordOrder)
    {
        var words = new ushort[count];
        Array.Copy(logicalWords, words, count);

        if (wordOrder == ModbusWordOrder.LowWordFirst)
        {
            Array.Reverse(words);
        }

        if (byteOrder == ModbusByteOrder.LittleEndian)
        {
            for (var index = 0; index < count; index++)
            {
                words[index] = (ushort)((words[index] >> 8) | (words[index] << 8));
            }
        }

        return words;
    }

    private static ulong Combine(ushort[] words)
    {
        ulong raw = 0;
        foreach (var word in words)
        {
            raw = (raw << 16) | word;
        }

        return raw;
    }

    private static ushort[] Split(ulong raw, int count)
    {
        var words = new ushort[count];
        for (var index = 0; index < count; index++)
        {
            var shift = 16 * (count - 1 - index);
            words[index] = (ushort)((raw >> shift) & 0xFFFF);
        }

        return words;
    }

    private static object Interpret(ulong raw, ModbusPointMapping point)
    {
        var dataType = point.DataType.Trim().ToLowerInvariant();
        var scaled = point.Scale != 1.0 || point.Offset != 0.0;

        switch (dataType)
        {
            case "int":
                long signed = point.Width == 16 ? (long)(short)raw : (long)(int)(uint)raw;
                if (scaled)
                {
                    return signed * point.Scale + point.Offset;
                }

                return signed;

            case "uint":
                long unsigned = point.Width == 16 ? (long)(ushort)raw : (long)(uint)raw;
                if (scaled)
                {
                    return unsigned * point.Scale + point.Offset;
                }

                return unsigned;

            case "float" when point.Width == 32:
                var single = (double)BitConverter.Int32BitsToSingle(unchecked((int)(uint)raw));
                return single * point.Scale + point.Offset;

            case "float" when point.Width == 64:
                var @double = BitConverter.Int64BitsToDouble(unchecked((long)raw));
                return @double * point.Scale + point.Offset;

            default:
                throw new ArgumentException(
                    $"Unsupported data type/width combination '{point.DataType}'/{point.Width}.", nameof(point));
        }
    }

    private static ulong ToRawBits(double scaled, ModbusPointMapping point)
    {
        var dataType = point.DataType.Trim().ToLowerInvariant();
        return (dataType, point.Width) switch
        {
            ("int", 16) => (ulong)(ushort)(short)CheckedRound(scaled, short.MinValue, short.MaxValue),
            ("int", 32) => (ulong)(uint)(int)CheckedRound(scaled, int.MinValue, int.MaxValue),
            ("uint", 16) => (ulong)(ushort)CheckedRound(scaled, ushort.MinValue, ushort.MaxValue),
            ("uint", 32) => (ulong)(uint)CheckedRound(scaled, uint.MinValue, uint.MaxValue),
            ("float", 32) => (ulong)(uint)BitConverter.SingleToInt32Bits((float)scaled),
            ("float", 64) => (ulong)BitConverter.DoubleToInt64Bits(scaled),
            _ => throw new ArgumentException(
                $"Unsupported data type/width combination '{point.DataType}'/{point.Width}.", nameof(point)),
        };
    }

    private static long CheckedRound(double value, long min, long max)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            throw new ArgumentException("The scaled value is not a finite number.", nameof(value));
        }

        var rounded = Math.Round(value, MidpointRounding.AwayFromZero);
        if (rounded < min || rounded > max)
        {
            throw new ArgumentOutOfRangeException(nameof(value), rounded,
                $"The scaled value is outside the representable range [{min}, {max}].");
        }

        return (long)rounded;
    }

    private static double ToDouble(object? value)
    {
        return value switch
        {
            sbyte or byte or short or ushort or int or uint or long or ulong => Convert.ToDouble(value, CultureInfo.InvariantCulture),
            float f => f,
            double d => d,
            decimal m => (double)m,
            _ => throw new ArgumentException($"Value of type {value?.GetType().Name ?? "null"} is not numeric.", nameof(value)),
        };
    }

    /// <summary>Sets or clears one bit in a 16-bit register value, preserving the other bits.</summary>
    public static ushort ApplyBit(ushort register, bool value, int bitIndex)
    {
        var mask = (ushort)(1 << bitIndex);
        return value ? (ushort)(register | mask) : (ushort)(register & ~mask);
    }

    private static double ApplyScaleInverse(object? value, ModbusPointMapping point)
    {
        var numeric = ToDouble(value);
        return (numeric - point.Offset) / point.Scale;
    }

    /// <summary>Formats a value deterministically for diagnostics and tests.</summary>
    public static string Format(object? value) => value switch
    {
        null => "null",
        bool b => b ? "true" : "false",
        double d => d.ToString("R", CultureInfo.InvariantCulture),
        float f => f.ToString("R", CultureInfo.InvariantCulture),
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? "null",
    };

    /// <summary>Serializes registers to the big-endian bytes used on a Modbus TCP wire frame.</summary>
    public static byte[] RegistersToBytes(IReadOnlyList<ushort> registers)
    {
        var bytes = new byte[registers.Count * 2];
        for (var index = 0; index < registers.Count; index++)
        {
            BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(index * 2, 2), registers[index]);
        }

        return bytes;
    }

    /// <summary>Parses big-endian register bytes received on a Modbus TCP wire frame.</summary>
    public static ushort[] BytesToRegisters(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length % 2 != 0)
        {
            throw new ArgumentException("A register payload must have an even length.", nameof(bytes));
        }

        var registers = new ushort[bytes.Length / 2];
        for (var index = 0; index < registers.Length; index++)
        {
            registers[index] = BinaryPrimitives.ReadUInt16BigEndian(bytes.Slice(index * 2, 2));
        }

        return registers;
    }
}
