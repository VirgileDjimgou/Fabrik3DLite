using Fabrik3D.Infrastructure.Modbus;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Deterministic unit tests for the pure Modbus wire codec: byte/word order, signedness, widths,
/// boolean bit mapping, scaling direction, range checks and address conventions. They assert exact
/// numeric outcomes, never inferred results.
/// </summary>
public class ModbusCodecUnitTests
{
    private static ModbusPointMapping Point(
        string dataType = "uint",
        int width = 16,
        string? byteOrder = "big-endian",
        string? wordOrder = "high-word-first",
        int? bitIndex = null,
        double scale = 1.0,
        double offset = 0.0,
        string area = "holding-register") => new()
        {
            SignalId = "robot-1.Value",
            Area = area,
            Address = 0,
            DataType = dataType,
            Width = width,
            ByteOrder = byteOrder,
            WordOrder = wordOrder,
            BitIndex = bitIndex,
            Scale = scale,
            Offset = offset,
        };

    [Theory]
    [InlineData("big-endian", "high-word-first", 0x12345678u)]
    [InlineData("little-endian", "high-word-first", 0x34127856u)]
    [InlineData("big-endian", "low-word-first", 0x56781234u)]
    [InlineData("little-endian", "low-word-first", 0x78563412u)]
    public void UInt32_decodes_every_byte_and_word_order_explicitly(string byteOrder, string wordOrder, uint expected)
    {
        var point = Point("uint", 32, byteOrder, wordOrder);
        var registers = new ushort[] { 0x1234, 0x5678 };

        var decoded = ModbusCodec.DecodeRegisters(registers, point);

        Assert.Equal((long)expected, Assert.IsType<long>(decoded));
    }

    [Theory]
    [InlineData("big-endian", "high-word-first")]
    [InlineData("little-endian", "high-word-first")]
    [InlineData("big-endian", "low-word-first")]
    [InlineData("little-endian", "low-word-first")]
    public void UInt32_round_trips_through_encode_and_decode(string byteOrder, string wordOrder)
    {
        var point = Point("uint", 32, byteOrder, wordOrder);
        const long value = 0x0BADF00DL;

        var registers = ModbusCodec.EncodeRegisters(value, point);
        var decoded = ModbusCodec.DecodeRegisters(registers, point);

        Assert.Equal(value, Assert.IsType<long>(decoded));
    }

    [Fact]
    public void Signed_and_unsigned_16_bit_values_are_not_confused()
    {
        var registers = new ushort[] { 0xFFFF };

        Assert.Equal(-1L, Assert.IsType<long>(ModbusCodec.DecodeRegisters(registers, Point("int", 16))));
        Assert.Equal(65535L, Assert.IsType<long>(ModbusCodec.DecodeRegisters(registers, Point("uint", 16))));
        Assert.Equal(32767L, Assert.IsType<long>(ModbusCodec.DecodeRegisters([0x7FFF], Point("int", 16))));
    }

    [Fact]
    public void Signed_32_bit_values_decode_with_two_complement()
    {
        var registers = new ushort[] { 0xFFFF, 0xFFFE };

        Assert.Equal(-2L, Assert.IsType<long>(ModbusCodec.DecodeRegisters(registers, Point("int", 32))));
        Assert.Equal(4294967294L, Assert.IsType<long>(ModbusCodec.DecodeRegisters(registers, Point("uint", 32))));
    }

    [Fact]
    public void Float32_decodes_ieee754_in_big_endian_high_word_first()
    {
        // 1.5f == 0x3FC00000
        var registers = new ushort[] { 0x3FC0, 0x0000 };

        Assert.Equal(1.5d, Assert.IsType<double>(ModbusCodec.DecodeRegisters(registers, Point("float", 32))));
    }

    [Fact]
    public void Float64_round_trips_and_uses_four_registers()
    {
        var point = Point("float", 64);
        var registers = ModbusCodec.EncodeRegisters(-12.5d, point);

        Assert.Equal(4, registers.Length);
        Assert.Equal(-12.5d, Assert.IsType<double>(ModbusCodec.DecodeRegisters(registers, point)));
    }

    [Fact]
    public void Boolean_bit_mapping_selects_the_declared_low_order_bit()
    {
        var point = Point("bool", 16, bitIndex: 3);

        Assert.True((bool)ModbusCodec.DecodeRegisters([0b0000_1000], point));
        Assert.False((bool)ModbusCodec.DecodeRegisters([0b0000_0111], point));
        Assert.True(Assert.IsType<bool>(ModbusCodec.DecodeRegisters([0b1000_1000], point)));

        Assert.Equal(0b0000_1000, ModbusCodec.EncodeRegisters(true, point)[0]);
        Assert.Equal(0, ModbusCodec.EncodeRegisters(false, point)[0]);
    }

