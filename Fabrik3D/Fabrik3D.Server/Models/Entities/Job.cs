using Fabrik3D.Server.Models.Enums;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Server.Models.Entities;

public class Job
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    public JobStatus Status { get; set; } = JobStatus.Created;

    [BsonRepresentation(BsonType.String)]
    public MachineMode MachineMode { get; set; } = MachineMode.Automatic;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? StartedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    public DateTime? PausedAtUtc { get; set; }

    public DateTime? StoppedAtUtc { get; set; }

    public int CurrentTaskIndex { get; set; }

    public int ProgressPercent { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    public string? SimulationSessionId { get; set; }

    public Dictionary<string, string> Metadata { get; set; } = new();
}
