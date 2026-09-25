using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Periodically scans running/paused sessions and marks the ones whose
/// simulator heartbeat has expired as Faulted, broadcasting the change.
/// </summary>
public class HeartbeatMonitorService : BackgroundService
{
    private static readonly SimulationStatus[] MonitoredStatuses =
    [
        SimulationStatus.Running,
        SimulationStatus.Paused,
    ];

    private readonly SimulationSessionRepository _sessions;
    private readonly IHubNotificationService _hub;
    private readonly ILogger<HeartbeatMonitorService> _log;
    private readonly ControlAuthorityService? _authority;
    private readonly TimeSpan _timeout;
    private readonly TimeSpan _checkInterval;

    public HeartbeatMonitorService(
        SimulationSessionRepository sessions,
        IHubNotificationService hub,
        ILogger<HeartbeatMonitorService> log,
        IOptions<OrchestrationOptions> options,
        ControlAuthorityService? authority = null)
    {
        _sessions = sessions;
        _hub = hub;
        _log = log;
        _authority = authority;
        _timeout = TimeSpan.FromSeconds(Math.Max(1, options.Value.HeartbeatTimeoutSeconds));
        _checkInterval = TimeSpan.FromSeconds(Math.Max(1, options.Value.HeartbeatCheckIntervalSeconds));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(_checkInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await CheckNowAsync(stoppingToken);
        }
    }

    /// <summary>Single scan; public so tests can trigger it directly.</summary>
    public async Task CheckNowAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var stale = await _sessions.GetStaleAsync(now - _timeout, MonitoredStatuses);

        foreach (var session in stale)
        {
            if (!HeartbeatExpiryPolicy.IsStale(session, now, _timeout)) continue;

            session.Status = SimulationStatus.Faulted;
            session.IsPaused = false;

            if (!await _sessions.UpdateAsync(session))
            {
                _log.LogDebug("[Server][Heartbeat] Skipped session={SessionId}: concurrent update", session.Id);
                continue;
            }

            _log.LogWarning("[Server][Heartbeat] Expired → session={SessionId} job={JobId} faulted after {Timeout}s without heartbeat",
                session.Id, session.JobId, _timeout.TotalSeconds);

            await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                session.Id, session.JobId, session.Status.ToString(),
                session.CurrentPhase, session.MachinedCount,
                session.RemainingCount, session.TotalCount, now));
        }

        // The same monitor also owns controller lease expiry so there is a single heartbeat scan
        // (S36). Expired external leases degrade and never silently revert to another authority.
        if (_authority is not null)
        {
            await _authority.ExpireLeasesAsync(now, cancellationToken);
        }
    }
}
