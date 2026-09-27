namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Read-only diagnostic support bundle. Every value is either non-sensitive or redacted; it never
/// contains credentials, tokens, connection strings or personal data.
/// </summary>
public record SupportBundleDto(
    string SchemaVersion,
    DateTime GeneratedAtUtc,
    VersionDto Version,
    HealthReportDto Health,
    IReadOnlyDictionary<string, string> Configuration,
    IReadOnlyList<SupportBundleConnectorDto> Connectors,
    IReadOnlyList<SupportBundleMigrationDto> Migrations,
    IReadOnlyList<string> RecentLogs,
    IReadOnlyList<string> RedactedKeys);

/// <summary>Connector state summary included in a support bundle (no endpoints/credentials).</summary>
public record SupportBundleConnectorDto(string Protocol, bool Enabled, string State, string? LastError);

/// <summary>Applied schema migration summary included in a support bundle.</summary>
public record SupportBundleMigrationDto(string Version, string Name, DateTime AppliedAtUtc);
