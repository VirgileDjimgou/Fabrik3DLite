using Fabrik3D.Infrastructure.Migrations;
using Fabrik3D.Infrastructure.Persistence;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Schema migration runner tests (S48): migrations are versioned, ordered and idempotent, and a
/// second pass over an up-to-date database applies nothing.
/// </summary>
[Collection(HistorianCollection.Name)]
public class SchemaMigrationRunnerTests
{
    private readonly HistorianFixture _fx;

    public SchemaMigrationRunnerTests(HistorianFixture fx) => _fx = fx;

    private static SchemaMigrationRunner CreateRunner(
        MongoDbContext context,
        params ISchemaMigration[] migrations) =>
        new(context, migrations, NullLogger<SchemaMigrationRunner>.Instance);

    [Fact]
    public async Task First_run_applies_pending_migrations_and_second_run_is_idempotent()
    {
        var context = _fx.CreateContext();
        var runner = CreateRunner(context, new BaselineIndexesMigration());

        var first = await runner.RunAsync();

        Assert.False(first.AlreadyUpToDate);
        Assert.Single(first.Applied);
        Assert.Equal("0001", first.Applied[0].Id);
        Assert.Equal(1, first.TotalApplied);

        var second = await runner.RunAsync();

        Assert.True(second.AlreadyUpToDate);
        Assert.Empty(second.Applied);
        Assert.Equal(1, second.TotalApplied);

        var applied = await runner.GetAppliedAsync();
        Assert.Single(applied);
        Assert.Equal("baseline-core-indexes", applied[0].Name);
    }

    [Fact]
    public async Task Migrations_are_applied_in_version_order()
    {
        var context = _fx.CreateContext();
        var order = new List<string>();
        var runner = CreateRunner(
            context,
            new RecordingMigration("0003", order),
            new RecordingMigration("0002", order),
            new BaselineIndexesMigration());

        var report = await runner.RunAsync();

        Assert.Equal(3, report.Applied.Count);
        Assert.Equal(["0002", "0003"], order);
    }

    [Fact]
    public async Task Migration_is_safe_to_run_over_existing_documents()
    {
        var context = _fx.CreateContext();
        var runner = CreateRunner(context, new BaselineIndexesMigration());

        await context.Jobs.InsertOneAsync(new Fabrik3D.Domain.Entities.Job
        {
            Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString(),
            Name = "seeded-job",
            CreatedAtUtc = DateTime.UtcNow,
        });

        await runner.RunAsync();
        await runner.RunAsync();

        var job = await context.Jobs.Find(j => j.Name == "seeded-job").FirstOrDefaultAsync();
        Assert.NotNull(job);
    }

    private sealed class RecordingMigration : ISchemaMigration
    {
        private readonly List<string> _order;

        public RecordingMigration(string version, List<string> order)
        {
            Version = version;
            _order = order;
        }

        public string Version { get; }
        public string Name => $"recording-{Version}";

        public Task ApplyAsync(MongoDbContext context, CancellationToken cancellationToken)
        {
            _order.Add(Version);
            return Task.CompletedTask;
        }
    }
}
