using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Organizations;

/// <summary>
/// Tenant boundary (S43). The id is a stable string (not an ObjectId) so the default organization
/// can have the deterministic id <see cref="TenantSchema.DefaultOrganizationId"/> for legacy data.
/// </summary>
public class Organization
{
    [BsonId]
    public string Id { get; set; } = null!;

    /// <summary>Historian/organization document schema version.</summary>
    public string SchemaVersion { get; set; } = TenantSchema.Version;

    public string Name { get; set; } = string.Empty;

    /// <summary>Stable, URL-safe unique identifier.</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>Small, non-secret organization preferences (locale, retention hints, notices).</summary>
    public Dictionary<string, string> Settings { get; set; } = new();

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>Optimistic concurrency guard; bumped on every update.</summary>
    public int Version { get; set; }
}

/// <summary>A principal's membership in one organization (S43).</summary>
public class Membership
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary; backfilled from the ambient scope on write.</summary>
    public string OrganizationId { get; set; } = null!;

    /// <summary>External subject (<c>sub</c>) of the member.</summary>
    public string Subject { get; set; } = string.Empty;

    /// <summary>Role within the organization (one of the documented Fabrik3D roles).</summary>
    public string Role { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    public MembershipStatus Status { get; set; } = MembershipStatus.Active;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public int Version { get; set; }
}

/// <summary>
/// A class/cohort inside one organization (S43). Classes are tenancy boundaries for learners and
/// instructors; they are deliberately not a full academic system.
/// </summary>
public class TrainingClass
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary; backfilled from the ambient scope on write.</summary>
    public string OrganizationId { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>Subjects assigned as instructors for this class.</summary>
    public List<string> InstructorSubjects { get; set; } = [];

    /// <summary>Subjects enrolled as learners in this class.</summary>
    public List<string> LearnerSubjects { get; set; } = [];

    /// <summary>Optional schedule metadata (start/end/room) kept free-form and non-authoritative.</summary>
    public Dictionary<string, string> ScheduleMetadata { get; set; } = new();

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public int Version { get; set; }
}

/// <summary>The kind of resource assigned to an organization or class (S43).</summary>
public enum TrainingResourceKind
{
    Scenario,
    CellTemplate,
    TemplateFile,
}

/// <summary>Assignment of a scenario/template/cell file to an organization and optional class (S43).</summary>
public class TrainingResourceAssignment
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary; backfilled from the ambient scope on write.</summary>
    public string OrganizationId { get; set; } = null!;

    /// <summary>Class id when the resource is assigned to a class; null for an organization-wide assignment.</summary>
    [BsonRepresentation(BsonType.ObjectId)]
    public string? ClassId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public TrainingResourceKind Kind { get; set; } = TrainingResourceKind.Scenario;

    /// <summary>Stable resource identifier (scenario id, template id or file path).</summary>
    public string ResourceId { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
