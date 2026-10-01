using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Domain.Entities;

public class MachiningTask
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary (S43). Null on legacy documents; readers treat it as the default organization.</summary>
    public string? OrganizationId { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    public string JobId { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    public TaskStatusEnum Status { get; set; } = TaskStatusEnum.Pending;

    public int SequenceOrder { get; set; }

    public string PartType { get; set; } = string.Empty;

    public string? PalletId { get; set; }

    public int SlotRow { get; set; }

    public int SlotColumn { get; set; }

    /// <summary>
    /// Stable slot key (<c>palletId:R{row}:C{col}</c>) used for deterministic generation and
    /// duplicate detection (S52). Null on legacy records.
    /// </summary>
    public string? SlotKey { get; set; }

    /// <summary>
    /// Whether this task is required for job completion (S52). Legacy records default to required.
    /// </summary>
    public bool IsRequired { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? StartedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    public string? ErrorMessage { get; set; }

    /// <summary>Optimistic concurrency guard; bumped on every update.</summary>
    public int Version { get; set; }
}
