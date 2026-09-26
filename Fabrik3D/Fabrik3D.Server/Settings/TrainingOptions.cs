using Fabrik3D.Domain.Training;

namespace Fabrik3D.Server.Settings;

/// <summary>
/// Server-side training persistence and assessment configuration (S44). Disabling
/// <see cref="Enabled"/> restores the S43 local-only behavior; the simulator keeps producing local
/// reports and simply does not sync.
/// </summary>
public sealed class TrainingOptions
{
    public const string SectionName = "Training";

    /// <summary>Feature gate for server-side training persistence and assessment.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Maximum number of actions accepted in one ingestion batch.</summary>
    public int MaxBatchSize { get; set; } = TrainingSchema.DefaultMaxBatchSize;

    /// <summary>Maximum number of actions retained per session.</summary>
    public int MaxActionsPerSession { get; set; } = TrainingSchema.MaxActionsPerSession;

    /// <summary>Maximum page size returned by session enumeration.</summary>
    public int MaxPageSize { get; set; } = 200;

    /// <summary>
    /// Maximum number of sessions aggregated by one instructor metrics query (S45). Bounds the query
    /// so a broad date range can never scan an unbounded collection; the response reports when the
    /// bound was hit instead of silently truncating.
    /// </summary>
    public int MaxMetricsSessions { get; set; } = 500;

    /// <summary>
    /// When false, sessions are persisted with a pending assessment instead of a computed score.
    /// No score is ever fabricated when assessment is unavailable.
    /// </summary>
    public bool ServerAssessmentEnabled { get; set; } = true;
}
