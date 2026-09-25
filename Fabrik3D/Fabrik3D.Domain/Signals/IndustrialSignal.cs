namespace Fabrik3D.Domain.Signals;

/// <summary>
/// Protocol-independent industrial signal vocabulary (schema 1.0).
/// Mirrors the simulator signal core documented in docs/architecture/INDUSTRIAL_SIGNAL_CORE.md.
/// No protocol (OPC UA, MQTT, Modbus) type or node id may appear here.
/// </summary>
public static class IndustrialSignalSchema
{
    public const string Version = "1.0";
}

/// <summary>Quality of a stored sample. A value is never silently upgraded.</summary>
public enum SignalQuality
{
    Good,
    Stale,
    Bad,
    Uncertain,
    Invalid,
}

/// <summary>Normalized value source, matching the twin store priority model.</summary>
public enum SignalSource
{
    Commanded,
    Replay,
    Simulated,
    Observed,
}

/// <summary>What produced the value.</summary>
public enum SignalOrigin
{
    Simulation,
    Controller,
    Scenario,
    FaultInjection,
    Operator,
    Import,
    Replay,
}

/// <summary>Direction of the signal relative to the controller boundary.</summary>
public enum SignalDirection
{
    InputToController,
    OutputFromController,
    Internal,
    TelemetryOnly,
}

/// <summary>Declared data type of a signal.</summary>
public enum SignalDataType
{
    Bool,
    Int,
    UInt,
    Float,
    Enum,
    String,
}

/// <summary>Optional semantic grouping.</summary>
public enum SignalSemanticCategory
{
    Command,
    Status,
    Measurement,
    Safety,
    Diagnostic,
    Configuration,
}

/// <summary>Canonical, stable string representation of the signal vocabulary.</summary>
public static class SignalVocabulary
{
    public static string ToWire(SignalQuality quality) => quality switch
    {
        SignalQuality.Good => "good",
        SignalQuality.Stale => "stale",
        SignalQuality.Bad => "bad",
        SignalQuality.Uncertain => "uncertain",
        SignalQuality.Invalid => "invalid",
        _ => "invalid",
    };

    public static string ToWire(SignalSource source) => source switch
    {
        SignalSource.Commanded => "commanded",
        SignalSource.Replay => "replay",
        SignalSource.Simulated => "simulated",
        SignalSource.Observed => "observed",
        _ => "observed",
    };

    public static string ToWire(SignalOrigin origin) => origin switch
    {
        SignalOrigin.Simulation => "simulation",
        SignalOrigin.Controller => "controller",
        SignalOrigin.Scenario => "scenario",
        SignalOrigin.FaultInjection => "fault-injection",
        SignalOrigin.Operator => "operator",
        SignalOrigin.Import => "import",
        SignalOrigin.Replay => "replay",
        _ => "simulation",
    };

    public static string ToWire(SignalDirection direction) => direction switch
    {
        SignalDirection.InputToController => "input-to-controller",
        SignalDirection.OutputFromController => "output-from-controller",
        SignalDirection.Internal => "internal",
        SignalDirection.TelemetryOnly => "telemetry-only",
        _ => "internal",
    };

    public static string ToWire(SignalDataType dataType) => dataType switch
    {
        SignalDataType.Bool => "bool",
        SignalDataType.Int => "int",
        SignalDataType.UInt => "uint",
        SignalDataType.Float => "float",
        SignalDataType.Enum => "enum",
        SignalDataType.String => "string",
        _ => "float",
    };

    public static string ToWire(SignalSemanticCategory category) => category switch
    {
        SignalSemanticCategory.Command => "command",
        SignalSemanticCategory.Status => "status",
        SignalSemanticCategory.Measurement => "measurement",
        SignalSemanticCategory.Safety => "safety",
        SignalSemanticCategory.Diagnostic => "diagnostic",
        SignalSemanticCategory.Configuration => "configuration",
        _ => "status",
    };

