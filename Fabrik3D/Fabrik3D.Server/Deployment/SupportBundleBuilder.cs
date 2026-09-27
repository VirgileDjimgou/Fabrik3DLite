using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Infrastructure.Migrations;
using Microsoft.Extensions.Configuration;

namespace Fabrik3D.Server.Deployment;

/// <summary>
/// Builds the read-only support bundle: versions, health, redacted configuration, connector state,
/// applied migrations and recent redacted logs. It never includes credentials, tokens, connection
/// strings or personal data.
/// </summary>
public sealed class SupportBundleBuilder
{
    public const string SchemaVersion = "1.0";

    /// <summary>
    /// Configuration sections that belong to Fabrik3D. The bundle only includes these, so unrelated
    /// process environment variables (host paths, user names, tool credentials) can never leak into
    /// a support bundle even though ASP.NET Core merges the whole environment into configuration.
    /// </summary>
    private static readonly string[] ApplicationSectionPrefixes =
    [
        "Deployment:", "MongoDb:", "Orchestration:", "Authentication:", "Cors:", "Tenancy:",
        "Training:", "SecurityHeaders:", "OpcUa:", "Mqtt:", "Modbus:", "Historian:", "Logging:",
    ];

    /// <summary>True when a configuration key belongs to an owned application section.</summary>
    public static bool IsRelevantConfigurationKey(string key) =>
        ApplicationSectionPrefixes.Any(prefix => key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));

    private readonly VersionInfo _version;
    private readonly HealthReportService _health;
    private readonly IConfiguration _configuration;
    private readonly IConnectorHealthSummaryProvider _connectors;
    private readonly SchemaMigrationRunner _migrations;
    private readonly RecentLogBuffer _logs;

    public SupportBundleBuilder(
        VersionInfo version,
        HealthReportService health,
        IConfiguration configuration,
        IConnectorHealthSummaryProvider connectors,
        SchemaMigrationRunner migrations,
        RecentLogBuffer logs)
    {
        _version = version;
        _health = health;
        _configuration = configuration;
        _connectors = connectors;
        _migrations = migrations;
        _logs = logs;
    }

    public async Task<SupportBundleDto> BuildAsync(CancellationToken cancellationToken = default)
    {
        var health = await _health.BuildReadinessAsync(cancellationToken);
        var configuration = FlattenConfiguration();
        var redactedKeys = configuration
            .Where(entry => entry.Value == SecretRedactor.Placeholder)
            .Select(entry => entry.Key)
            .OrderBy(key => key, StringComparer.Ordinal)
            .ToList();

        var migrations = (await _migrations.GetAppliedAsync(cancellationToken))
            .Select(record => new SupportBundleMigrationDto(record.Id, record.Name, record.AppliedAtUtc))
            .ToList();

        return new SupportBundleDto(
            SchemaVersion,
            DateTime.UtcNow,
            _version.ToDto(),
            health,
            configuration,
            _connectors.GetSummaries(),
            migrations,
            _logs.Snapshot(),
            redactedKeys);
    }

    private IReadOnlyDictionary<string, string> FlattenConfiguration()
    {
        var result = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in _configuration.AsEnumerable())
        {
            if (entry.Value is null) continue;
            if (!IsRelevantConfigurationKey(entry.Key)) continue;
            result[entry.Key] = SecretRedactor.RedactValue(entry.Key, entry.Value);
        }
        return result;
    }
}