    [Fact]
    public void ApplyBit_preserves_unrelated_bits()
    {
        Assert.Equal(0b1010_0000, ModbusCodec.ApplyBit(0b1010_1000, false, 3));
        Assert.Equal(0b1010_1000, ModbusCodec.ApplyBit(0b1010_0000, true, 3));
        Assert.Equal(0b1010_1000, ModbusCodec.ApplyBit(0b1010_1000, true, 3));
    }

    [Fact]
    public void Scaling_direction_is_raw_times_scale_plus_offset_on_read()
    {
        var point = Point("uint", 16, scale: 0.1, offset: -5.0);

        Assert.Equal(5.0d, Assert.IsType<double>(ModbusCodec.DecodeRegisters([100], point)));
        Assert.Equal(3.0d, Assert.IsType<double>(ModbusCodec.DecodeRegisters([80], point)));
    }

    [Fact]
    public void Scaling_is_inverted_on_write()
    {
        var point = Point("uint", 16, scale: 0.1, offset: -5.0);

        Assert.Equal(150, ModbusCodec.EncodeRegisters(10.0d, point)[0]);
    }

    [Fact]
    public void Integer_encode_rounds_away_from_zero_and_rejects_out_of_range()
    {
        var point = Point("int", 16, scale: 1.0);

        Assert.Equal(2, (short)ModbusCodec.EncodeRegisters(1.5d, point)[0]);
        Assert.Equal(-2, (short)ModbusCodec.EncodeRegisters(-1.5d, point)[0]);
        Assert.Throws<ArgumentOutOfRangeException>(() => ModbusCodec.EncodeRegisters(40000d, point));
    }

    [Fact]
    public void Address_conventions_are_normalized_explicitly()
    {
        Assert.Equal(0, ModbusCodec.NormalizeAddress(0, "zero-based"));
        Assert.Equal(0, ModbusCodec.NormalizeAddress(1, "one-based"));
        Assert.Equal(9, ModbusCodec.NormalizeAddress(10, "one-based"));
        Assert.Equal(-1, ModbusCodec.NormalizeAddress(0, "one-based"));
        Assert.True(ModbusCodec.IsKnownAddressConvention("Zero-Based"));
        Assert.False(ModbusCodec.IsKnownAddressConvention("two-based"));
        Assert.False(ModbusCodec.IsKnownAddressConvention(null));
    }

    [Fact]
    public void Parser_helpers_accept_only_the_documented_vocabulary()
    {
        Assert.True(ModbusCodec.TryParseArea("holding-register", out var holding));
        Assert.Equal(ModbusArea.HoldingRegister, holding);
        Assert.True(ModbusCodec.TryParseArea("discrete-input", out var discrete));
        Assert.Equal(ModbusArea.DiscreteInput, discrete);
        Assert.False(ModbusCodec.TryParseArea("mailbox", out _));

        Assert.True(ModbusCodec.TryParseByteOrder("little-endian", out var little));
        Assert.Equal(ModbusByteOrder.LittleEndian, little);
        Assert.False(ModbusCodec.TryParseByteOrder(null, out _));

        Assert.True(ModbusCodec.TryParseWordOrder("low-word-first", out var low));
        Assert.Equal(ModbusWordOrder.LowWordFirst, low);
        Assert.False(ModbusCodec.TryParseWordOrder("middle-word-first", out _));

        Assert.True(ModbusCodec.TryParseDirection("read-write", out var readWrite));
        Assert.Equal(ModbusPointDirection.ReadWrite, readWrite);
        Assert.False(ModbusCodec.TryParseDirection("maybe", out _));
    }

    [Fact]
    public void Register_byte_helpers_are_big_endian_per_the_specification()
    {
        var bytes = ModbusCodec.RegistersToBytes([0x1234, 0xABCD]);
        Assert.Equal(new byte[] { 0x12, 0x34, 0xAB, 0xCD }, bytes);
        Assert.Equal(new ushort[] { 0x1234, 0xABCD }, ModbusCodec.BytesToRegisters(bytes));
        Assert.Throws<ArgumentException>(() => ModbusCodec.BytesToRegisters([0x01]));
    }

    [Theory]
    [InlineData("holding-register", 16)]
    [InlineData("input-register", 32)]
    [InlineData("holding-register", 64)]
    public void Register_count_follows_the_declared_width(string area, int width)
    {
        var point = Point("float", width, area: area);
        Assert.Equal(width / 16, ModbusCodec.RegisterCount(point));
    }
}
