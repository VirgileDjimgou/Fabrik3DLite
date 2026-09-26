using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Tenancy;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Organization, membership, class and training-resource administration (S43). Every tenant-scoped
/// operation goes through a repository that filters by the ambient organization; administration of
/// another organization requires a platform admin or an organization-scoped administrator.
/// </summary>
public class OrganizationService
{
    private readonly OrganizationRepository _organizations;
    private readonly MembershipRepository _memberships;
    private readonly TrainingClassRepository _classes;
    private readonly TrainingResourceRepository _resources;
    private readonly TenantMigrationService _migration;
    private readonly ITenantContext _tenant;
    private readonly ICurrentIdentity _identity;
    private readonly TenancyOptions _options;
    private readonly ILogger<OrganizationService> _log;

    public OrganizationService(
        OrganizationRepository organizations,
        MembershipRepository memberships,
        TrainingClassRepository classes,
        TrainingResourceRepository resources,
        TenantMigrationService migration,
        ITenantContext tenant,
        ICurrentIdentity identity,
        IOptions<TenancyOptions> options,
        ILogger<OrganizationService> log)
    {
        _organizations = organizations;
        _memberships = memberships;
        _classes = classes;
        _resources = resources;
        _migration = migration;
        _tenant = tenant;
        _identity = identity;
        _options = options.Value;
        _log = log;
    }

    // ── Context ─────────────────────────────────────────────────────

    public async Task<TenantContextDto> GetContextAsync()
    {
        var scope = _tenant.Scope ?? TenantScope.Default;
        var available = new List<OrganizationSummaryDto>();

        if (_identity.IsAuthenticated)
        {
            var memberships = await _memberships.GetActiveBySubjectAsync(_identity.Subject);
            foreach (var organizationId in memberships.Select(m => m.OrganizationId).Distinct(StringComparer.Ordinal))
            {
                var organization = await _organizations.GetByIdAsync(organizationId);
                if (organization is not null)
                {
                    available.Add(new OrganizationSummaryDto(organization.Id, organization.Name, organization.Slug));
                }
            }
        }

        var current = await _organizations.GetByIdAsync(scope.OrganizationId);
        if (current is not null && available.All(o => o.Id != current.Id))
        {
            available.Insert(0, new OrganizationSummaryDto(current.Id, current.Name, current.Slug));
        }

        return new TenantContextDto(
            scope.OrganizationId,
            current?.Name ?? scope.OrganizationId,
            scope.IsPlatformAdmin,
            _options.SingleOrganization,
            _tenant.ClientSelectionAccepted,
            available);
    }

    // ── Organizations ───────────────────────────────────────────────

    public async Task<OrganizationDto> CreateOrganizationAsync(CreateOrganizationRequest request)
    {
        var slug = NormalizeSlug(string.IsNullOrWhiteSpace(request.Slug) ? request.Name : request.Slug!);
        if (await _organizations.GetBySlugAsync(slug) is not null)
        {
            throw new InvalidOperationException($"An organization with slug '{slug}' already exists.");
        }

        var organization = new Organization
        {
            Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString(),
            Name = request.Name.Trim(),
            Slug = slug,
            Settings = new Dictionary<string, string>(request.Settings, StringComparer.Ordinal),
        };

        await _organizations.CreateAsync(organization);

        // The creator becomes the first administrator of the new organization. Without this, a
        // freshly created organization would have no one able to administer it except a platform
        // admin (who is optional). The membership is idempotent and scoped to the new organization.
        if (_identity.IsAuthenticated && !string.IsNullOrWhiteSpace(_identity.Subject))
        {
            await _memberships.UpsertAsync(
                organization.Id, _identity.Subject, Fabrik3DRoles.Administrator, MembershipStatus.Active);
        }

        _log.LogInformation("[Server][Tenancy] Created organization id={OrganizationId} slug={Slug}", organization.Id, organization.Slug);
        return ToDto(organization);
    }

