using Fabrik3D.Domain.Historian;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

/// <summary>
/// An immutable, append-only historian document for an event, command, state transition,
/// alarm, acknowledgement, authority change or fault action (S40). <see cref="Payload"/> is a
/// bounded JSON string so malformed or oversized payloads can never grow storage without limit.
/// </summary>
public class HistorizedEvent
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Historian document schema version (<see cref="HistorianSchema.Version"/>).</summary>
    public string SchemaVersion { get; set; } = HistorianSchema.Version;

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

    /// <summary>Tenant boundary (S43). Null on legacy documents; readers treat it as the default organization.</summary>
    public string? OrganizationId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public HistorianEventKind Kind { get; set; } = HistorianEventKind.Event;

    public string? SessionId { get; set; }

    public string? RunId { get; set; }

    public string? EquipmentId { get; set; }

    /// <summary>Wire severity: info, warning, error or critical.</summary>
    public string Severity { get; set; } = "info";

    /// <summary>Stable diagnostic/alarm code.</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Bounded JSON payload. Never contains secrets.</summary>
    public string Payload { get; set; } = "{}";

    public string Source { get; set; } = "simulation";

    /// <summary>Monotonic sequence within the originating stream, when available.</summary>
    public long? Sequence { get; set; }

    public string? CorrelationId { get; set; }
}
