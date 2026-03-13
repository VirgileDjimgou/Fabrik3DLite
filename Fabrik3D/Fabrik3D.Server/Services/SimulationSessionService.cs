using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Server.Services;

public class SimulationSessionService
{
    private readonly SimulationSessionRepository _sessions;
    private readonly HubNotificationService _hub;

    public SimulationSessionService(
        SimulationSessionRepository sessions,
        HubNotificationService hub)
    {
        _sessions = sessions;
        _hub = hub;
    }

    public async Task<SimulationSessionDto?> GetByIdAsync(string id)
    {
        var session = await _sessions.GetByIdAsync(id);
        return session?.ToDto();
    }

    public async Task<SimulationSessionDto?> GetByJobIdAsync(string jobId)
    {
        var session = await _sessions.GetByJobIdAsync(jobId);
        return session?.ToDto();
    }

    /// <summary>
    /// Simulator pushes live execution state into an active session.
    /// Persists to MongoDB and broadcasts via SignalR.
    /// </summary>
    public async Task<SimulationSessionDto?> UpdateStateAsync(
        string id, UpdateSimulationStateRequest request)
    {
        var session = await _sessions.GetByIdAsync(id);
        if (session is null) return null;

        if (Enum.TryParse<SimulationStatus>(request.Status, true, out var status))
            session.Status = status;

        session.CurrentPhase = request.CurrentPhase;
        session.CurrentPalletId = request.CurrentPalletId;
        session.CurrentTaskId = request.CurrentTaskId;
        session.CurrentPartId = request.CurrentPartId;
        session.MachinedCount = request.MachinedCount;
        session.RemainingCount = request.RemainingCount;
        session.TotalCount = request.TotalCount;
        session.IsPaused = request.IsPaused;
        session.LastHeartbeatUtc = DateTime.UtcNow;

        await _sessions.UpdateAsync(session);

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, session.JobId, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, DateTime.UtcNow));

        return session.ToDto();
    }

    /// <summary>
    /// Simulator sends periodic heartbeat to prove it is still alive.
    /// </summary>
    public async Task<SimulationSessionDto?> HeartbeatAsync(string id)
    {
        var session = await _sessions.GetByIdAsync(id);
        if (session is null) return null;

        session.LastHeartbeatUtc = DateTime.UtcNow;
        await _sessions.UpdateAsync(session);

        return session.ToDto();
    }
}
