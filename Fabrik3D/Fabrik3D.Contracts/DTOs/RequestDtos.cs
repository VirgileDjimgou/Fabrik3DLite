using System.ComponentModel.DataAnnotations;

namespace Fabrik3D.Contracts.DTOs;

public record CreateJobRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    [MaxLength(1000)]
    public string Description { get; init; } = string.Empty;

    public string MachineMode { get; init; } = "Automatic";

    public List<CreateTaskRequest> Tasks { get; init; } = new();

    public Dictionary<string, string> Metadata { get; init; } = new();

    /// <summary>
    /// Server-authoritative target cell (S52). When omitted the composer resolves the default cell.
    /// </summary>
    [MaxLength(100)]
    public string? TargetCellId { get; init; }

    /// <summary>Optional named cell template the operator selected (S52).</summary>
    [MaxLength(100)]
    public string? CellTemplateId { get; init; }

    /// <summary>Educational scenario/recipe driving the job (S52).</summary>
    [MaxLength(100)]
    public string? ScenarioId { get; init; }

    /// <summary>Operator priority 0 (normal) to 9 (highest). Informational; no scheduling optimizer (S52).</summary>
    [Range(0, 9)]
    public int Priority { get; init; }

    /// <summary>Pallet layout used to generate deterministic tasks from occupied slots (S52).</summary>
    public PalletLayoutRequest? PalletLayout { get; init; }

    /// <summary>Occupied row/column slots; the server generates one task per slot in stable order (S52).</summary>
    public List<PalletSlotRequest> OccupiedSlots { get; init; } = new();

    /// <summary>Part type applied to generated tasks (S52).</summary>
    [MaxLength(100)]
    public string PartType { get; init; } = "part";
}

/// <summary>Pallet layout declared by the job composer (S52). Rows/columns are 1-based counts.</summary>
public record PalletLayoutRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string PalletId { get; init; } = "pallet-1";

    [Range(1, 32)]
    public int Rows { get; init; } = 1;

    [Range(1, 32)]
    public int Columns { get; init; } = 1;
}

/// <summary>Zero-based occupied pallet slot (S52).</summary>
public record PalletSlotRequest
{
    [Range(0, 31)]
    public int Row { get; init; }

    [Range(0, 31)]
    public int Column { get; init; }
}

public record CreateTaskRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    [MaxLength(500)]
    public string Description { get; init; } = string.Empty;

    public string PartType { get; init; } = string.Empty;

    public string? PalletId { get; init; }

    public int SlotRow { get; init; }

    public int SlotColumn { get; init; }
}

/// <summary>
/// Payload the simulator sends to update the current machine state.
/// </summary>
public record UpdateMachineStateRequest
{
    public string? SimulationSessionId { get; init; }
    public string? SimulatorId { get; init; }
    public string MachineMode { get; init; } = "Automatic";
    public string SimulationStatus { get; init; } = "Idle";
    public string RobotState { get; init; } = "IDLE";
    public string CncState { get; init; } = "IDLE";
    public string CurrentPhase { get; init; } = string.Empty;
    public string? CurrentPalletId { get; init; }
    public string? CurrentTaskId { get; init; }
    public string? CurrentPartId { get; init; }
    public int CurrentSlotRow { get; init; }
    public int CurrentSlotColumn { get; init; }
    public bool IsRunning { get; init; }
    public bool IsPaused { get; init; }
}

/// <summary>
/// Payload the simulator sends to update simulation session live state.
/// </summary>
public record UpdateSimulationStateRequest
{
    public string Status { get; init; } = "Running";
    public string CurrentPhase { get; init; } = string.Empty;
    public string? CurrentPalletId { get; init; }
    public string? CurrentTaskId { get; init; }
    public string? CurrentPartId { get; init; }
    public int MachinedCount { get; init; }
    public int RemainingCount { get; init; }
    public int TotalCount { get; init; }
    public bool IsPaused { get; init; }
    public string? SimulatorId { get; init; }
    public string? CorrelationId { get; init; }

    /// <summary>Educational scenario id driving this session, when active.</summary>
    public string? ScenarioId { get; init; }

    /// <summary>Active scenario activity id.</summary>
    public string? ScenarioActivityId { get; init; }

    /// <summary>Scenario progress percent 0..100.</summary>
    public int? ScenarioProgress { get; init; }
}

/// <summary>
/// Payload the simulator sends to claim an existing runnable job.
/// </summary>
public record ClaimJobRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string SimulatorId { get; init; } = string.Empty;

    [MaxLength(100)]
    public string? CorrelationId { get; init; }
}

/// <summary>
/// Payload the simulator sends to update the status of a machining task.
/// The caller must own the session the task's job is bound to.
/// </summary>
public record UpdateTaskStatusRequest
{
    [Required, MinLength(1), MaxLength(50)]
    public string Status { get; init; } = string.Empty;

    [Required, MinLength(1)]
    public string SimulationSessionId { get; init; } = string.Empty;

    [Required, MinLength(1), MaxLength(100)]
    public string SimulatorId { get; init; } = string.Empty;

    [MaxLength(500)]
    public string? ErrorMessage { get; init; }
}

/// <summary>
/// Payload the simulator sends to prove the session is still alive.
/// </summary>
public record HeartbeatRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string SimulatorId { get; init; } = string.Empty;
}

/// <summary>
/// Operator intent to start a job through the server-authoritative dispatch path (S51).
/// The server resolves the target cell/simulator; the client never selects a production target.
/// </summary>
public record StartJobDispatchRequest
{
    /// <summary>
    /// Optional preferred cell. When omitted the server resolves the single compatible target.
    /// A requested cell that is not compatible is rejected deterministically.
    /// </summary>
    [MaxLength(100)]
    public string? TargetCellId { get; init; }

    /// <summary>Optional explicit simulator id (used by tests and targeted deployments).</summary>
    [MaxLength(100)]
    public string? SimulatorId { get; init; }
}

/// <summary>
/// Simulator claim/acknowledgement of a targeted execution request (S51). The server accepts it
/// only from the assigned simulator with a matching tenant, correlation id and session.
/// </summary>
public record DispatchAckRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string SimulatorId { get; init; } = string.Empty;

    [Required, MinLength(1), MaxLength(100)]
    public string CorrelationId { get; init; } = string.Empty;

    /// <summary>Cell the simulator believes it is executing on; must match the assigned target.</summary>
    [MaxLength(100)]
    public string? TargetCellId { get; init; }

    /// <summary>Session the simulator adopted; must match the job's session.</summary>
    [MaxLength(64)]
    public string? SimulationSessionId { get; init; }

    /// <summary>Reported dispatch state: Acknowledged or Running.</summary>
    [MaxLength(32)]
    public string State { get; init; } = "Acknowledged";

    [MaxLength(500)]
    public string? FailureReason { get; init; }
}

/// <summary>
/// Saves a named cell template. <c>Content</c> is the versioned cell file
/// JSON (schemaVersion 0.9, 1.0 or 1.1).
/// </summary>
public record SaveCellTemplateRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required, MinLength(1)]
    public string Content { get; init; } = string.Empty;
}
