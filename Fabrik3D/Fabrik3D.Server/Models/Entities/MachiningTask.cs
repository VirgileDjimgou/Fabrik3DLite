using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Server.Models.Entities;

public class MachiningTask
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string JobId { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    public Enums.TaskStatus Status { get; set; } = Enums.TaskStatus.Pending;

    public int SequenceOrder { get; set; }

    public string PartType { get; set; } = string.Empty;

    public string? PalletId { get; set; }

    public int SlotRow { get; set; }

    public int SlotColumn { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? StartedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    public string? ErrorMessage { get; set; }
}
