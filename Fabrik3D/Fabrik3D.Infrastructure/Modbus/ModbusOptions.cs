namespace Fabrik3D.Infrastructure.Modbus;

/// <summary>The four public Modbus data areas.</summary>
public enum ModbusArea
{
    Coil,
    DiscreteInput,
    InputRegister,
    HoldingRegister,
}

/// <summary>Order of the two bytes inside one 16-bit register on the wire.</summary>
public enum ModbusByteOrder
{
    /// <summary>High byte first, the Modbus default (spec order).</summary>
    BigEndian,

    /// <summary>Low byte first (byte-swapped per register).</summary>
    LittleEndian,
}

/// <summary>Order of the 16-bit words that make up a multi-word value.</summary>
public enum ModbusWordOrder
{
    /// <summary>The register at the lowest address holds the most significant word.</summary>
    HighWordFirst,

    /// <summary>The register at the lowest address holds the least significant word.</summary>
    LowWordFirst,
}

/// <summary>Read/write direction of a mapped point relative to the controller boundary.</summary>
public enum ModbusPointDirection
{
    Read,
    Write,
    ReadWrite,
}

/// <summary>
/// Optional Modbus TCP client connector settings. Disabled and read-only by default.
/// All addressing, endianness, scaling and signedness are explicit configuration data; no byte
/// order is ever inferred. Modbus is an integration boundary only; it never carries application
/// orchestration and no protocol address leaks into the core domain.
/// </summary>
public class ModbusOptions
{
    public const string SectionName = "Modbus";

    public bool Enabled { get; set; }

    /// <summary>PLC host name or IP address. Modbus TCP defaults to port 502.</summary>
    public string Host { get; set; } = "127.0.0.1";

    public int Port { get; set; } = 502;

    /// <summary>Default Modbus unit (slave) identifier applied to points without an override (1..247).</summary>
    public int UnitId { get; set; } = 1;

    public int ConnectTimeoutMilliseconds { get; set; } = 5000;
    public int RequestTimeoutMilliseconds { get; set; } = 2000;

    /// <summary>Nominal poll interval. Poll cycles never overlap; a slow cycle simply delays the next.</summary>
    public int PollIntervalMilliseconds { get; set; } = 1000;

    public int ReconnectDelaySeconds { get; set; } = 5;
    public int MaxReconnectDelaySeconds { get; set; } = 60;

    /// <summary>Default read-time staleness threshold; a point may override it.</summary>
    public int StaleAfterMilliseconds { get; set; } = 10000;

    /// <summary>Enables outbound writes. Disabled and fail-closed by default.</summary>
    public bool AllowWrites { get; set; }

    /// <summary>Exact-match signal id allow-list for outbound writes.</summary>
    public List<string> WriteAllowList { get; set; } = [];

    /// <summary>
    /// Default address convention (<c>zero-based</c> or <c>one-based</c>) applied to points that do
    /// not override it. The convention is always stated in configuration, never guessed.
    /// </summary>
    public string AddressConvention { get; set; } = "zero-based";

    /// <summary>Explicit Fabrik3D-signal to Modbus-point mappings. Point addresses never enter Domain.</summary>
    public List<ModbusPointMapping> Points { get; set; } = [];
}

/// <summary>
/// One mapping between a canonical Fabrik3D signal and a Modbus point. This is versioned
/// configuration data; no Modbus type or address is exposed to the core domain.
/// </summary>
public class ModbusPointMapping
{
    /// <summary>Canonical signal id, convention <c>&lt;equipmentId&gt;.&lt;name&gt;</c>.</summary>
    public string SignalId { get; set; } = string.Empty;

    /// <summary>One of coil, discrete-input, input-register, holding-register.</summary>
    public string Area { get; set; } = "holding-register";

    /// <summary>Address in the configured (zero- or one-based) convention.</summary>
    public int Address { get; set; }

    /// <summary>Optional per-point address convention override; falls back to <see cref="ModbusOptions.AddressConvention"/>.</summary>
    public string? AddressConvention { get; set; }

    /// <summary>Optional per-point unit (slave) identifier override.</summary>
    public int? UnitId { get; set; }

    /// <summary>One of bool, int, uint, float. Signedness is stated here, never inferred from the wire.</summary>
    public string DataType { get; set; } = "uint";

    /// <summary>
    /// Data width in bits. Supported policy: bool = 1 (coil/discrete) or 16 (register bit),
    /// int/uint = 16 or 32, float = 32 or 64.
    /// </summary>
    public int Width { get; set; } = 16;

    /// <summary>Byte order inside each register: <c>big-endian</c> (spec order) or <c>little-endian</c>. Required for register areas.</summary>
    public string? ByteOrder { get; set; }

    /// <summary>Word order for 32/64-bit values: <c>high-word-first</c> or <c>low-word-first</c>. Required for widths &gt; 16.</summary>
    public string? WordOrder { get; set; }

    /// <summary>Bit index (0..15) for a boolean mapped into a register; required for boolean register points.</summary>
    public int? BitIndex { get; set; }

    /// <summary>
    /// Engineering gain: <c>engineering = raw * Scale + Offset</c> on read; the inverse is used on
    /// write. Defaults to 1 (no scaling) and may never be zero.
    /// </summary>
    public double Scale { get; set; } = 1.0;

    /// <summary>Engineering offset applied after <see cref="Scale"/>.</summary>
    public double Offset { get; set; }

    /// <summary>Engineering unit reported on the signal definition (for example <c>m/s</c>).</summary>
    public string? EngineeringUnit { get; set; }

    /// <summary>One of read, write, read-write. Discrete inputs and input registers are read-only in Modbus.</summary>
    public string Direction { get; set; } = "read";

    /// <summary>Optional per-point poll interval; falls back to <see cref="ModbusOptions.PollIntervalMilliseconds"/>.</summary>
    public int? PollIntervalMilliseconds { get; set; }

    /// <summary>Optional per-point staleness override.</summary>
    public int? StaleAfterMilliseconds { get; set; }

    public double? Min { get; set; }
    public double? Max { get; set; }
}
