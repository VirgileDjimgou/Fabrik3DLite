using Fabrik3D.Contracts.Enums;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

/// <summary>
/// Server-domain control authority for one equipment/actuator scope. The document id <em>is</em> the
/// scope, which makes "exactly one authority per scope" a persistence-level invariant: two concurrent
/// acquisitions cannot both insert the same id.
/// </summary>
public class ControlAuthority
{
    /// <summary>Equipment/actuator scope, for example <c>cell-1</c>.</summary>
    [BsonId]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.String)]
    public ControlAuthorityMode Mode { get; set; } = ControlAuthorityMode.LocalSimulation;

    [BsonRepresentation(BsonType.String)]
    public ControlAuthorityState State { get; set; } = ControlAuthorityState.Available;

    [BsonRepresentation(BsonType.String)]
    public ControlAuthorityOwnerKind? OwnerKind { get; set; }

    public string? OwnerId { get; set; }

    public DateTime? AcquiredAtUtc { get; set; }

    public DateTime? LeaseExpiresAtUtc { get; set; }

    public DateTime? LastHeartbeatUtc { get; set; }

    /// <summary>Populated only when <see cref="State"/> is Degraded.</summary>
    public string? DegradedReason { get; set; }

    public string? CorrelationId { get; set; }

    /// <summary>Optimistic concurrency guard; bumped on every transition.</summary>
    public int Version { get; set; }

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
