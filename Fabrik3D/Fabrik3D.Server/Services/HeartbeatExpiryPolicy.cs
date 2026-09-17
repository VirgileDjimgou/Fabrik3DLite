using Fabrik3D.Domain.Entities;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Pure heartbeat staleness policy so expiry logic is unit-testable.
/// </summary>
public static class HeartbeatExpiryPolicy
{
    public static bool IsStale(SimulationSession session, DateTime nowUtc, TimeSpan timeout) =>
        session.LastHeartbeatUtc + timeout < nowUtc;
}
