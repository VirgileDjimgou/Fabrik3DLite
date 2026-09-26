using Fabrik3D.Contracts.Enums;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

public class Alarm
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary (S43). Null on legacy documents; readers treat it as the default organization.</summary>
    public string? OrganizationId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    public AlarmSeverity Severity { get; set; } = AlarmSeverity.Info;

    public string Source { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.ObjectId)]
    public string? JobId { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    public string? SimulationSessionId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public bool Acknowledged { get; set; }

    public DateTime? AcknowledgedAtUtc { get; set; }

    public string? AcknowledgedBy { get; set; }

    [BsonRepresentation(BsonType.String)]
    public AlarmLifecycleState LifecycleState { get; set; } = AlarmLifecycleState.Active;
    public DateTime FirstOccurredAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastOccurredAtUtc { get; set; } = DateTime.UtcNow;
    public int OccurrenceCount { get; set; } = 1;
    public string Cause { get; set; } = string.Empty;
    public string Consequence { get; set; } = string.Empty;
    public string OperatorGuidance { get; set; } = string.Empty;
    public List<AlarmAuditEntry> AuditTrail { get; set; } = [];
}
