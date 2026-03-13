using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Entities;

namespace Fabrik3D.Domain.Mapping;

public static class EntityMapper
{
    public static JobDto ToDto(this Job e) => new(
        e.Id, e.Name, e.Description,
        e.Status.ToString(), e.MachineMode.ToString(),
        e.CreatedAtUtc, e.UpdatedAtUtc,
        e.StartedAtUtc, e.CompletedAtUtc, e.PausedAtUtc, e.StoppedAtUtc,
        e.CurrentTaskIndex, e.ProgressPercent,
        e.SimulationSessionId, e.Metadata);

    public static TaskDto ToDto(this MachiningTask e) => new(
        e.Id, e.JobId, e.Name, e.Description,
        e.Status.ToString(), e.SequenceOrder,
        e.PartType, e.PalletId, e.SlotRow, e.SlotColumn,
        e.CreatedAtUtc, e.UpdatedAtUtc,
        e.StartedAtUtc, e.CompletedAtUtc, e.ErrorMessage);

    public static SimulationSessionDto ToDto(this SimulationSession e) => new(
        e.Id, e.JobId, e.Status.ToString(),
        e.StartedAtUtc, e.EndedAtUtc, e.IsPaused,
        e.CurrentPhase, e.CurrentPalletId, e.CurrentTaskId, e.CurrentPartId,
        e.MachinedCount, e.RemainingCount, e.TotalCount,
        e.LastHeartbeatUtc);

    public static AlarmDto ToDto(this Alarm e) => new(
        e.Id, e.Code, e.Title, e.Message,
        e.Severity.ToString(), e.Source,
        e.JobId, e.SimulationSessionId, e.CreatedAtUtc,
        e.Acknowledged, e.AcknowledgedAtUtc, e.AcknowledgedBy);

    public static OperatorMessageDto ToDto(this OperatorMessage e) => new(
        e.Id, e.Title, e.Message, e.Type, e.Source,
        e.JobId, e.SimulationSessionId, e.CreatedAtUtc,
        e.Read, e.ReadAtUtc);

    public static MachineStateDto ToDto(this MachineState e) => new(
        e.Id, e.SimulationSessionId,
        e.MachineMode.ToString(), e.SimulationStatus.ToString(),
        e.RobotState, e.CncState, e.CurrentPhase,
        e.CurrentPalletId, e.CurrentTaskId, e.CurrentPartId,
        e.CurrentSlotRow, e.CurrentSlotColumn,
        e.IsRunning, e.IsPaused, e.LastUpdatedAtUtc);
}