    public async Task<List<OrganizationDto>> GetOrganizationsAsync()
    {
        if (IsPlatformAdmin())
        {
            return (await _organizations.GetAllAsync()).Select(ToDto).ToList();
        }

        var memberships = await _memberships.GetActiveBySubjectAsync(_identity.Subject);
        var ids = memberships.Select(m => m.OrganizationId).Distinct(StringComparer.Ordinal).ToList();
        var result = new List<OrganizationDto>();
        foreach (var id in ids)
        {
            var organization = await _organizations.GetByIdAsync(id);
            if (organization is not null) result.Add(ToDto(organization));
        }
        return result.OrderBy(o => o.Name).ToList();
    }

    // ── Memberships ─────────────────────────────────────────────────

    public async Task<List<MembershipDto>> GetMembershipsAsync(string organizationId)
    {
        await EnsureCanAdministerAsync(organizationId);
        return (await _memberships.GetByOrganizationAsync(organizationId)).Select(ToDto).ToList();
    }

    public async Task<MembershipDto> UpsertMembershipAsync(string organizationId, UpsertMembershipRequest request)
    {
        await EnsureCanAdministerAsync(organizationId);

        var role = request.Role.Trim();
        if (!Fabrik3DRoles.IsKnown(role))
        {
            throw new InvalidOperationException($"'{role}' is not a known Fabrik3D role.");
        }

        if (await _organizations.GetByIdAsync(organizationId) is null)
        {
            throw new KeyNotFoundException($"Organization '{organizationId}' does not exist.");
        }

        var status = MembershipStatus.Active;
        if (!string.IsNullOrWhiteSpace(request.Status)
            && !Enum.TryParse(request.Status, true, out status))
        {
            throw new InvalidOperationException($"'{request.Status}' is not a valid membership status.");
        }

        var membership = await _memberships.UpsertAsync(organizationId, request.Subject.Trim(), role, status);
        _log.LogInformation(
            "[Server][Tenancy] Membership upsert organization={OrganizationId} subject={Subject} role={Role} status={Status}",
            organizationId, membership.Subject, membership.Role, membership.Status);
        return ToDto(membership);
    }

    public async Task<bool> DeleteMembershipAsync(string organizationId, string membershipId)
    {
        await EnsureCanAdministerAsync(organizationId);
        var membership = await _memberships.GetByIdAsync(membershipId);
        if (membership is null || membership.OrganizationId != organizationId) return false;
        await _memberships.DeleteAsync(membershipId);
        return true;
    }

    // ── Classes ─────────────────────────────────────────────────────

    public async Task<List<TrainingClassDto>> GetClassesAsync() =>
        (await _classes.GetAllAsync()).Select(ToDto).ToList();

    public async Task<TrainingClassDto> CreateClassAsync(UpsertTrainingClassRequest request)
    {
        var trainingClass = new TrainingClass
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            InstructorSubjects = Distinct(request.InstructorSubjects),
            LearnerSubjects = Distinct(request.LearnerSubjects),
            ScheduleMetadata = new Dictionary<string, string>(request.ScheduleMetadata, StringComparer.Ordinal),
        };

