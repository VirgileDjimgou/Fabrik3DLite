using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Control;
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
        e.SimulationSessionId, e.Metadata, e.Version);

    public static TaskDto ToDto(this MachiningTask e) => new(
        e.Id, e.JobId, e.Name, e.Description,
        e.Status.ToString(), e.SequenceOrder,
        e.PartType, e.PalletId, e.SlotRow, e.SlotColumn,
        e.CreatedAtUtc, e.UpdatedAtUtc,
        e.StartedAtUtc, e.CompletedAtUtc, e.ErrorMessage, e.Version);

    public static SimulationSessionDto ToDto(this SimulationSession e) => new(
        e.Id, e.JobId, e.Status.ToString(),
        e.StartedAtUtc, e.EndedAtUtc, e.IsPaused,
        e.CurrentPhase, e.CurrentPalletId, e.CurrentTaskId, e.CurrentPartId,
        e.MachinedCount, e.RemainingCount, e.TotalCount,
        e.LastHeartbeatUtc, e.SimulatorId, e.CorrelationId, e.Version,
        e.ScenarioId, e.ScenarioActivityId, e.ScenarioProgress);

    public static AlarmDto ToDto(this Alarm e) => new(
        e.Id, e.Code, e.Title, e.Message,
        e.Severity.ToString(), e.Source,
        e.JobId, e.SimulationSessionId, e.CreatedAtUtc,
        e.Acknowledged, e.AcknowledgedAtUtc, e.AcknowledgedBy,
        e.LifecycleState.ToString(), e.FirstOccurredAtUtc, e.LastOccurredAtUtc, e.OccurrenceCount,
        e.Cause, e.Consequence, e.OperatorGuidance,
        e.AuditTrail.Select(a => new AlarmAuditDto(a.Action, a.By, a.AtUtc, a.Note)).ToList());

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

    public static CellTemplateDto ToDto(this CellTemplate e) => new(
        e.Id, e.Name, e.SchemaVersion, e.Content,
        e.CreatedAtUtc, e.UpdatedAtUtc, e.Version,
        e.CreatedBy, e.UpdatedBy);

    public static ControlAuthorityDto ToDto(this ControlAuthority e, bool isPersisted = true) => new(
        e.Id,
        ControlAuthorityRules.ToWire(e.Mode),
        ControlAuthorityRules.ToWire(e.State),
        e.OwnerId,
        e.OwnerKind is { } kind ? ControlAuthorityRules.ToWire(kind) : null,
        e.AcquiredAtUtc,
        e.LeaseExpiresAtUtc,
        e.LastHeartbeatUtc,
        e.Version,
        e.DegradedReason,
        e.CorrelationId,
        isPersisted,
        null);

    public static ControlAuthorityEventDto ToDto(this ControlAuthorityEvent e) => new(
        e.Id, e.Scope, e.EventType, e.Mode, e.PreviousMode,
        e.OwnerId, e.PreviousOwnerId, e.CorrelationId, e.Detail, e.TimestampUtc,
        e.ActorId, e.ActorRole);
}
