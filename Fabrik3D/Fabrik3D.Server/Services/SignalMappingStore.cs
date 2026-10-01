using System.Collections.Concurrent;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;

namespace Fabrik3D.Server.Services;

/// <summary>Stored mapping document plus its server-assigned optimistic-concurrency version.</summary>
public sealed record StoredSignalMapping(
    SignalMappingDocumentDto Document,
    int Version,
    bool Valid,
    DateTimeOffset UpdatedAtUtc,
    string OrganizationId = TenantSchema.DefaultOrganizationId);

/// <summary>
/// In-memory, versioned engineering store for signal mappings. It is deliberately not a
/// production persistence layer yet: it provides optimistic concurrency, an audit trail and
/// indexes by protocol, and keeps the last explicitly activated mapping per protocol separate
/// from stored drafts so a running connector never changes silently.
///
/// Every operation is partitioned by organization (S57): a mapping document, its active protocol
/// binding and its audit trail are only ever visible to the organization that created it, so one
/// tenant can neither observe nor mutate another tenant's mappings. Callers without an explicit
/// organization (background connectors, unit tests) use the default organization.
/// </summary>
public sealed class SignalMappingStore
{
    private readonly ConcurrentDictionary<string, StoredSignalMapping> _documents = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, SignalMappingDocumentDto> _activeByProtocol = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, SignalMappingDocumentDto> _activeById = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, List<SignalMappingAuditDto>> _auditByOrganization = new(StringComparer.Ordinal);
    private readonly object _auditGate = new();
    private readonly TimeProvider _time;

    public SignalMappingStore(TimeProvider time) => _time = time;

    /// <summary>Normalizes an organization id, falling back to the default organization.</summary>
    private static string Organization(string? organizationId)
        => string.IsNullOrWhiteSpace(organizationId) ? TenantSchema.DefaultOrganizationId : organizationId.Trim();

    private static string DocumentKey(string organizationId, string id) => $"{organizationId}\u0001{id}";

    private static string ProtocolKey(string organizationId, string protocol) => $"{organizationId}\u0001{protocol}";

    public IReadOnlyList<SignalMappingSummaryDto> List(string? organizationId = null)
        => _documents.Values
            .Where(entry => entry.OrganizationId == Organization(organizationId))
            .OrderBy(entry => entry.Document.Id, StringComparer.Ordinal)
            .Select(entry => new SignalMappingSummaryDto(
                entry.Document.Id,
                entry.Document.Name,
                entry.Version,
                entry.Document.Entries?.Count ?? 0,
                entry.Valid,
                entry.UpdatedAtUtc))
            .ToList();

    public StoredSignalMapping? Get(string id, string? organizationId = null)
    {
        var org = Organization(organizationId);
        return _documents.TryGetValue(DocumentKey(org, id), out var stored) ? stored : null;
    }

    public bool TryUpsert(
        SignalMappingDocumentDto document,
        int expectedVersion,
        bool valid,
        string by,
        out StoredSignalMapping? stored,
        out string? error,
        string? organizationId = null)
    {
        stored = null;
        error = null;
        if (document is null || string.IsNullOrWhiteSpace(document.Id))
        {
            error = "missing-id";
            return false;
        }

        var org = Organization(organizationId);
        var id = document.Id;
        var key = DocumentKey(org, id);
        int nextVersion;
        if (_documents.TryGetValue(key, out var current))
        {
            if (expectedVersion == 0)
            {
                error = "already-exists";
                return false;
            }
            if (expectedVersion != current.Version)
            {
                error = "concurrent-modification";
                return false;
            }
            nextVersion = current.Version + 1;
        }
        else
        {
            if (expectedVersion != 0)
            {
                error = "not-found";
                return false;
            }
            nextVersion = 1;
        }

        var sanitized = document with { Version = nextVersion };
        stored = new StoredSignalMapping(sanitized, nextVersion, valid, _time.GetUtcNow(), org);
        _documents[key] = stored;
        RecordAudit(org, "upsert", id, nextVersion, by, valid ? null : "stored-with-validation-errors");
        return true;
    }

    public bool TryDelete(string id, int expectedVersion, string by, out string? error, string? organizationId = null)
    {
        error = null;
        var org = Organization(organizationId);
        var key = DocumentKey(org, id);
        if (!_documents.TryGetValue(key, out var current))
        {
            error = "not-found";
            return false;
        }
        if (expectedVersion != 0 && expectedVersion != current.Version)
        {
            error = "concurrent-modification";
            return false;
        }
        _documents.TryRemove(key, out _);
        _activeById.TryRemove(DocumentKey(org, id), out _);
        foreach (var protocol in _activeByProtocol
            .Where(pair => pair.Key.StartsWith($"{org}\u0001", StringComparison.Ordinal) && string.Equals(pair.Value.Id, id, StringComparison.Ordinal))
            .Select(pair => pair.Key)
            .ToList())
        {
            _activeByProtocol.TryRemove(protocol, out _);
        }
        RecordAudit(org, "delete", id, current.Version, by, null);
        return true;
    }

    /// <summary>Activates a validated mapping document for every protocol it contains.</summary>
    public void Activate(SignalMappingDocumentDto document, string by, string? organizationId = null)
    {
        var org = Organization(organizationId);
        _activeById[DocumentKey(org, document.Id)] = document;
        foreach (var protocol in (document.Entries ?? []).Where(entry => entry.Enabled).Select(entry => entry.Protocol?.Trim().ToLowerInvariant() ?? string.Empty).Where(value => value.Length > 0).Distinct())
        {
            _activeByProtocol[ProtocolKey(org, protocol)] = document;
        }
        RecordAudit(org, "apply", document.Id, document.Version, by, "activated");
    }

    public SignalMappingDocumentDto? ActiveDocument(string id, string? organizationId = null)
        => _activeById.TryGetValue(DocumentKey(Organization(organizationId), id), out var document) ? document : null;

    public SignalMappingDocumentDto? ActiveForProtocol(string protocol, string? organizationId = null)
        => _activeByProtocol.TryGetValue(ProtocolKey(Organization(organizationId), protocol), out var document) ? document : null;

    public IReadOnlyList<SignalMappingAuditDto> Audit(string? organizationId = null)
    {
        var org = Organization(organizationId);
        lock (_auditGate)
        {
            if (!_auditByOrganization.TryGetValue(org, out var entries)) return [];
            return entries.OrderByDescending(entry => entry.AtUtc).ToList();
        }
    }

    private void RecordAudit(string organizationId, string action, string mappingId, int version, string by, string? detail)
    {
        lock (_auditGate)
        {
            var entries = _auditByOrganization.GetOrAdd(organizationId, _ => []);
            entries.Add(new SignalMappingAuditDto(action, mappingId, version, string.IsNullOrWhiteSpace(by) ? "unknown" : by, _time.GetUtcNow(), detail));
        }
    }
}
