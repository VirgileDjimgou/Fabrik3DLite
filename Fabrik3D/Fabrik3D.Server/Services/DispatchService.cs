using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Server-authoritative job dispatch (S51). The HMI issues operator intent; this service validates
/// job state, tenant, authorization and target availability, persists the assignment/session intent,
/// publishes a targeted execution request to the assigned simulator's SignalR group, and tracks the
/// claim/ACK/running lifecycle. It never silently reassigns another simulator on timeout.
/// </summary>
public class DispatchService
{
    private readonly JobRepository _jobs;
    private readonly TaskRepository _tasks;
    private readonly SimulationSessionRepository _sessions;
    private readonly IHubNotificationService _hub;
    private readonly SimulatorRegistry _registry;
    private readonly ILogger<DispatchService> _log;
    private readonly TimeSpan _ackTimeout;
    private readonly string _defaultCellId;
    private readonly bool _enabled;

    public DispatchService(
        JobRepository jobs,
        TaskRepository tasks,
        SimulationSessionRepository sessions,
        IHubNotificationService hub,
        SimulatorRegistry registry,
        ILogger<DispatchService> log,
        IOptions<OrchestrationOptions> options)
    {
        _jobs = jobs;
        _tasks = tasks;
        _sessions = sessions;
        _hub = hub;
        _registry = registry;
        _log = log;
        _ackTimeout = TimeSpan.FromSeconds(Math.Max(1, options.Value.DispatchAckTimeoutSeconds));
        _defaultCellId = string.IsNullOrWhiteSpace(options.Value.DefaultCellId)
            ? "reference-cell"
            : options.Value.DefaultCellId.Trim();
        _enabled = options.Value.AuthoritativeDispatchEnabled;
    }

    /// <summary>
    /// Starts a job through the authoritative dispatch path. Returns null when the job does not
    /// exist in the caller's tenant (no cross-tenant existence leak).
    /// </summary>
    public async Task<DispatchResultDto?> StartDispatchAsync(
        string jobId, StartJobDispatchRequest request, string? correlationId)
    {
        if (!_enabled)
        {
            throw new OrchestrationConflictException(
                "dispatch_disabled",
                "Authoritative dispatch is disabled by configuration. Use the legacy start/claim path.");
        }

        var job = await _jobs.GetByIdAsync(jobId);
        if (job is null) return null;

        var now = DateTime.UtcNow;
        var dispatchCorrelationId = string.IsNullOrWhiteSpace(correlationId)
            ? Guid.NewGuid().ToString("N")
            : correlationId!;

        // Idempotent duplicate dispatch: an already-dispatched job returns its current state.
        if (job.DispatchState is DispatchState.Pending or DispatchState.Acknowledged or DispatchState.Running)
        {
            return await BuildResultAsync(job, dispatchCorrelationId);
        }

        JobStateTransitionRules.EnsureCanStart(job.Status);

        var targetCellId = ResolveTargetCell(job, request);
        var assignedSimulatorId = ResolveAssignedSimulator(request, targetCellId, now);

        var tasks = await _tasks.GetByJobIdAsync(job.Id);

        // Persist assignment/session intent BEFORE publishing the targeted request.
        var session = new SimulationSession
        {
            JobId = job.Id,
            Status = SimulationStatus.Running,
            TotalCount = tasks.Count,
            RemainingCount = tasks.Count,
            SimulatorId = assignedSimulatorId,
            TargetCellId = targetCellId,
            CorrelationId = dispatchCorrelationId,
            LastHeartbeatUtc = now,
        };
        await _sessions.CreateAsync(session);

        var oldStatus = job.Status.ToString();
        job.Status = JobStatus.Running;
        job.StartedAtUtc = now;
        job.UpdatedAtUtc = now;
        job.SimulationSessionId = session.Id;
        job.TargetCellId = targetCellId;
        job.AssignedSimulatorId = assignedSimulatorId;
        job.DispatchState = DispatchState.Pending;
        job.DispatchCorrelationId = dispatchCorrelationId;
        job.DispatchedAtUtc = now;
        job.DispatchAcknowledgedAtUtc = null;
        job.DispatchTimeoutAtUtc = now.Add(_ackTimeout);
        job.DispatchFailureReason = null;

        if (!await _jobs.UpdateAsync(job))
        {
            await _sessions.DeleteAsync(session.Id);
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Job '{jobId}' was modified concurrently. Reload the job and retry.");
        }

        _log.LogInformation(
            "[Server][Dispatch] Pending → job={JobId} session={SessionId} cell={Cell} simulator={SimulatorId} correlation={CorrelationId} timeoutAt={TimeoutAt}",
            job.Id, session.Id, targetCellId, assignedSimulatorId, dispatchCorrelationId, job.DispatchTimeoutAtUtc);

        await _hub.JobStateChangedAsync(new JobStateChangedEvent(
            job.Id, oldStatus, job.Status.ToString(), now, dispatchCorrelationId));

        await _hub.SimulationStateChangedAsync(new SimulationStateChangedEvent(
            session.Id, job.Id, session.Status.ToString(),
            session.CurrentPhase, session.MachinedCount,
            session.RemainingCount, session.TotalCount, now, dispatchCorrelationId));

        await _hub.DispatchStateChangedAsync(new DispatchStateChangedEvent(
            job.Id, session.Id, DispatchState.Pending.ToString(),
            targetCellId, assignedSimulatorId, dispatchCorrelationId, null, now));

        // Targeted publish: only the assigned simulator's group receives the execution request.
        await _hub.ExecutionDispatchRequestedAsync(new ExecutionDispatchRequestedEvent(
            job.Id, session.Id, targetCellId, assignedSimulatorId, dispatchCorrelationId,
            now, job.DispatchTimeoutAtUtc!.Value, tasks.Select(t => t.Id).ToList()));

        return await BuildResultAsync(job, dispatchCorrelationId);
    }

