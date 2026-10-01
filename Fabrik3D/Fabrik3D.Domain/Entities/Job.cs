using Fabrik3D.Contracts.Enums;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

public class Job
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary (S43). Null on legacy documents; readers treat it as the default organization.</summary>
    public string? OrganizationId { get; set; }

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

    /// <summary>
    /// Server-authoritative dispatch target cell (S51). Null on legacy/local records.
    /// </summary>
    public string? TargetCellId { get; set; }

    /// <summary>
    /// Simulator the server assigned to execute this job (S51). Null until a dispatch is requested.
    /// </summary>
    public string? AssignedSimulatorId { get; set; }

    /// <summary>
    /// Dispatch lifecycle state (S51). Defaults to <see cref="DispatchState.None"/> for legacy records.
    /// </summary>
    [BsonRepresentation(BsonType.String)]
    public DispatchState DispatchState { get; set; } = DispatchState.None;

    /// <summary>
    /// Correlation id of the dispatch command that assigned this job (S51). Used to correlate the
    /// targeted execution request with the simulator claim/ACK.
    /// </summary>
    public string? DispatchCorrelationId { get; set; }

    /// <summary>When the dispatch was requested (S51).</summary>
    public DateTime? DispatchedAtUtc { get; set; }

    /// <summary>When the assigned simulator acknowledged the dispatch (S51).</summary>
    public DateTime? DispatchAcknowledgedAtUtc { get; set; }

    /// <summary>Deadline after which an unacknowledged dispatch becomes <see cref="DispatchState.TimedOut"/> (S51).</summary>
    public DateTime? DispatchTimeoutAtUtc { get; set; }

    /// <summary>Human-readable failure/timeout reason for the dispatch (S51).</summary>
    public string? DispatchFailureReason { get; set; }

    /// <summary>Operator priority 0 (normal) to 9 (highest); informational only (S52).</summary>
    public int Priority { get; set; }

    /// <summary>Educational scenario/recipe driving the job (S52). Null on legacy records.</summary>
    public string? ScenarioId { get; set; }

    /// <summary>Optional named cell template selected in the composer (S52).</summary>
    public string? CellTemplateId { get; set; }

    /// <summary>Pallet layout the tasks were generated from (S52). Null on legacy records.</summary>
    public string? PalletId { get; set; }

    public int PalletRows { get; set; }

    public int PalletColumns { get; set; }

    /// <summary>Server-derived count of required tasks (S52).</summary>
    public int TaskCount { get; set; }

    /// <summary>Server-derived count of completed required tasks (S52).</summary>
    public int CompletedTaskCount { get; set; }

    /// <summary>Job definition schema version; 1 = legacy, 2 = composer (S52).</summary>
    public int SchemaVersion { get; set; } = 1;

    /// <summary>When the job reached the Failed terminal state (S52). Never overwritten once set.</summary>
    public DateTime? FailedAtUtc { get; set; }

    /// <summary>When the job reached the Cancelled terminal state (S52). Never overwritten once set.</summary>
    public DateTime? CancelledAtUtc { get; set; }

    public Dictionary<string, string> Metadata { get; set; } = new();

    /// <summary>Optimistic concurrency guard; bumped on every update.</summary>
    public int Version { get; set; }
}
