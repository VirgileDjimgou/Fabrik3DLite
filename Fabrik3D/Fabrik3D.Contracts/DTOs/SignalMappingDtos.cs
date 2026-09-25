namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Protocol-specific external target of a mapping entry. Kept as plain data: exactly one
/// protocol group is meaningful per entry and no protocol type leaks into the core domain.
/// Wire names match the simulator mapping-file schema 1.0.
/// </summary>
public record SignalMappingTargetDto(
    string? NodeId = null,
    string? Topic = null,
    string? PayloadField = null,
    bool? Retain = null,
    string? Area = null,
    int? Address = null,
    int? Width = null,
    int? BitIndex = null,
    string? ByteOrder = null,
    string? WordOrder = null,
    bool? Signed = null,
    int? UnitId = null,
    string? AddressConvention = null);

/// <summary>One internal-signal to external-target mapping. Data only; never executable.</summary>
public record SignalMappingEntryDto(
    string Id,
    string Name,
    string InternalSignalId,
    string EquipmentId,
    string Protocol,
    string Direction,
    string DataType,
    double Scale,
    double Offset,
    string? Unit,
    bool Enabled,
    SignalMappingTargetDto Target,
    string? Description = null,
    string? Notes = null);

/// <summary>Versioned mapping document (schema 1.0). <see cref="Version"/> is server-assigned.</summary>
public record SignalMappingDocumentDto(
    string SchemaVersion,
    string Id,
    string Name,
    IReadOnlyList<SignalMappingEntryDto> Entries,
    int Version = 0,
    string? Description = null);

/// <summary>Row-addressable validation diagnostic.</summary>
public record SignalMappingDiagnosticDto(
    string Severity,
    string Code,
    string Message,
    string? Path = null,
    string? EntryId = null);

public record SignalMappingValidationResultDto(
    bool Valid,
    IReadOnlyList<SignalMappingDiagnosticDto> Diagnostics);

/// <summary>Conflict between mappings (duplicate external write target or incompatible mapping).</summary>
public record SignalMappingConflictDto(
    string Severity,
    string Code,
    string Message,
    IReadOnlyList<string> EntryIds);

/// <summary>Per-protocol apply outcome. A disabled connector is never partially applied.</summary>
public record SignalMappingApplyEntryDto(
    string Protocol,
    string Status,
    int EntryCount,
    string? Reason = null);

public record SignalMappingApplyResultDto(
    bool Applied,
    string MappingId,
    int Version,
    IReadOnlyList<SignalMappingApplyEntryDto> Protocols,
    IReadOnlyList<SignalMappingDiagnosticDto> Diagnostics,
    DateTimeOffset AppliedAtUtc,
    string? AppliedBy);

/// <summary>Audit record for mapping mutations and applies.</summary>
public record SignalMappingAuditDto(
    string Action,
    string MappingId,
    int Version,
    string By,
    DateTimeOffset AtUtc,
    string? Detail = null);

/// <summary>List projection: metadata only, never the full mapping payload.</summary>
public record SignalMappingSummaryDto(
    string Id,
    string Name,
    int Version,
    int EntryCount,
    bool Valid,
    DateTimeOffset UpdatedAtUtc);
