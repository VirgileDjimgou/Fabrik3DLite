namespace Fabrik3D.Contracts.Enums;

/// <summary>
/// Machine-control authority mode for one equipment/actuator scope (S36).
/// Exactly one mode owns a scope at a time; the enum is mirrored to TypeScript through the
/// generated contracts and to the simulator/HMI through SignalR.
/// </summary>
public enum ControlAuthorityMode
{
    /// <summary>The simulator's own simulation drives the actuators; connectors observe only.</summary>
    LocalSimulation,

    /// <summary>An external controller (through a connector) drives the actuators.</summary>
    ExternalController,

    /// <summary>The twin renders externally observed values but nothing may command the actuators.</summary>
    ObservedTwin,

    /// <summary>Read-only playback. Replay can never acquire command authority or emit a write.</summary>
    Replay,
}

/// <summary>Lifecycle state of the authority document for a scope.</summary>
public enum ControlAuthorityState
{
    /// <summary>No owner; local simulation may drive implicitly.</summary>
    Available,

    /// <summary>An owner holds the authority and may command according to its mode.</summary>
    Held,

    /// <summary>The owner lease expired or the owner became unhealthy; commands fail closed.</summary>
    Degraded,
}

/// <summary>Kind of principal that owns an authority lease.</summary>
public enum ControlAuthorityOwnerKind
{
    Simulator,
    Connector,
}
