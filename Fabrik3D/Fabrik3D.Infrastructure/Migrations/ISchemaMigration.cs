namespace Fabrik3D.Infrastructure.Migrations;

/// <summary>
/// One idempotent, versioned schema migration. Implementations must be safe to run more than once
/// and must never perform a destructive silent change. The runner records the version in the
/// <c>schemaMigrations</c> collection and skips already-applied migrations.
/// </summary>
public interface ISchemaMigration
{
    /// <summary>Stable, sortable version identifier (for example <c>0001</c>).</summary>
    string Version { get; }

    /// <summary>Human-readable migration name recorded alongside the version.</summary>
    string Name { get; }

    Task ApplyAsync(Persistence.MongoDbContext context, CancellationToken cancellationToken);
}
