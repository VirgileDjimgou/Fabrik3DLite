using System.ComponentModel.DataAnnotations;

namespace Fabrik3D.Server.DTOs;

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
