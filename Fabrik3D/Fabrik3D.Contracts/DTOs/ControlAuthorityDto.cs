namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Current control authority for one equipment/actuator scope. Additive surface; the same data is
/// pushed on the <c>ControlAuthorityChanged</c> hub event so the operator display is continuously
/// live rather than polled.
/// </summary>
public record ControlAuthorityDto(
    string Scope,
    string Mode,
    string State,
    string? OwnerId,
    string? OwnerKind,
    DateTime? AcquiredAtUtc,
    DateTime? LeaseExpiresAtUtc,
    DateTime? LastHeartbeatUtc,
    int Version,
    string? DegradedReason,
    string? CorrelationId,
    bool IsPersisted,
    string? Diagnostic);

/// <summary>
/// Immutable audit entry for an authority transition. Records are append-only and never mutated.
/// </summary>
public record ControlAuthorityEventDto(
    string Id,
    string Scope,
    string EventType,
    string? Mode,
    string? PreviousMode,
    string? OwnerId,
    string? PreviousOwnerId,
    string? CorrelationId,
    string? Detail,
    DateTime TimestampUtc,
    string? ActorId = null,
    string? ActorRole = null);