    /// <summary>
    /// Accepts a claim/ACK/running transition from the assigned simulator. Rejects foreign claims,
    /// mismatched correlation/session/target and stale versions deterministically.
    /// </summary>
    public async Task<DispatchResultDto?> AcknowledgeAsync(
        string jobId, DispatchAckRequest request, string? correlationId)
    {
        var job = await _jobs.GetByIdAsync(jobId);
        if (job is null) return null;

        if (job.DispatchState == DispatchState.None)
        {
            throw new OrchestrationConflictException(
                "dispatch_not_requested",
                $"Job '{jobId}' has no active dispatch to acknowledge.");
        }

        if (!string.Equals(job.AssignedSimulatorId, request.SimulatorId, StringComparison.Ordinal))
        {
            throw new OrchestrationConflictException(
                "dispatch_foreign_claim",
                $"Job '{jobId}' is assigned to another simulator.");
        }

        if (!string.Equals(job.DispatchCorrelationId, request.CorrelationId, StringComparison.Ordinal))
        {
            throw new OrchestrationConflictException(
                "dispatch_correlation_mismatch",
                $"Job '{jobId}' dispatch correlation id does not match.");
        }

        if (!string.IsNullOrWhiteSpace(request.TargetCellId)
            && !string.Equals(job.TargetCellId, request.TargetCellId, StringComparison.Ordinal))
        {
            throw new OrchestrationConflictException(
                "dispatch_target_mismatch",
                $"Job '{jobId}' is assigned to cell '{job.TargetCellId}', not '{request.TargetCellId}'.");
        }

        if (!string.IsNullOrWhiteSpace(request.SimulationSessionId)
            && !string.Equals(job.SimulationSessionId, request.SimulationSessionId, StringComparison.Ordinal))
        {
            throw new OrchestrationConflictException(
                "dispatch_session_mismatch",
                $"Job '{jobId}' is bound to a different simulation session.");
        }

        if (!Enum.TryParse<DispatchState>(request.State, true, out var requestedState)
            || requestedState is not (DispatchState.Acknowledged or DispatchState.Running or DispatchState.Failed))
        {
            throw new OrchestrationConflictException(
                "dispatch_invalid_state",
                $"Dispatch state '{request.State}' is not a valid simulator acknowledgement.");
        }

        var now = DateTime.UtcNow;

        // Idempotent duplicate ACK: same or later state is accepted without regression.
        if (job.DispatchState == DispatchState.Running && requestedState != DispatchState.Failed)
        {
            return await BuildResultAsync(job, request.CorrelationId);
        }

        if (job.DispatchState == DispatchState.TimedOut && requestedState != DispatchState.Failed)
        {
            // A late ACK after timeout is rejected: the job is not running and must be re-dispatched.
            throw new OrchestrationConflictException(
                "dispatch_timed_out",
                $"Job '{jobId}' dispatch timed out and cannot be acknowledged. Re-dispatch the job.");
        }

        job.DispatchState = requestedState;
        job.UpdatedAtUtc = now;
        if (requestedState == DispatchState.Acknowledged)
        {
            job.DispatchAcknowledgedAtUtc = now;
        }
        else if (requestedState == DispatchState.Failed)
        {
            job.DispatchFailureReason = request.FailureReason ?? "Simulator reported dispatch failure.";
        }

        if (!await _jobs.UpdateAsync(job))
        {
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Job '{jobId}' was modified concurrently. Reload the job and retry.");
        }

        _log.LogInformation(
            "[Server][Dispatch] {State} → job={JobId} simulator={SimulatorId} correlation={CorrelationId}",
            requestedState, job.Id, request.SimulatorId, request.CorrelationId);

        await _hub.DispatchStateChangedAsync(new DispatchStateChangedEvent(
            job.Id, job.SimulationSessionId ?? string.Empty, requestedState.ToString(),
            job.TargetCellId, job.AssignedSimulatorId, job.DispatchCorrelationId,
            job.DispatchFailureReason, now));

        return await BuildResultAsync(job, request.CorrelationId);
    }

