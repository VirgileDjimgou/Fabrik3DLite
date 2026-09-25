using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

/// <summary>
/// Append-only audit entry for a control-authority transition. There is no update or delete path:
/// the audit trail is immutable by construction.
/// </summary>
public class ControlAuthorityEvent
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    public string Scope { get; set; } = string.Empty;

    /// <summary>
    /// One of authority_acquired, authority_released, authority_takeover, authority_degraded,
    /// authority_quiesce, authority_conflict.
    /// </summary>
    public string EventType { get; set; } = string.Empty;

    public string? Mode { get; set; }

    public string? PreviousMode { get; set; }

    public string? OwnerId { get; set; }

    public string? PreviousOwnerId { get; set; }

    public string? CorrelationId { get; set; }

    public string? Detail { get; set; }

    /// <summary>Authenticated subject that triggered the transition (S42 audit identity).</summary>
    public string? ActorId { get; set; }

    /// <summary>Role of the authenticated subject at transition time (S42 audit identity).</summary>
    public string? ActorRole { get; set; }

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
}
