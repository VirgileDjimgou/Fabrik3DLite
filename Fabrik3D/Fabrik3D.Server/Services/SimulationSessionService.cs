using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;

namespace Fabrik3D.Server.Services;

public class SimulationSessionService
{
    private readonly SimulationSessionRepository _sessions;
    private readonly IHubNotificationService _hub;
    private readonly ILogger<SimulationSessionService> _log;

    public SimulationSessionService(
        SimulationSessionRepository sessions,
        IHubNotificationService hub,
        ILogger<SimulationSessionService> log)
    {
        _sessions = sessions;
        _hub = hub;
        _log = log;
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
    /// Only the claiming simulator may write; version-guarded.
    /// </summary>
    public async Task<SimulationSessionDto?> UpdateStateAsync(
        string id, UpdateSimulationStateRequest request, string? correlationId)
    {
        var session = await _sessions.GetByIdAsync(id);
        if (session is null) return null;

        EnsureOwned(session, request.SimulatorId);

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

        if (!await _sessions.UpdateAsync(session))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Session '{session.Id}' was modified concurrently. Retry the state update.");

        var eventCorrelation = correlationId ?? request.CorrelationId;

        _log.LogInformation(
            "[Server][Simulation] UpdateState → session={SessionId} status={Status} phase={Phase} machined={Machined}/{Total} correlation={CorrelationId}",
            session.Id, session.Status, session.CurrentPhase, session.MachinedCount, session.TotalCount, eventCorrelation);

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, session.JobId, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, DateTime.UtcNow, eventCorrelation));

        return session.ToDto();
    }

    /// <summary>
    /// Simulator sends periodic heartbeat to prove it is still alive.
    /// A heartbeat from the owning simulator revives a faulted session.
    /// </summary>
    public async Task<SimulationSessionDto?> HeartbeatAsync(string id, HeartbeatRequest? request)
    {
        var session = await _sessions.GetByIdAsync(id);
        if (session is null) return null;

        EnsureOwned(session, request?.SimulatorId);

        var now = DateTime.UtcNow;
        var oldStatus = session.Status;

        session.LastHeartbeatUtc = now;
        if (session.Status == SimulationStatus.Faulted)
        {
            session.Status = SimulationStatus.Running;
            session.IsPaused = false;
        }

        if (!await _sessions.UpdateAsync(session))
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Session '{session.Id}' was modified concurrently. Retry the heartbeat.");

        _log.LogDebug("[Server][Simulation] Heartbeat → session={SessionId}", session.Id);

        if (oldStatus == SimulationStatus.Faulted)
        {
            _log.LogInformation("[Server][Simulation] Heartbeat revived faulted session={SessionId}", session.Id);
            await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
                session.Id, session.JobId, session.Status.ToString(),
                session.CurrentPhase, session.MachinedCount,
                session.RemainingCount, session.TotalCount, now));
        }

        return session.ToDto();
    }

    /// <summary>
    /// Checks session ownership (session claimed, caller is the owner).
    /// Allows an ownerless legacy push only when no simulator id was sent.
    /// </summary>
    private static void EnsureOwned(SimulationSession session, string? simulatorId)
    {
        if (string.IsNullOrEmpty(simulatorId))
        {
            throw new OrchestrationConflictException(
                "session_not_owned",
                $"Session '{session.Id}' requires a claiming simulator id. Claim the job first.");
        }

        if (session.SimulatorId != simulatorId)
        {
            throw new OrchestrationConflictException(
                "session_not_owned",
                $"Session '{session.Id}' is owned by simulator '{session.SimulatorId}' and cannot be modified by '{simulatorId}'.");
        }
    }
}