    /// <summary>
    /// Marks pending dispatches whose acknowledgement window elapsed as <c>TimedOut</c>. Called by
    /// the heartbeat monitor. A timed-out dispatch never silently assigns another simulator.
    /// </summary>
    public async Task<int> ExpirePendingDispatchesAsync(DateTime nowUtc, CancellationToken cancellationToken = default)
    {
        var pending = await _jobs.GetPendingDispatchesAsync(nowUtc);
        var expired = 0;

        foreach (var job in pending)
        {
            if (job.DispatchTimeoutAtUtc is null || job.DispatchTimeoutAtUtc > nowUtc) continue;

            job.DispatchState = DispatchState.TimedOut;
            job.DispatchFailureReason = "No acknowledgement from the assigned simulator before the dispatch timeout.";
            job.UpdatedAtUtc = nowUtc;

            if (!await _jobs.UpdateAsync(job))
            {
                _log.LogDebug("[Server][Dispatch] Skipped timeout job={JobId}: concurrent update", job.Id);
                continue;
            }

            expired++;
            _log.LogWarning(
                "[Server][Dispatch] TimedOut → job={JobId} simulator={SimulatorId} correlation={CorrelationId}",
                job.Id, job.AssignedSimulatorId, job.DispatchCorrelationId);

            await _hub.DispatchStateChangedAsync(new DispatchStateChangedEvent(
                job.Id, job.SimulationSessionId ?? string.Empty, DispatchState.TimedOut.ToString(),
                job.TargetCellId, job.AssignedSimulatorId, job.DispatchCorrelationId,
                job.DispatchFailureReason, nowUtc));
        }

        return expired;
    }

    /// <summary>Current dispatch state for a job, or null when the job is not visible.</summary>
    public async Task<DispatchResultDto?> GetDispatchAsync(string jobId)
    {
        var job = await _jobs.GetByIdAsync(jobId);
        return job is null ? null : await BuildResultAsync(job, job.DispatchCorrelationId);
    }

    // ── Target resolution ────────────────────────────────────────

    private string ResolveTargetCell(Job job, StartJobDispatchRequest request)
    {
        var requested = request.TargetCellId?.Trim();
        if (!string.IsNullOrWhiteSpace(requested))
        {
            // A requested cell must match the job's declared target when one exists.
            if (!string.IsNullOrWhiteSpace(job.TargetCellId)
                && !string.Equals(job.TargetCellId, requested, StringComparison.Ordinal))
            {
                throw new OrchestrationConflictException(
                    "dispatch_target_incompatible",
                    $"Job '{job.Id}' targets cell '{job.TargetCellId}' and cannot run on '{requested}'.");
            }
            return requested!;
        }

        return string.IsNullOrWhiteSpace(job.TargetCellId) ? _defaultCellId : job.TargetCellId!;
    }

    private string ResolveAssignedSimulator(StartJobDispatchRequest request, string targetCellId, DateTime now)
    {
        var requested = request.SimulatorId?.Trim();
        if (!string.IsNullOrWhiteSpace(requested))
        {
            // An explicitly requested simulator must be registered for the target cell.
            var registeredCell = _registry.CellFor(requested);
            if (registeredCell is not null
                && !string.Equals(registeredCell, targetCellId, StringComparison.Ordinal))
            {
                throw new OrchestrationConflictException(
                    "dispatch_target_incompatible",
                    $"Simulator '{requested}' is registered for cell '{registeredCell}', not '{targetCellId}'.");
            }
            return requested!;
        }

        var resolved = _registry.ResolveForCell(targetCellId, now);
        if (resolved is null)
        {
            throw new OrchestrationConflictException(
                "dispatch_no_target",
                $"No simulator is available for cell '{targetCellId}'. The job was not started.");
        }
        return resolved;
    }

    private async Task<DispatchResultDto> BuildResultAsync(Job job, string? correlationId)
    {
        var tasks = await _tasks.GetByJobIdAsync(job.Id);
        SimulationSessionDto? sessionDto = null;
        if (job.SimulationSessionId is not null)
        {
            var session = await _sessions.GetByIdAsync(job.SimulationSessionId);
            sessionDto = session?.ToDto();
        }

        sessionDto ??= new SimulationSessionDto(
            string.Empty, job.Id, SimulationStatus.Idle.ToString(),
            job.CreatedAtUtc, null, false, string.Empty,
            null, null, null, 0, 0, 0, job.UpdatedAtUtc,
            job.AssignedSimulatorId, correlationId, job.Version,
            null, null, 0, job.TargetCellId);

        return new DispatchResultDto(
            job.ToDto(), sessionDto, tasks.Select(t => t.ToDto()).ToList(),
            job.DispatchState.ToString(), job.TargetCellId, job.AssignedSimulatorId,
            job.DispatchCorrelationId, job.DispatchTimeoutAtUtc, job.DispatchFailureReason);
    }
}
