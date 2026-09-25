namespace Fabrik3D.Domain.Historian;

/// <summary>
/// Historian retention policy (S40). Bounds storage by age and document count. Defaults are
/// conservative; the pruner can be disabled without any data loss beyond the policy itself.
/// </summary>
/// <param name="Enabled">When false the pruner never deletes anything.</param>
/// <param name="MaxAgeDays">Documents older than this are pruned (0 = no age bound).</param>
/// <param name="MaxSamplesPerSignal">Newest N samples kept per equipment+signal (0 = no count bound).</param>
/// <param name="MaxEventDocuments">Newest N event documents kept in total (0 = no count bound).</param>
public sealed record RetentionPolicy(
    bool Enabled = true,
    int MaxAgeDays = 7,
    long MaxSamplesPerSignal = 200_000,
    long MaxEventDocuments = 500_000)
{
    public static RetentionPolicy Default { get; } = new();

    public RetentionPolicy Normalized() => new(
        Enabled,
        Math.Max(0, MaxAgeDays),
        Math.Max(0, MaxSamplesPerSignal),
        Math.Max(0, MaxEventDocuments));
}

/// <summary>
/// Pure retention and growth math. Kept free of IO so the policy is unit-testable and documented
/// numbers can be recomputed deterministically.
/// </summary>
public static class RetentionMath
{
    /// <summary>Timestamp before which age-based pruning may delete; <see cref="DateTime.MinValue"/> when unbounded.</summary>
    public static DateTime ComputeCutoffUtc(DateTime nowUtc, int maxAgeDays)
        => maxAgeDays <= 0 ? DateTime.MinValue : nowUtc.AddDays(-maxAgeDays);

    /// <summary>Number of oldest documents that exceed a cap.</summary>
    public static long Overflow(long count, long cap)
        => cap <= 0 ? 0 : Math.Max(0, count - cap);

    /// <summary>
    /// Worst-case samples stored per signal per hour. Periodic/on-change-or-periodic policies are
    /// bounded by their interval; a pure on-change policy has no natural bound, so the documented
    /// per-signal ingestion rate limit is the bound.
    /// </summary>
    public static long WorstCaseSamplesPerSignalPerHour(SamplingPolicy policy, int maxAcceptedPerSignalPerMinute)
    {
        var normalized = policy.Normalized();
        if (normalized.IsDisabled) return 0;
        if (normalized.Mode == SamplingMode.OnChange)
        {
            return Math.Max(0, maxAcceptedPerSignalPerMinute) * 60L;
        }
        return 3_600_000L / normalized.IntervalMilliseconds;
    }

    /// <summary>Worst-case samples stored for a catalog of signals over a window.</summary>
    public static long WorstCaseSamplesForSignalsPerHour(
        int signalCount,
        SamplingPolicy policy,
        int maxAcceptedPerSignalPerMinute)
        => Math.Max(0, signalCount) * WorstCaseSamplesPerSignalPerHour(policy, maxAcceptedPerSignalPerMinute);

    /// <summary>Bytes of a single sample, using the documented fixed document estimate.</summary>
    public const int EstimatedBytesPerSample = 220;

    /// <summary>Bytes of a single event, using the documented fixed document estimate.</summary>
    public const int EstimatedBytesPerEvent = 360;

    public static long EstimatedIngestBytesPerHour(
        int signalCount,
        SamplingPolicy policy,
        int maxAcceptedPerSignalPerMinute)
        => WorstCaseSamplesForSignalsPerHour(signalCount, policy, maxAcceptedPerSignalPerMinute)
           * EstimatedBytesPerSample;
}
