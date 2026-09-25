namespace Fabrik3D.Server.Services;

/// <summary>Outcome of a bounded rate-limit check.</summary>
public sealed record RateLimitDecision(bool Allowed, string? Reason)
{
    public static RateLimitDecision Allow { get; } = new(true, null);
}

/// <summary>
/// In-memory fixed-window rate limiter for historian ingestion (S40). Protects the endpoint from
/// rate-abusive input without an external dependency. The window is one minute per source.
/// </summary>
public sealed class HistorianRateLimiter
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Window> _windows = new(StringComparer.Ordinal);

    private sealed class Window
    {
        public long StartTicks { get; set; }
        public int Batches { get; set; }
        public long Samples { get; set; }
    }

    /// <summary>
    /// Attempts to consume <paramref name="sampleCount"/> samples in one batch for a source.
    /// A value of zero or less for a limit disables that dimension. Idempotent per source per window.
    /// </summary>
    public RateLimitDecision TryConsume(
        string sourceId,
        int sampleCount,
        int maxBatchesPerMinute,
        int maxSamplesPerMinute,
        DateTime nowUtc)
    {
        var key = string.IsNullOrWhiteSpace(sourceId) ? "anonymous" : sourceId.Trim();
        lock (_gate)
        {
            if (!_windows.TryGetValue(key, out var window))
            {
                window = new Window { StartTicks = nowUtc.Ticks };
                _windows[key] = window;
            }
            else if (nowUtc.Ticks - window.StartTicks >= TimeSpan.TicksPerMinute)
            {
                window.StartTicks = nowUtc.Ticks;
                window.Batches = 0;
                window.Samples = 0;
            }

            if (maxBatchesPerMinute > 0 && window.Batches + 1 > maxBatchesPerMinute)
            {
                return new RateLimitDecision(false, $"source '{key}' exceeded {maxBatchesPerMinute} batches/minute");
            }

            if (maxSamplesPerMinute > 0 && window.Samples + sampleCount > maxSamplesPerMinute)
            {
                return new RateLimitDecision(false, $"source '{key}' exceeded {maxSamplesPerMinute} samples/minute");
            }

            window.Batches += 1;
            window.Samples += Math.Max(0, sampleCount);
            return RateLimitDecision.Allow;
        }
    }

    /// <summary>Drops expired windows so the limiter memory stays bounded. Safe to call periodically.</summary>
    public void EvictExpired(DateTime nowUtc)
    {
        lock (_gate)
        {
            var expired = _windows
                .Where(pair => nowUtc.Ticks - pair.Value.StartTicks >= TimeSpan.TicksPerMinute * 2)
                .Select(pair => pair.Key)
                .ToList();
            foreach (var key in expired) _windows.Remove(key);
        }
    }

    public int TrackedSourceCount
    {
        get
        {
            lock (_gate) return _windows.Count;
        }
    }
}
