namespace Fabrik3D.Infrastructure.Settings;

/// <summary>
/// Historian configuration (section "Historian"). Secure, conservative defaults: the historian is
/// disabled unless explicitly enabled, no signal is historized at full rate, payloads are bounded
/// and ingestion is rate-limited. See docs/architecture/TELEMETRY_HISTORIAN.md.
/// </summary>
public class HistorianOptions
{
    public const string SectionName = "Historian";

    /// <summary>When false the historian accepts nothing, stores nothing and query endpoints stay empty.</summary>
    public bool Enabled { get; set; }

    /// <summary>Maximum number of samples in a single telemetry ingestion batch.</summary>
    public int MaxBatchSize { get; set; } = 500;

    /// <summary>Maximum number of events in a single event ingestion batch.</summary>
    public int MaxEventBatchSize { get; set; } = 500;

    /// <summary>Maximum length of a historized event payload, in characters.</summary>
    public int MaxPayloadLength { get; set; } = Fabrik3D.Domain.Historian.HistorianSchema.DefaultMaxPayloadLength;

    /// <summary>Maximum accepted telemetry samples per source per minute (rate limit).</summary>
    public int MaxSamplesPerMinutePerSource { get; set; } = 6000;

    /// <summary>Maximum accepted ingestion batches per source per minute (rate limit).</summary>
    public int MaxBatchesPerMinutePerSource { get; set; } = 120;

    /// <summary>Default sampling mode for signals without an explicit policy.</summary>
    public string DefaultSamplingMode { get; set; } = "on-change";

    /// <summary>Default sampling interval for signals without an explicit policy.</summary>
    public int DefaultSamplingIntervalMilliseconds { get; set; } = 1000;

    /// <summary>Default absolute deadband for analog signals without an explicit policy.</summary>
    public double DefaultDeadband { get; set; }

    /// <summary>Per-signal sampling policy overrides.</summary>
    public List<HistorianSignalPolicy> SignalPolicies { get; set; } = [];

    /// <summary>Whether the background pruner runs.</summary>
    public bool RetentionEnabled { get; set; } = true;

    /// <summary>How often the pruner scans, in minutes.</summary>
    public int RetentionCheckIntervalMinutes { get; set; } = 15;

    /// <summary>Age bound for stored historian documents.</summary>
    public int RetentionMaxAgeDays { get; set; } = 7;

    /// <summary>Newest N samples kept per equipment+signal.</summary>
    public long RetentionMaxSamplesPerSignal { get; set; } = 200_000;

    /// <summary>Newest N event documents kept in total.</summary>
    public long RetentionMaxEventDocuments { get; set; } = 500_000;

    /// <summary>Maximum rows returned for one historian query page.</summary>
    public int MaxQueryPageSize { get; set; } = 500;
}

/// <summary>One per-signal sampling policy override keyed by equipment+signal.</summary>
public class HistorianSignalPolicy
{
    public string EquipmentId { get; set; } = string.Empty;

    public string SignalId { get; set; } = string.Empty;

    public string Mode { get; set; } = "on-change";

    public int IntervalMilliseconds { get; set; } = 1000;

    public double Deadband { get; set; }
}
