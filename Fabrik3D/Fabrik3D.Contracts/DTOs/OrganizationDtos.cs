using System.ComponentModel.DataAnnotations;

namespace Fabrik3D.Contracts.DTOs;

/// <summary>Tenant boundary as returned by the API (S43). Never contains secrets.</summary>
public record OrganizationDto(
    string Id,
    string Name,
    string Slug,
    IReadOnlyDictionary<string, string> Settings,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    int Version);

/// <summary>Compact organization reference for context/selection payloads.</summary>
public record OrganizationSummaryDto(string Id, string Name, string Slug);

/// <summary>A subject's role/status inside one organization.</summary>
public record MembershipDto(
    string Id,
    string OrganizationId,
    string Subject,
    string Role,
    string Status,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    int Version);

/// <summary>A class/cohort inside one organization.</summary>
public record TrainingClassDto(
    string Id,
    string OrganizationId,
    string Name,
    string Description,
    IReadOnlyList<string> InstructorSubjects,
    IReadOnlyList<string> LearnerSubjects,
    IReadOnlyDictionary<string, string> ScheduleMetadata,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    int Version);

/// <summary>A resource (scenario/template/cell file) assigned to an organization or class.</summary>
public record TrainingResourceAssignmentDto(
    string Id,
    string OrganizationId,
    string? ClassId,
    string Kind,
    string ResourceId,
    DateTime CreatedAtUtc);

/// <summary>
/// The organization context the server resolved for the current request. Frontends use it for
/// display/selection only; the server never trusts a client-supplied value.
/// </summary>
public record TenantContextDto(
    string OrganizationId,
    string OrganizationName,
    bool PlatformAdmin,
    bool SingleOrganization,
    bool ClientSelectionAccepted,
    IReadOnlyList<OrganizationSummaryDto> AvailableOrganizations);

/// <summary>Request to create an organization. Admin-only.</summary>
public record CreateOrganizationRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    /// <summary>Stable URL-safe slug; defaults to a slug derived from the name.</summary>
    [MaxLength(120)]
    public string? Slug { get; init; }

    public Dictionary<string, string> Settings { get; init; } = new();
}

/// <summary>Request to create or update a membership. Admin-only.</summary>
public record UpsertMembershipRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Subject { get; init; } = string.Empty;

    [Required, MinLength(1), MaxLength(50)]
    public string Role { get; init; } = string.Empty;

    /// <summary>Active, Suspended or Revoked. Defaults to Active.</summary>
    [MaxLength(20)]
    public string? Status { get; init; }
}

/// <summary>Request to create or update a class. Instructor/Admin.</summary>
public record UpsertTrainingClassRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; init; } = string.Empty;

    public List<string> InstructorSubjects { get; init; } = [];

    public List<string> LearnerSubjects { get; init; } = [];

    public Dictionary<string, string> ScheduleMetadata { get; init; } = new();
}

/// <summary>Request to assign a resource to the active organization and optional class.</summary>
public record AssignTrainingResourceRequest
{
    /// <summary>Scenario, CellTemplate or TemplateFile.</summary>
    [Required, MinLength(1), MaxLength(40)]
    public string Kind { get; init; } = string.Empty;

    [Required, MinLength(1), MaxLength(300)]
    public string ResourceId { get; init; } = string.Empty;

    [MaxLength(40)]
    public string? ClassId { get; init; }
}

/// <summary>Result of the idempotent tenancy migration.</summary>
public record TenantMigrationResultDto(
    string OrganizationId,
    bool AlreadyMigrated,
    IReadOnlyDictionary<string, long> MigratedDocuments,
    DateTime CompletedAtUtc);
