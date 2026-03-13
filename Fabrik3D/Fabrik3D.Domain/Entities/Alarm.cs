using Fabrik3D.Contracts.Enums;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

public class Alarm
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

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
}
