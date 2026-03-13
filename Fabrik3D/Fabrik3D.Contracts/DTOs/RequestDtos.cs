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
}
