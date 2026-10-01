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

    /// <summary>
    /// Seconds an assigned simulator has to claim/acknowledge a targeted dispatch before the job's
    /// dispatch state becomes <c>TimedOut</c> (S51). Bounds retained correlation state.
    /// </summary>
    public int DispatchAckTimeoutSeconds { get; set; } = 20;

    /// <summary>
    /// Default cell id used when a job has no explicit target and the deployment has a single
    /// compatible cell (S51). Keeps single-cell installs and the reference cell working unchanged.
    /// </summary>
    public string DefaultCellId { get; set; } = "reference-cell";

    /// <summary>
    /// When true, the server-authoritative dispatch path is enabled. When false the legacy
    /// HMI-start + simulator-claim path remains available (compatibility switch, S51).
    /// </summary>
    public bool AuthoritativeDispatchEnabled { get; set; } = true;

    /// <summary>
    /// How long an authoritative robot-position report stays fresh (S53). Older reports are shown
    /// as stale and disable jog commands; the value is never silently refreshed.
    /// </summary>
    public int RobotTelemetryStaleAfterSeconds { get; set; } = 3;
}