        await _classes.CreateAsync(trainingClass);
        _log.LogInformation("[Server][Tenancy] Created class id={ClassId} organization={OrganizationId}",
            trainingClass.Id, trainingClass.OrganizationId);
        return ToDto(trainingClass);
    }

    public async Task<TrainingClassDto?> UpdateClassAsync(string id, UpsertTrainingClassRequest request)
    {
        var trainingClass = await _classes.GetByIdAsync(id);
        if (trainingClass is null) return null;

        trainingClass.Name = request.Name.Trim();
        trainingClass.Description = request.Description;
        trainingClass.InstructorSubjects = Distinct(request.InstructorSubjects);
        trainingClass.LearnerSubjects = Distinct(request.LearnerSubjects);
        trainingClass.ScheduleMetadata = new Dictionary<string, string>(request.ScheduleMetadata, StringComparer.Ordinal);

        return await _classes.UpdateAsync(trainingClass) ? ToDto(trainingClass) : null;
    }

    public Task<bool> DeleteClassAsync(string id) => _classes.DeleteAsync(id);

    // ── Training resources ──────────────────────────────────────────

    public async Task<List<TrainingResourceAssignmentDto>> GetResourcesAsync(string? classId = null) =>
        (await _resources.GetAllAsync(classId)).Select(ToDto).ToList();

    public async Task<TrainingResourceAssignmentDto> AssignResourceAsync(AssignTrainingResourceRequest request)
    {
        if (!Enum.TryParse<TrainingResourceKind>(request.Kind, true, out var kind))
        {
            throw new InvalidOperationException($"'{request.Kind}' is not a known training-resource kind.");
        }

        if (!string.IsNullOrWhiteSpace(request.ClassId)
            && await _classes.GetByIdAsync(request.ClassId) is null)
        {
            // Cross-organization or unknown class: reject without revealing which.
            throw new KeyNotFoundException($"Class '{request.ClassId}' does not exist.");
        }

        var assignment = new TrainingResourceAssignment
        {
            Kind = kind,
            ResourceId = request.ResourceId.Trim(),
            ClassId = string.IsNullOrWhiteSpace(request.ClassId) ? null : request.ClassId,
        };

        await _resources.CreateAsync(assignment);
        _log.LogInformation(
            "[Server][Tenancy] Assigned resource kind={Kind} resource={ResourceId} organization={OrganizationId}",
            assignment.Kind, assignment.ResourceId, assignment.OrganizationId);
        return ToDto(assignment);
    }

    public Task<bool> DeleteResourceAsync(string id) => _resources.DeleteAsync(id);

    // ── Migration ───────────────────────────────────────────────────

    public async Task<TenantMigrationResultDto> MigrateAsync()
    {
        var report = await _migration.MigrateAsync();
        return new TenantMigrationResultDto(
            report.OrganizationId,
            report.AlreadyMigrated,
            report.MigratedDocuments,
            report.CompletedAtUtc);
    }

    // ── Helpers ─────────────────────────────────────────────────────

    private bool IsPlatformAdmin() => _tenant.Scope?.IsPlatformAdmin == true;

    private async Task EnsureCanAdministerAsync(string organizationId)
    {
        if (IsPlatformAdmin()) return;

        var membership = await _memberships.GetAsync(organizationId, _identity.Subject);
        if (membership is not { Status: MembershipStatus.Active }
            || !string.Equals(membership.Role, Fabrik3DRoles.Administrator, StringComparison.Ordinal))
        {
            throw new UnauthorizedAccessException(
                $"The current identity is not an administrator of organization '{organizationId}'.");
        }
    }

    private static string NormalizeSlug(string value)
    {
        var slug = new string(value.Trim().ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '-')
            .ToArray());
        slug = string.Join('-', slug.Split('-', StringSplitOptions.RemoveEmptyEntries));
        return string.IsNullOrEmpty(slug) ? $"org-{Guid.NewGuid():N}" : slug;
    }

    private static List<string> Distinct(IEnumerable<string> values) =>
        values.Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

    private static OrganizationDto ToDto(Organization o) =>
        new(o.Id, o.Name, o.Slug, o.Settings, o.CreatedAtUtc, o.UpdatedAtUtc, o.Version);

    private static MembershipDto ToDto(Membership m) =>
        new(m.Id, m.OrganizationId, m.Subject, m.Role, m.Status.ToString(), m.CreatedAtUtc, m.UpdatedAtUtc, m.Version);

    private static TrainingClassDto ToDto(TrainingClass c) =>
        new(c.Id, c.OrganizationId, c.Name, c.Description, c.InstructorSubjects, c.LearnerSubjects,
            c.ScheduleMetadata, c.CreatedAtUtc, c.UpdatedAtUtc, c.Version);

    private static TrainingResourceAssignmentDto ToDto(TrainingResourceAssignment r) =>
        new(r.Id, r.OrganizationId, r.ClassId, r.Kind.ToString(), r.ResourceId, r.CreatedAtUtc);
}