    public static bool TryParseQuality(string? value, out SignalQuality quality)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "good": quality = SignalQuality.Good; return true;
            case "stale": quality = SignalQuality.Stale; return true;
            case "bad": quality = SignalQuality.Bad; return true;
            case "uncertain": quality = SignalQuality.Uncertain; return true;
            case "invalid": quality = SignalQuality.Invalid; return true;
            default: quality = SignalQuality.Invalid; return false;
        }
    }

    public static bool TryParseSource(string? value, out SignalSource source)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "commanded": source = SignalSource.Commanded; return true;
            case "replay": source = SignalSource.Replay; return true;
            case "simulated": source = SignalSource.Simulated; return true;
            case "observed": source = SignalSource.Observed; return true;
            default: source = SignalSource.Observed; return false;
        }
    }

    public static bool TryParseOrigin(string? value, out SignalOrigin origin)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "simulation": origin = SignalOrigin.Simulation; return true;
            case "controller": origin = SignalOrigin.Controller; return true;
            case "scenario": origin = SignalOrigin.Scenario; return true;
            case "fault-injection": origin = SignalOrigin.FaultInjection; return true;
            case "operator": origin = SignalOrigin.Operator; return true;
            case "import": origin = SignalOrigin.Import; return true;
            case "replay": origin = SignalOrigin.Replay; return true;
            default: origin = SignalOrigin.Simulation; return false;
        }
    }

    public static bool TryParseDirection(string? value, out SignalDirection direction)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "input-to-controller": direction = SignalDirection.InputToController; return true;
            case "output-from-controller": direction = SignalDirection.OutputFromController; return true;
            case "internal": direction = SignalDirection.Internal; return true;
            case "telemetry-only": direction = SignalDirection.TelemetryOnly; return true;
            default: direction = SignalDirection.Internal; return false;
        }
    }

    public static bool TryParseDataType(string? value, out SignalDataType dataType)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "bool": dataType = SignalDataType.Bool; return true;
            case "int": dataType = SignalDataType.Int; return true;
            case "uint": dataType = SignalDataType.UInt; return true;
            case "float": dataType = SignalDataType.Float; return true;
            case "enum": dataType = SignalDataType.Enum; return true;
            case "string": dataType = SignalDataType.String; return true;
            default: dataType = SignalDataType.Float; return false;
        }
    }

    public static bool TryParseSemanticCategory(string? value, out SignalSemanticCategory category)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "command": category = SignalSemanticCategory.Command; return true;
            case "status": category = SignalSemanticCategory.Status; return true;
            case "measurement": category = SignalSemanticCategory.Measurement; return true;
            case "safety": category = SignalSemanticCategory.Safety; return true;
            case "diagnostic": category = SignalSemanticCategory.Diagnostic; return true;
            case "configuration": category = SignalSemanticCategory.Configuration; return true;
            default: category = SignalSemanticCategory.Status; return false;
        }
    }
}

/// <summary>Declared, immutable signal definition (canonical metadata).</summary>
public sealed record IndustrialSignalDefinition(
    string SignalId,
    string EquipmentId,
    string Name,
    string DisplayName,
    SignalDirection Direction,
    SignalDataType DataType,
    string? EngineeringUnit,
    bool Writable,
    double? Min,
    double? Max,
    IReadOnlyList<string>? EnumValues,
    SignalSemanticCategory? SemanticCategory,
    int? StaleAfterMs);

/// <summary>An update proposed by a driver or transport.</summary>
/// <param name="AuthorityScope">Optional control-authority scope the update belongs to (S36).</param>
/// <param name="AuthorityMode">Optional wire name of the authority mode that authorized the update.</param>
public sealed record IndustrialSignalUpdate(
    string SignalId,
    object? Value,
    SignalQuality Quality,
    SignalSource Source,
    SignalOrigin Origin,
    DateTimeOffset Timestamp,
    string? AuthorityScope = null,
    string? AuthorityMode = null);

/// <summary>A stored sample. Read-time staleness is derived, never stored.</summary>
public sealed record IndustrialSignalSample(
    string SignalId,
    object? Value,
    SignalQuality Quality,
    SignalSource Source,
    SignalOrigin Origin,
    DateTimeOffset Timestamp,
    string? AuthorityScope = null,
    string? AuthorityMode = null);

/// <summary>Deterministic, versioned mirror snapshot.</summary>
public sealed record IndustrialSignalSnapshot(
    string SchemaVersion,
    DateTimeOffset GeneratedAt,
    IReadOnlyList<IndustrialSignalSample> Signals);

/// <summary>Outcome of applying an update to the mirror.</summary>
public sealed record SignalMirrorWriteResult(
    bool Accepted,
    string? RejectionReason,
    IndustrialSignalSample? Sample);
