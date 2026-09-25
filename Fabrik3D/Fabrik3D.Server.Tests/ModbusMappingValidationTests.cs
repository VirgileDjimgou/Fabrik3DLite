using Fabrik3D.Infrastructure.Modbus;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for Modbus mapping validation. Every acceptance criterion for ambiguous endianness,
/// invalid addresses, widths, scales, directions and unsafe overlaps is asserted through the stable
/// diagnostic code prefix.
/// </summary>
public class ModbusMappingValidationTests
{
    private static ModbusOptions Enabled() => new()
    {
        Enabled = true,
        Host = "127.0.0.1",
        Port = 502,
        UnitId = 1,
        AddressConvention = "zero-based",
        Points = [],
    };

    private static ModbusPointMapping Holding(
        string signalId = "robot-1.Counter",
        string dataType = "uint",
        int width = 16,
        int address = 0,
        string? byteOrder = "big-endian",
        string? wordOrder = "high-word-first",
        int? bitIndex = null,
        double scale = 1.0,
        double offset = 0.0,
        string direction = "read",
        string area = "holding-register",
        int? unitId = null,
        double? min = null,
        double? max = null) => new()
        {
            SignalId = signalId,
            Area = area,
            Address = address,
            UnitId = unitId,
            DataType = dataType,
            Width = width,
            ByteOrder = byteOrder,
            WordOrder = wordOrder,
            BitIndex = bitIndex,
            Scale = scale,
            Offset = offset,
            Direction = direction,
            Min = min,
            Max = max,
        };

    private static bool Has(IReadOnlyList<string> errors, string prefix)
        => errors.Any(error => error.StartsWith(prefix, StringComparison.Ordinal));

    [Fact]
    public void Disabled_connector_skips_validation_entirely()
    {
        var options = new ModbusOptions
        {
            Enabled = false,
            Host = string.Empty,
            Port = -1,
            UnitId = 0,
            PollIntervalMilliseconds = -5,
            AddressConvention = "nonsense",
        };
        options.Points.Add(Holding(byteOrder: null, width: 7));

        Assert.Empty(ModbusMapping.Validate(options));
    }

    [Fact]
    public void A_fully_declared_configuration_is_valid()
    {
        var options = Enabled();
        options.Points.Add(Holding());
        options.Points.Add(Holding("robot-1.Speed", "float", 32, address: 10));
        options.Points.Add(Holding("robot-1.Running", "bool", 1, address: 0, byteOrder: null, wordOrder: null, area: "coil"));
        options.Points.Add(Holding("robot-1.Flag", "bool", 16, address: 20, bitIndex: 3));

        Assert.Empty(ModbusMapping.Validate(options));
    }

    [Fact]
    public void Connector_level_settings_are_validated_with_actionable_codes()
    {
        var options = Enabled();
        options.Host = " ";
        options.Port = 70000;
        options.UnitId = 0;
        options.ConnectTimeoutMilliseconds = 0;
        options.RequestTimeoutMilliseconds = -1;
        options.PollIntervalMilliseconds = 0;
        options.StaleAfterMilliseconds = 0;
        options.ReconnectDelaySeconds = 30;
        options.MaxReconnectDelaySeconds = 5;
        options.AddressConvention = "two-based";

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-host"));
        Assert.True(Has(errors, "invalid-port"));
        Assert.True(Has(errors, "invalid-unit-id"));
        Assert.True(Has(errors, "invalid-connect-timeout"));
        Assert.True(Has(errors, "invalid-request-timeout"));
        Assert.True(Has(errors, "invalid-poll-interval"));
        Assert.True(Has(errors, "invalid-stale-after"));
        Assert.True(Has(errors, "invalid-reconnect-policy"));
        Assert.True(Has(errors, "invalid-address-convention"));
    }

