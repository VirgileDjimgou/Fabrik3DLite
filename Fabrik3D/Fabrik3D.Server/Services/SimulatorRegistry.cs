using System.Collections.Concurrent;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Bounded, in-memory registry of simulators that have registered their cell capability with the
/// server (S51). The server uses it to resolve a deterministic execution target for a dispatch.
/// It is intentionally not persisted: a simulator re-registers on every SignalR connect/reconnect,
/// so a server restart simply requires the simulator to reconnect. Entries are bounded and pruned
/// by last-seen time so a stale registration never becomes an unbounded waiter.
/// </summary>
public sealed class SimulatorRegistry
{
    private sealed record Entry(string SimulatorId, string CellId, string? ConnectionId, DateTime LastSeenUtc);

    private readonly ConcurrentDictionary<string, Entry> _bySimulator = new(StringComparer.Ordinal);
    private readonly TimeSpan _staleAfter;

    public SimulatorRegistry(TimeSpan? staleAfter = null)
        => _staleAfter = staleAfter ?? TimeSpan.FromSeconds(60);

    /// <summary>Registers (or refreshes) a simulator's cell capability. Idempotent.</summary>
    public void Register(string simulatorId, string cellId, string? connectionId, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(simulatorId) || string.IsNullOrWhiteSpace(cellId)) return;
        _bySimulator[simulatorId.Trim()] = new Entry(simulatorId.Trim(), cellId.Trim(), connectionId, nowUtc);
    }

    /// <summary>Removes a simulator registration by its SignalR connection id.</summary>
    public void UnregisterByConnection(string? connectionId)
    {
        if (string.IsNullOrEmpty(connectionId)) return;
        foreach (var pair in _bySimulator)
        {
            if (string.Equals(pair.Value.ConnectionId, connectionId, StringComparison.Ordinal))
            {
                _bySimulator.TryRemove(pair.Key, out _);
            }
        }
    }

    /// <summary>Removes a simulator registration by id.</summary>
    public void Unregister(string simulatorId)
    {
        if (!string.IsNullOrWhiteSpace(simulatorId)) _bySimulator.TryRemove(simulatorId.Trim(), out _);
    }

    /// <summary>
    /// Resolves the single live simulator registered for a cell. Returns null when none is
    /// available; returns the lexicographically smallest id when several are registered so the
    /// choice is deterministic rather than arbitrary.
    /// </summary>
    public string? ResolveForCell(string cellId, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(cellId)) return null;
        var candidates = _bySimulator.Values
            .Where(e => string.Equals(e.CellId, cellId.Trim(), StringComparison.Ordinal))
            .Where(e => nowUtc - e.LastSeenUtc <= _staleAfter)
            .Select(e => e.SimulatorId)
            .OrderBy(id => id, StringComparer.Ordinal)
            .ToList();
        return candidates.Count == 0 ? null : candidates[0];
    }

    /// <summary>Number of live simulators registered for a cell (composer availability, S52).</summary>
    public int CountForCell(string cellId, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(cellId)) return 0;
        return _bySimulator.Values
            .Count(e => string.Equals(e.CellId, cellId.Trim(), StringComparison.Ordinal)
                        && nowUtc - e.LastSeenUtc <= _staleAfter);
    }

    /// <summary>True when the simulator is registered and not stale.</summary>
    public bool IsAvailable(string simulatorId, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(simulatorId)) return false;
        return _bySimulator.TryGetValue(simulatorId.Trim(), out var entry)
            && nowUtc - entry.LastSeenUtc <= _staleAfter;
    }

    /// <summary>Cell a simulator is registered for, or null.</summary>
    public string? CellFor(string simulatorId)
        => !string.IsNullOrWhiteSpace(simulatorId) && _bySimulator.TryGetValue(simulatorId.Trim(), out var entry)
            ? entry.CellId
            : null;

    /// <summary>Number of live registrations (diagnostics/tests).</summary>
    public int Count => _bySimulator.Count;
}
