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

    /// <summary>Identifier of the simulator that owns (claimed) this session.</summary>
    public string? SimulatorId { get; set; }

    /// <summary>Correlation id of the command that created/claimed this session.</summary>
    public string? CorrelationId { get; set; }

    /// <summary>Educational scenario currently driving this session.</summary>
    public string? ScenarioId { get; set; }

    /// <summary>Active scenario activity id (ordered learning step).</summary>
    public string? ScenarioActivityId { get; set; }

    /// <summary>Scenario progress percent 0..100.</summary>
    public int ScenarioProgress { get; set; }

    /// <summary>Optimistic concurrency guard; bumped on every update.</summary>
    public int Version { get; set; }
}