    [Fact]
    public void Missing_endianness_and_word_order_are_rejected_for_register_points()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.A", "uint", 16, byteOrder: null));
        options.Points.Add(Holding("robot-1.B", "uint", 32, address: 10, wordOrder: null));

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "missing-endianness"));
        Assert.True(Has(errors, "missing-word-order"));
    }

    [Fact]
    public void Invalid_widths_are_rejected_per_data_type()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.Bad", "uint", 1, address: 0));
        options.Points.Add(Holding("robot-1.Big", "int", 64, address: 10));

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-width"));
    }

    [Fact]
    public void Invalid_scale_offset_and_range_are_rejected()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.ZeroScale", scale: 0));
        options.Points.Add(Holding("robot-1.NaN", offset: double.NaN));
        options.Points.Add(Holding("robot-1.Range", min: 10, max: 1));

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-scale"));
        Assert.True(Has(errors, "invalid-offset"));
        Assert.True(Has(errors, "invalid-range"));
    }

    [Fact]
    public void Address_convention_and_range_are_validated()
    {
        var options = Enabled();
        var oneBased = Holding("robot-1.OneBased", address: 0, area: "coil", byteOrder: null, wordOrder: null);
        oneBased.AddressConvention = "one-based";
        options.Points.Add(oneBased);
        options.Points.Add(Holding("robot-1.TooFar", address: 65535));
        options.Points.Add(Holding("robot-1.Span", "uint", 32, address: 65535));
        var unknownConvention = Holding("robot-1.UnknownConvention", address: 0);
        unknownConvention.AddressConvention = "hex";
        options.Points.Add(unknownConvention);

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-address"));
        Assert.True(Has(errors, "invalid-address-convention"));
    }

    [Fact]
    public void Write_direction_on_read_only_areas_is_rejected()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.Discrete", "bool", 1, address: 0, byteOrder: null, wordOrder: null,
            direction: "write", area: "discrete-input"));
        options.Points.Add(Holding("robot-1.Input", "uint", 16, address: 1, direction: "read-write", area: "input-register"));

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "read-only-area-write"));
    }

    [Fact]
    public void Boolean_register_points_require_width_16_and_a_valid_bit_index()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.MissingBit", "bool", 16, address: 0));
        options.Points.Add(Holding("robot-1.BadBit", "bool", 16, address: 1, bitIndex: 20));
        options.Points.Add(Holding("robot-1.BadWidth", "bool", 32, address: 2, bitIndex: 1));

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-bit-index"));
        Assert.True(Has(errors, "invalid-width"));
    }

    [Fact]
    public void Bit_index_on_a_bit_area_point_is_rejected()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.Coil", "bool", 1, address: 0, byteOrder: null, wordOrder: null,
            area: "coil", bitIndex: 2));

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-bit-index"));
    }

    [Fact]
    public void Unknown_area_data_type_and_direction_are_rejected()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.A", area: "mailbox"));
        options.Points.Add(Holding("robot-1.B", dataType: "quantum", address: 1));
        options.Points.Add(Holding("robot-1.C", direction: "maybe", address: 2));

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-area"));
        Assert.True(Has(errors, "invalid-data-type"));
        Assert.True(Has(errors, "invalid-direction"));
    }

    [Fact]
    public void Duplicate_signal_ids_are_rejected()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.Same", address: 0));
        options.Points.Add(Holding("robot-1.Same", address: 10));

        Assert.True(Has(ModbusMapping.Validate(options), "duplicate-signal-id"));
    }

    [Fact]
    public void Overlapping_register_points_are_rejected_but_distinct_bits_are_allowed()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.First", "uint", 32, address: 0));
        options.Points.Add(Holding("robot-1.Second", "uint", 32, address: 1));

        Assert.True(Has(ModbusMapping.Validate(options), "overlapping-point"));

        var bits = Enabled();
        bits.Points.Add(Holding("robot-1.BitA", "bool", 16, address: 0, bitIndex: 0));
        bits.Points.Add(Holding("robot-1.BitB", "bool", 16, address: 0, bitIndex: 1));

        Assert.Empty(ModbusMapping.Validate(bits));

        var sameBit = Enabled();
        sameBit.Points.Add(Holding("robot-1.BitA", "bool", 16, address: 0, bitIndex: 3));
        sameBit.Points.Add(Holding("robot-1.BitB", "bool", 16, address: 0, bitIndex: 3));

        Assert.True(Has(ModbusMapping.Validate(sameBit), "overlapping-point"));
    }

    [Fact]
    public void Per_point_unit_id_and_convention_are_validated()
    {
        var options = Enabled();
        options.Points.Add(Holding("robot-1.Unit", unitId: 999));
        options.Points.Add(Holding("robot-1.Poll", address: 10));
        options.Points.ElementAt(1).PollIntervalMilliseconds = 0;
        options.Points.Add(Holding("robot-1.Stale", address: 20));
        options.Points.ElementAt(2).StaleAfterMilliseconds = -1;

        var errors = ModbusMapping.Validate(options);

        Assert.True(Has(errors, "invalid-unit-id"));
        Assert.True(Has(errors, "invalid-poll-interval"));
        Assert.True(Has(errors, "invalid-stale-after"));
    }

    [Fact]
    public void ToDefinition_projects_domain_vocabulary_without_protocol_types()
    {
        var options = Enabled();
        var point = Holding("robot-1.Setpoint", "uint", 16, direction: "read-write", scale: 0.5);
        point.EngineeringUnit = "mm";
        point.Min = 0;
        point.Max = 100;

        var definition = ModbusMapping.ToDefinition(options, point);

        Assert.Equal("robot-1.Setpoint", definition.SignalId);
        Assert.Equal("robot-1", definition.EquipmentId);
        Assert.Equal("Setpoint", definition.Name);
        Assert.Equal(Fabrik3D.Domain.Signals.SignalDataType.UInt, definition.DataType);
        Assert.Equal(Fabrik3D.Domain.Signals.SignalDirection.Internal, definition.Direction);
        Assert.True(definition.Writable);
        Assert.Equal("mm", definition.EngineeringUnit);
        Assert.Equal(10000, definition.StaleAfterMs);
    }
}
