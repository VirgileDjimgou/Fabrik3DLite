using Fabrik3D.Server.Models.Enums;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Server.Models.Entities;

public class MachineState
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string? SimulationSessionId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public MachineMode MachineMode { get; set; } = MachineMode.Manual;

    [BsonRepresentation(BsonType.String)]
    public SimulationStatus SimulationStatus { get; set; } = SimulationStatus.Idle;

    public string RobotState { get; set; } = "IDLE";

    public string CncState { get; set; } = "IDLE";

    public string CurrentPhase { get; set; } = string.Empty;

    public string? CurrentPalletId { get; set; }

    public string? CurrentTaskId { get; set; }

    public string? CurrentPartId { get; set; }

    public int CurrentSlotRow { get; set; }

    public int CurrentSlotColumn { get; set; }

    public bool IsRunning { get; set; }

    public bool IsPaused { get; set; }

    public DateTime LastUpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
