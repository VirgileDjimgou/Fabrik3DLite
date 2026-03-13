using Fabrik3D.Contracts.Enums;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

public class SimulationSession
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string JobId { get; set; } = null!;

    [BsonRepresentation(BsonType.String)]
    public SimulationStatus Status { get; set; } = SimulationStatus.Idle;

    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? EndedAtUtc { get; set; }

    public bool IsPaused { get; set; }

    public string CurrentPhase { get; set; } = string.Empty;

    public string? CurrentPalletId { get; set; }

    public string? CurrentTaskId { get; set; }

    public string? CurrentPartId { get; set; }

    public int MachinedCount { get; set; }

    public int RemainingCount { get; set; }

    public int TotalCount { get; set; }

    public DateTime LastHeartbeatUtc { get; set; } = DateTime.UtcNow;
}
