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

    /// <summary>Lease requested for an external control authority when the caller does not specify one.</summary>
    public int AuthorityLeaseSeconds { get; set; } = 30;

    /// <summary>
    /// A takeover always requires an explicit confirmation. When a confirmation token is configured
    /// below it must also match. Identity and role authorization for the takeover are enforced by
    /// the Engineer policy (S42); this remains a defence-in-depth confirmation boundary.
    /// </summary>
    public bool RequireAuthorityConfirmation { get; set; } = true;

    /// <summary>
    /// Optional shared confirmation token for authority takeover. Left empty by default so no secret
    /// is committed; when set it must be supplied by the operator performing the takeover.
    /// </summary>
    public string? AuthorityConfirmationToken { get; set; }
}
