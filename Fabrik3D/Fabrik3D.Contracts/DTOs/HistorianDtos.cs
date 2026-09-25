using System.ComponentModel.DataAnnotations;

namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// A persisted telemetry sample returned by the historian query surface (S40). Read-only: the
/// historian can never issue a command.
/// </summary>
public record TelemetrySampleDto(
    string Id,
    string SchemaVersion,
    DateTime TimestampUtc,
    string? SessionId,
    string? RunId,
    string EquipmentId,
    string SignalId,
    double? NumericValue,
    string? TextValue,
    string ValueType,
    string Quality,
    string Source,
    string Origin,
    string? CorrelationId);

/// <summary>One sample proposed for historization by the simulator bridge or a connector.</summary>
public record IngestTelemetrySampleRequest
{
    public DateTime TimestampUtc { get; init; } = DateTime.UtcNow;

    [MaxLength(64)]
    public string? SessionId { get; init; }

    [MaxLength(64)]
    public string? RunId { get; init; }

    [Required, MinLength(1), MaxLength(200)]
    public string EquipmentId { get; init; } = string.Empty;

    [Required, MinLength(1), MaxLength(200)]
    public string SignalId { get; init; } = string.Empty;

    public double? NumericValue { get; init; }

    [MaxLength(1024)]
    public string? TextValue { get; init; }

    public string ValueType { get; init; } = "float";

    public string Quality { get; init; } = "good";

    public string Source { get; init; } = "simulated";

    public string Origin { get; init; } = "simulation";

    [MaxLength(128)]
    public string? CorrelationId { get; init; }
}

/// <summary>Bounded batch of telemetry samples. Batching amortizes per-request overhead.</summary>
public record IngestTelemetryBatchRequest
{
    public List<IngestTelemetrySampleRequest> Samples { get; init; } = [];

    /// <summary>
    /// Identity of the producer (simulator or connector). Used for rate limiting and diagnostics;
    /// it is not authentication (interim boundary until S42).
    /// </summary>
    [MaxLength(128)]
    public string? SourceId { get; init; }
}

/// <summary>An immutable event/command/state-transition/alarm/authority/fault document (S40).</summary>
public record HistorizedEventDto(
    string Id,
    string SchemaVersion,
    DateTime TimestampUtc,
    string Kind,
    string? SessionId,
    string? RunId,
    string? EquipmentId,
    string Severity,
    string Code,
    string Payload,
    string Source,
    long? Sequence,
    string? CorrelationId);

/// <summary>One event proposed for historization.</summary>
public record IngestHistorizedEventRequest
{
    public DateTime TimestampUtc { get; init; } = DateTime.UtcNow;

    public string Kind { get; init; } = "event";

    [MaxLength(64)]
    public string? SessionId { get; init; }

    [MaxLength(64)]
    public string? RunId { get; init; }

    [MaxLength(200)]
    public string? EquipmentId { get; init; }

    public string Severity { get; init; } = "info";

    [MaxLength(200)]
    public string Code { get; init; } = string.Empty;

    [MaxLength(4096)]
    public string Payload { get; init; } = "{}";

    public string Source { get; init; } = "simulation";

    public long? Sequence { get; init; }

    [MaxLength(128)]
    public string? CorrelationId { get; init; }
}

/// <summary>Bounded batch of historized events.</summary>
public record IngestHistorizedEventBatchRequest
{
    public List<IngestHistorizedEventRequest> Events { get; init; } = [];

    [MaxLength(128)]
    public string? SourceId { get; init; }
}

/// <summary>
/// Ingestion acknowledgement. <see cref="Accepted"/> counts documents actually stored after
/// sampling; <see cref="Sampled"/> are samples selected by policy; <see cref="Dropped"/> are
/// rejected by sampling; <see cref="Rejected"/> failed validation.
/// </summary>
public record HistorianIngestResultDto(
    int Accepted,
    int Sampled,
    int Dropped,
    int Rejected,
    bool Enabled,
    bool Degraded,
    string Status,
    List<string> Diagnostics);

/// <summary>Deterministic page of historian documents.</summary>
public record HistorianPageDto<T>(
    IReadOnlyList<T> Items,
    long TotalCount,
    int Skip,
    int Limit);

/// <summary>Historian diagnostics: enabled state, retention policy, storage estimate and policies.</summary>
public record HistorianStatusDto(
    bool Enabled,
    bool RetentionEnabled,
    string SchemaVersion,
    long SampleDocumentCount,
    long EventDocumentCount,
    long EstimatedStorageBytes,
    int SampledSignalCount,
    int MaxAgeDays,
    long MaxSamplesPerSignal,
    long MaxEventDocuments,
    DateTime? LastPrunedAtUtc,
    long LastPruneDeletedCount,
    List<HistorianSignalPolicyDto> Policies);

/// <summary>Exposes one effective per-signal sampling policy for diagnostics.</summary>
public record HistorianSignalPolicyDto(
    string EquipmentId,
    string SignalId,
    string Mode,
    int IntervalMilliseconds,
    double Deadband);
