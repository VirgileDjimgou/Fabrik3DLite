namespace Fabrik3D.Server.Settings;

/// <summary>
/// Orchestration runtime settings (section "Orchestration").
/// </summary>
public class OrchestrationOptions
{
    public const string SectionName = "Orchestration";

    /// <summary>Heartbeats older than this mark the session as faulted.</summary>
    public int HeartbeatTimeoutSeconds { get; set; } = 15;

    /// <summary>How often the heartbeat monitor scans for stale sessions.</summary>
    public int HeartbeatCheckIntervalSeconds { get; set; } = 5;
}
