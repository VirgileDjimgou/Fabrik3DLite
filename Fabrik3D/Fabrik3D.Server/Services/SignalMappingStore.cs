using System.Collections.Concurrent;
using Fabrik3D.Contracts.DTOs;

namespace Fabrik3D.Server.Services;

/// <summary>Stored mapping document plus its server-assigned optimistic-concurrency version.</summary>
public sealed record StoredSignalMapping(
    SignalMappingDocumentDto Document,
    int Version,
    bool Valid,
    DateTimeOffset UpdatedAtUtc);

/// <summary>
/// In-memory, versioned engineering store for signal mappings. It is deliberately not a
/// production persistence layer yet: it provides optimistic concurrency, an audit trail and
/// indexes by protocol, and keeps the last explicitly activated mapping per protocol separate
/// from stored drafts so a running connector never changes silently.
/// </summary>
public sealed class SignalMappingStore
{
    private readonly ConcurrentDictionary<string, StoredSignalMapping> _documents = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, SignalMappingDocumentDto> _activeByProtocol = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, SignalMappingDocumentDto> _activeById = new(StringComparer.Ordinal);
    private readonly List<SignalMappingAuditDto> _audit = [];
    private readonly object _auditGate = new();
    private readonly TimeProvider _time;

    public SignalMappingStore(TimeProvider time) => _time = time;

    public IReadOnlyList<SignalMappingSummaryDto> List()
        => _documents.Values
            .OrderBy(entry => entry.Document.Id, StringComparer.Ordinal)
            .Select(entry => new SignalMappingSummaryDto(
                entry.Document.Id,
                entry.Document.Name,
                entry.Version,
                entry.Document.Entries?.Count ?? 0,
                entry.Valid,
                entry.UpdatedAtUtc))
            .ToList();

    public StoredSignalMapping? Get(string id)
        => _documents.TryGetValue(id, out var stored) ? stored : null;

    public bool TryUpsert(
        SignalMappingDocumentDto document,
        int expectedVersion,
        bool valid,
        string by,
        out StoredSignalMapping? stored,
        out string? error)
    {
        stored = null;
        error = null;
        if (document is null || string.IsNullOrWhiteSpace(document.Id))
        {
            error = "missing-id";
            return false;
        }

        var id = document.Id;
        int nextVersion;
        if (_documents.TryGetValue(id, out var current))
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
        stored = new StoredSignalMapping(sanitized, nextVersion, valid, _time.GetUtcNow());
        _documents[id] = stored;
        RecordAudit("upsert", id, nextVersion, by, valid ? null : "stored-with-validation-errors");
        return true;
    }

    public bool TryDelete(string id, int expectedVersion, string by, out string? error)
    {
        error = null;
        if (!_documents.TryGetValue(id, out var current))
        {
            error = "not-found";
            return false;
        }
        if (expectedVersion != 0 && expectedVersion != current.Version)
        {
            error = "concurrent-modification";
            return false;
        }
        _documents.TryRemove(id, out _);
        _activeById.TryRemove(id, out _);
        foreach (var protocol in _activeByProtocol.Where(pair => string.Equals(pair.Value.Id, id, StringComparison.Ordinal)).Select(pair => pair.Key).ToList())
        {
            _activeByProtocol.TryRemove(protocol, out _);
        }
        RecordAudit("delete", id, current.Version, by, null);
        return true;
    }

    /// <summary>Activates a validated mapping document for every protocol it contains.</summary>
    public void Activate(SignalMappingDocumentDto document, string by)
    {
        _activeById[document.Id] = document;
        foreach (var protocol in (document.Entries ?? []).Where(entry => entry.Enabled).Select(entry => entry.Protocol?.Trim().ToLowerInvariant() ?? string.Empty).Where(value => value.Length > 0).Distinct())
        {
            _activeByProtocol[protocol] = document;
        }
        RecordAudit("apply", document.Id, document.Version, by, "activated");
    }

    public SignalMappingDocumentDto? ActiveDocument(string id)
        => _activeById.TryGetValue(id, out var document) ? document : null;

    public SignalMappingDocumentDto? ActiveForProtocol(string protocol)
        => _activeByProtocol.TryGetValue(protocol, out var document) ? document : null;

    public IReadOnlyList<SignalMappingAuditDto> Audit()
    {
        lock (_auditGate)
        {
            return _audit.OrderByDescending(entry => entry.AtUtc).ToList();
        }
    }

    private void RecordAudit(string action, string mappingId, int version, string by, string? detail)
    {
        lock (_auditGate)
        {
            _audit.Add(new SignalMappingAuditDto(action, mappingId, version, string.IsNullOrWhiteSpace(by) ? "unknown" : by, _time.GetUtcNow(), detail));
        }
    }
}
