namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Transport-neutral industrial signal DTOs. Shape and semantics match the simulator
/// signal core (docs/architecture/INDUSTRIAL_SIGNAL_CORE.md); the C# mirror is documented
/// in docs/architecture/OPC_UA_ADAPTER.md. Values stay loosely typed because a signal's
/// declared type lives in its definition.
/// </summary>
public static class IndustrialSignalContract
{
    public const string SchemaVersion = "1.0";
}

/// <summary>A single mirrored signal sample with explicit quality, source and timestamp.</summary>
public record IndustrialSignalSampleDto(
    string SignalId,
    string? EquipmentId,
    string? Name,
    string DataType,
    string? EngineeringUnit,
    bool Writable,
    object? Value,
    string Quality,
    string Source,
    string Origin,
    DateTimeOffset TimestampUtc);

/// <summary>Versioned, deterministic snapshot of the server-side signal mirror.</summary>
public record IndustrialSignalSnapshotDto(
    string SchemaVersion,
    DateTimeOffset GeneratedAt,
    IReadOnlyList<IndustrialSignalSampleDto> Signals);
