using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Tenancy;

namespace Fabrik3D.Infrastructure.IntegrationTests;

/// <summary>
/// Cross-organization isolation for every tenant-scoped repository (S43). Repositories are
/// exercised directly with explicit scopes so the boundary is proven at the persistence layer where
/// it is enforced, independent of any HTTP context.
/// </summary>
[Collection(MongoDbCollection.Name)]
public class TenantIsolationTests
{
    private readonly MongoDbFixture _fixture;

    public TenantIsolationTests(MongoDbFixture fixture) => _fixture = fixture;

    private static TenantScope Scope(string organizationId) =>
        TenantScope.ForOrganization(organizationId);

    [Fact]
    public async Task Jobs_are_isolated_between_organizations()
    {
        var ctx = _fixture.CreateContext();
        var orgA = new JobRepository(ctx, new FixedTenantContext("org-a"));
        var orgB = new JobRepository(ctx, new FixedTenantContext("org-b"));

        var job = new Job { Name = "org-a job", Status = JobStatus.Created };
        await orgA.CreateAsync(job);

        Assert.Contains(await orgA.GetAllAsync(), j => j.Id == job.Id);
        Assert.DoesNotContain(await orgB.GetAllAsync(), j => j.Id == job.Id);
        Assert.Null(await orgB.GetByIdAsync(job.Id));

        // A cross-organization write cannot match its scoped optimistic-concurrency filter.
        job.ProgressPercent = 50;
        Assert.False(await orgB.UpdateAsync(job));
    }

    [Fact]
    public async Task Tasks_sessions_templates_alarms_and_messages_are_isolated()
    {
        var ctx = _fixture.CreateContext();
        var a = new FixedTenantContext("org-a");
        var orgA = new TenantBundle(ctx, a);
        var orgB = new TenantBundle(ctx, new FixedTenantContext("org-b"));

        var job = new Job { Name = "job", Status = JobStatus.Created };
        await orgA.Jobs.CreateAsync(job);
        var task = new MachiningTask { JobId = job.Id, Name = "task" };
        await orgA.Tasks.InsertManyAsync([task]);

        var session = new SimulationSession { JobId = job.Id };
        await orgA.Sessions.CreateAsync(session);

        var template = new CellTemplate { Name = "template", SchemaVersion = "1.0", Content = "{}" };
        await orgA.Templates.CreateAsync(template);

        var alarm = new Alarm { Code = "A1", Title = "alarm" };
        await orgA.Alarms.CreateAsync(alarm);

        var message = new OperatorMessage { Title = "message" };
        await orgA.Messages.CreateAsync(message);

        Assert.Null(await orgB.Jobs.GetByIdAsync(job.Id));
        Assert.Empty(await orgB.Tasks.GetByJobIdAsync(job.Id));
        Assert.Null(await orgB.Sessions.GetByIdAsync(session.Id));

        // A cross-organization write cannot match its scoped optimistic-concurrency filter.
        Assert.False(await orgB.Sessions.UpdateAsync(session));

        // The owning organization can still update its own session (re-read to avoid the failed
        // attempt's in-memory version bump).
        var owned = await orgA.Sessions.GetByIdAsync(session.Id);
        Assert.NotNull(owned);
        Assert.True(await orgA.Sessions.UpdateAsync(owned!));
        Assert.Null(await orgB.Templates.GetByIdAsync(template.Id));
        Assert.Null(await orgB.Alarms.GetByIdAsync(alarm.Id));
        Assert.DoesNotContain(await orgB.Messages.GetAllAsync(), m => m.Id == message.Id);
    }

    [Fact]
    public async Task Historian_samples_and_events_are_isolated()
    {
        var ctx = _fixture.CreateContext();
        var orgA = new HistorianRepository(ctx, new FixedTenantContext("org-a"));
        var orgB = new HistorianRepository(ctx, new FixedTenantContext("org-b"));

        await orgA.InsertSamplesAsync([
            new TelemetrySample { EquipmentId = "robot-1", SignalId = "speed", NumericValue = 1 }
        ]);
        await orgA.InsertEventsAsync([
            new HistorizedEvent { Code = "evt", Kind = HistorianEventKind.Event }
        ]);

        Assert.Equal(1, await orgA.CountSamplesAsync(new TelemetrySampleQuery()));
        Assert.Equal(0, await orgB.CountSamplesAsync(new TelemetrySampleQuery()));
        Assert.Empty(await orgB.QuerySamplesAsync(new TelemetrySampleQuery(), 10));

        Assert.Equal(1, await orgA.CountEventsAsync(new HistorizedEventQuery()));
        Assert.Equal(0, await orgB.CountEventsAsync(new HistorizedEventQuery()));
    }

