using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Server.Services;

namespace Fabrik3D.Server.Tests;

public class HeartbeatExpiryPolicyTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    private static SimulationSession SessionWithHeartbeat(DateTime heartbeatUtc) => new()
    {
        Id = "session-1",
        JobId = "job-1",
        Status = SimulationStatus.Running,
        LastHeartbeatUtc = heartbeatUtc,
    };

    [Fact]
    public void Fresh_heartbeat_is_not_stale()
    {
        var now = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        var session = SessionWithHeartbeat(now.AddSeconds(-14));
        Assert.False(HeartbeatExpiryPolicy.IsStale(session, now, Timeout));
    }

    [Fact]
    public void Expired_heartbeat_is_stale()
    {
        var now = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        var session = SessionWithHeartbeat(now.AddSeconds(-16));
        Assert.True(HeartbeatExpiryPolicy.IsStale(session, now, Timeout));
    }

    [Fact]
    public void Heartbeat_exactly_at_timeout_is_not_stale()
    {
        var now = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        var session = SessionWithHeartbeat(now.AddSeconds(-15));
        Assert.False(HeartbeatExpiryPolicy.IsStale(session, now, Timeout));
    }
}
