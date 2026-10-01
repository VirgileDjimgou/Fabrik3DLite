namespace Fabrik3D.Contracts.Enums;

/// <summary>
/// Server-authoritative dispatch lifecycle for a job that an operator started from the HMI (S51).
/// The server assigns a target, publishes a targeted execution request and tracks the simulator's
/// claim/acknowledgement. A dispatch never silently reassigns another simulator on timeout.
/// </summary>
public enum DispatchState
{
    /// <summary>No dispatch has been requested (legacy or locally-started job).</summary>
    None = 0,

    /// <summary>Assignment persisted; the targeted execution request is being published.</summary>
    Pending = 1,

    /// <summary>The assigned simulator acknowledged the request and adopted the session.</summary>
    Acknowledged = 2,

    /// <summary>The assigned simulator reported the workflow running.</summary>
    Running = 3,

    /// <summary>The dispatch failed (rejected target, publish failure or simulator-reported failure).</summary>
    Failed = 4,

    /// <summary>The acknowledgement window elapsed without a claim/ACK; the job is not running.</summary>
    TimedOut = 5,
}