    [Fact]
    public async Task Classes_and_resource_assignments_are_isolated()
    {
        var ctx = _fixture.CreateContext();
        var orgA = new TrainingClassRepository(ctx, new FixedTenantContext("org-a"));
        var orgB = new TrainingClassRepository(ctx, new FixedTenantContext("org-b"));
        var resourcesA = new TrainingResourceRepository(ctx, new FixedTenantContext("org-a"));
        var resourcesB = new TrainingResourceRepository(ctx, new FixedTenantContext("org-b"));

        var trainingClass = new TrainingClass { Name = "Cohort 1", LearnerSubjects = ["learner-1"] };
        await orgA.CreateAsync(trainingClass);
        Assert.Null(await orgB.GetByIdAsync(trainingClass.Id));

        var assignment = new TrainingResourceAssignment { Kind = TrainingResourceKind.Scenario, ResourceId = "scn-1" };
        await resourcesA.CreateAsync(assignment);
        Assert.Single(await resourcesA.GetAllAsync());
        Assert.Empty(await resourcesB.GetAllAsync());
    }

    [Fact]
    public async Task Platform_admin_reads_across_organizations()
    {
        var ctx = _fixture.CreateContext();
        var orgA = new JobRepository(ctx, new FixedTenantContext("org-a"));
        var admin = new JobRepository(ctx, new FixedTenantContext(TenantSchema.DefaultOrganizationId, platformAdmin: true));

        var job = new Job { Name = "org-a job", Status = JobStatus.Created };
        await orgA.CreateAsync(job);

        Assert.Contains(await admin.GetAllAsync(), j => j.Id == job.Id);
    }

    [Fact]
    public async Task Legacy_documents_are_readable_only_by_the_default_organization()
    {
        var ctx = _fixture.CreateContext();
        var legacy = new Job { Name = "legacy", Status = JobStatus.Created }; // OrganizationId left null
        await ctx.Jobs.InsertOneAsync(legacy);

        var defaultOrg = new JobRepository(ctx, new FixedTenantContext(TenantSchema.DefaultOrganizationId));
        var otherOrg = new JobRepository(ctx, new FixedTenantContext("org-b"));

        Assert.NotNull(await defaultOrg.GetByIdAsync(legacy.Id));
        Assert.Null(await otherOrg.GetByIdAsync(legacy.Id));
    }

    [Fact]
    public async Task Tenant_indexes_are_created_and_idempotent()
    {
        var ctx = _fixture.CreateContext();
        var initializer = new TenantIndexInitializer(
            ctx,
            new OrganizationRepository(ctx),
            new MembershipRepository(ctx),
            new TrainingClassRepository(ctx),
            new TrainingResourceRepository(ctx),
            new TrainingSessionRepository(ctx),
            new TrainingActionRepository(ctx));

        var first = await initializer.EnsureAllAsync();
        Assert.Contains("organization_subject_unique", first["memberships"]);
        Assert.Contains("organization_created", first["jobs"]);
        Assert.Contains("organization_job", first["tasks"]);
        Assert.Contains("organization_started", first["simulationSessions"]);
        Assert.Contains("organization_class_learner", first["trainingSessions"]);
        Assert.Contains("session_action_unique", first["trainingActions"]);

        var second = await initializer.EnsureAllAsync();
        Assert.Equal(
            first["jobs"].OrderBy(x => x, StringComparer.Ordinal),
            second["jobs"].OrderBy(x => x, StringComparer.Ordinal));
    }

    private sealed class FixedTenantContext : ITenantContext
    {
        public FixedTenantContext(string organizationId, bool platformAdmin = false)
            => Scope = TenantScope.ForOrganization(organizationId, platformAdmin);

        public TenantScope? Scope { get; }
    }

    private sealed record TenantBundle(
        JobRepository Jobs,
        TaskRepository Tasks,
        SimulationSessionRepository Sessions,
        CellTemplateRepository Templates,
        AlarmRepository Alarms,
        OperatorMessageRepository Messages)
    {
        public TenantBundle(MongoDbContext ctx, ITenantContext tenant)
            : this(
                new JobRepository(ctx, tenant),
                new TaskRepository(ctx, tenant),
                new SimulationSessionRepository(ctx, tenant),
                new CellTemplateRepository(ctx, tenant),
                new AlarmRepository(ctx, tenant),
                new OperatorMessageRepository(ctx, tenant))
        {
        }
    }
}
