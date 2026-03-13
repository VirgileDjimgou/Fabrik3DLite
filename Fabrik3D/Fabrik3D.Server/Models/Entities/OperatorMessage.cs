using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Server.Models.Entities;

public class OperatorMessage
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    public string Title { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string Type { get; set; } = "Info";

    public string Source { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.ObjectId)]
    public string? JobId { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    public string? SimulationSessionId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public bool Read { get; set; }

    public DateTime? ReadAtUtc { get; set; }
}
