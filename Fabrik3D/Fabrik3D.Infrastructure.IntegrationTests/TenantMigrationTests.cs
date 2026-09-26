using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.IntegrationTests;

/// <summary>
/// Deterministic, idempotent default-organization migration (S43). Existing documents that predate
/// tenancy are backfilled exactly once; already-scoped documents are never rewritten.
/// </summary>
[Collection(MongoDbCollection.Name)]
public class TenantMigrationTests
{
    private readonly MongoDbFixture _fixture;

    public TenantMigrationTests(MongoDbFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Migration_backfills_legacy_documents_and_is_idempotent()
    {
        var ctx = _fixture.CreateContext();
        var legacyJob = new Job { Name = "legacy job", Status = JobStatus.Created };
        var legacyTemplate = new CellTemplate { Name = "legacy template", SchemaVersion = "1.0", Content = "{}" };
        var legacySample = new TelemetrySample { EquipmentId = "robot-1", SignalId = "speed", NumericValue = 2 };

        await ctx.Jobs.InsertOneAsync(legacyJob);
        await ctx.CellTemplates.InsertOneAsync(legacyTemplate);
        await ctx.TelemetrySamples.InsertOneAsync(legacySample);

        var migration = new TenantMigrationService(ctx, new OrganizationRepository(ctx));

        var first = await migration.MigrateAsync();
        Assert.False(first.AlreadyMigrated,
            $"counts={string.Join(",", first.MigratedDocuments.Select(kv => $"{kv.Key}={kv.Value}"))}");
        Assert.Equal(1, first.MigratedDocuments["jobs"]);
        Assert.Equal(1, first.MigratedDocuments["cellTemplates"]);
        Assert.Equal(1, first.MigratedDocuments["telemetrySamples"]);
        Assert.Equal(TenantSchema.DefaultOrganizationId, first.OrganizationId);

        var migratedJob = await ctx.Jobs.Find(j => j.Id == legacyJob.Id).FirstOrDefaultAsync();
        Assert.Equal(TenantSchema.DefaultOrganizationId, migratedJob!.OrganizationId);

        var second = await migration.MigrateAsync();
        Assert.True(second.AlreadyMigrated);
        Assert.All(second.MigratedDocuments.Values, count => Assert.Equal(0, count));
    }

    [Fact]
    public async Task Migration_never_overwrites_an_existing_organization_scope()
    {
        var ctx = _fixture.CreateContext();
        var foreign = new Job { Name = "org-b job", Status = JobStatus.Created, OrganizationId = "org-b" };
        await ctx.Jobs.InsertOneAsync(foreign);

        var migration = new TenantMigrationService(ctx, new OrganizationRepository(ctx));
        await migration.MigrateAsync();

        var stored = await ctx.Jobs.Find(j => j.Id == foreign.Id).FirstOrDefaultAsync();
        Assert.Equal("org-b", stored!.OrganizationId);
    }

    [Fact]
    public async Task Migration_creates_the_default_organization_once()
    {
        var ctx = _fixture.CreateContext();
        var organizations = new OrganizationRepository(ctx);
        var migration = new TenantMigrationService(ctx, organizations);

        await migration.MigrateAsync();
        await migration.MigrateAsync();

        var all = await organizations.GetAllAsync();
        var defaults = all.Where(o => o.Id == TenantSchema.DefaultOrganizationId).ToList();
        Assert.Single(defaults);
        Assert.Equal(TenantSchema.DefaultOrganizationSlug, defaults[0].Slug);
    }
}
