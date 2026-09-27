using System.Diagnostics;
using Fabrik3D.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Migrations;

/// <summary>Outcome of one migration pass.</summary>
public sealed record MigrationRunReport(
    IReadOnlyList<MigrationRecord> Applied,
    int TotalApplied,
    bool AlreadyUpToDate);

/// <summary>
/// Applies registered schema migrations in version order and records each one in the
/// <c>schemaMigrations</c> collection. The runner is idempotent: a second pass over an up-to-date
/// database applies nothing. It is safe to run on every startup.
/// </summary>
public sealed class SchemaMigrationRunner
{
    private readonly MongoDbContext _context;
    private readonly IReadOnlyList<ISchemaMigration> _migrations;
    private readonly ILogger<SchemaMigrationRunner> _log;

    public SchemaMigrationRunner(
        MongoDbContext context,
        IEnumerable<ISchemaMigration> migrations,
        ILogger<SchemaMigrationRunner> log)
    {
        _context = context;
        _migrations = migrations.OrderBy(m => m.Version, StringComparer.Ordinal).ToList();
        _log = log;
    }

    public async Task<MigrationRunReport> RunAsync(CancellationToken cancellationToken = default)
    {
        var collection = _context.SchemaMigrations;

        var applied = await collection
            .Find(FilterDefinition<MigrationRecord>.Empty)
            .ToListAsync(cancellationToken);
        var appliedVersions = applied.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);

        var newlyApplied = new List<MigrationRecord>();
        foreach (var migration in _migrations)
        {
            if (appliedVersions.Contains(migration.Version))
            {
                continue;
            }

            var stopwatch = Stopwatch.StartNew();
            await migration.ApplyAsync(_context, cancellationToken);
            stopwatch.Stop();

            var record = new MigrationRecord
            {
                Id = migration.Version,
                Name = migration.Name,
                AppliedAtUtc = DateTime.UtcNow,
                DurationMilliseconds = stopwatch.ElapsedMilliseconds,
            };
            await collection.InsertOneAsync(record, cancellationToken: cancellationToken);
            newlyApplied.Add(record);
            appliedVersions.Add(migration.Version);

            _log.LogInformation(
                "[Server][Migrations] Applied {Version} {Name} in {DurationMs} ms",
                record.Id, record.Name, record.DurationMilliseconds);
        }

        return new MigrationRunReport(
            newlyApplied,
            applied.Count + newlyApplied.Count,
            newlyApplied.Count == 0);
    }

    /// <summary>Returns the applied migrations in version order (read-only, for diagnostics).</summary>
    public async Task<IReadOnlyList<MigrationRecord>> GetAppliedAsync(CancellationToken cancellationToken = default)
    {
        var records = await _context.SchemaMigrations
            .Find(FilterDefinition<MigrationRecord>.Empty)
            .ToListAsync(cancellationToken);
        return records.OrderBy(r => r.Id, StringComparer.Ordinal).ToList();
    }
}
