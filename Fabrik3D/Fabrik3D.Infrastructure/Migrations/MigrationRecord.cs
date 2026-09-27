namespace Fabrik3D.Infrastructure.Migrations;

/// <summary>
/// Bookkeeping document for one applied schema migration. The <see cref="Id"/> is the migration
/// version, so the collection is naturally unique and idempotent.
/// </summary>
public sealed class MigrationRecord
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateTime AppliedAtUtc { get; set; }
    public long DurationMilliseconds { get; set; }
}
