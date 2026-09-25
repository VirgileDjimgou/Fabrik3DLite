using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Control;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Server-domain control authority (S36). It owns the exclusivity, handover and degraded-mode rules,
/// persists the authority document and its append-only audit trail, and broadcasts every transition
/// on the orchestration hub. It is also the production <see cref="IControlAuthorityGate"/>.
///
/// Semantics:
/// - the document id is the equipment/actuator scope, so two owners cannot both be authoritative;
/// - an absent document means implicit local simulation (migration/backward compatibility);
/// - replay can never acquire or command;
/// - a lost controller lease degrades the authority and never silently reverts to local simulation.
/// </summary>
public class ControlAuthorityService : IControlAuthorityGate
{
    public const string EventAcquired = "authority_acquired";
    public const string EventReleased = "authority_released";
    public const string EventTakeover = "authority_takeover";
    public const string EventDegraded = "authority_degraded";
    public const string EventResumed = "authority_resumed";
    public const string EventHeartbeat = "authority_heartbeat";
    public const string EventQuiesce = "authority_quiesce";
    public const string EventConflict = "authority_conflict";

    private readonly ControlAuthorityRepository _repository;
    private readonly IHubNotificationService _hub;
    private readonly IControlAuthorityOwnerProbe _probe;
    private readonly ILogger<ControlAuthorityService> _log;
    private readonly TimeProvider _time;
    private readonly ICurrentIdentity? _identity;
    private readonly int _defaultLeaseSeconds;
    private readonly bool _requireConfirmation;
    private readonly string? _confirmationToken;

    private Task? _indexesReady;

    public ControlAuthorityService(
        ControlAuthorityRepository repository,
        IHubNotificationService hub,
        IControlAuthorityOwnerProbe probe,
        IOptions<OrchestrationOptions> options,
        TimeProvider timeProvider,
        ILogger<ControlAuthorityService> log,
        ICurrentIdentity? identity = null)
    {
        _repository = repository;
        _hub = hub;
        _probe = probe;
        _log = log;
        _time = timeProvider;
        _identity = identity;
        var settings = options.Value;
        _defaultLeaseSeconds = ControlAuthorityRules.ClampLeaseSeconds(settings.AuthorityLeaseSeconds);
        _requireConfirmation = settings.RequireAuthorityConfirmation;
        _confirmationToken = settings.AuthorityConfirmationToken;
    }

    // ── Reads ──────────────────────────────────────────────────────────

    public async Task<ControlAuthorityDto> GetAsync(string scope, CancellationToken cancellationToken = default)
    {
        await EnsureIndexesAsync();
        var authority = await _repository.GetAsync(scope);
        if (authority is not null)
        {
            return authority.ToDto();
        }

        // Documented migration: an absent authority document means implicit local simulation with a
        // diagnostic, never an error and never an externally held lease.
        return new ControlAuthorityDto(
            scope,
            ControlAuthorityRules.ToWire(ControlAuthorityMode.LocalSimulation),
            ControlAuthorityRules.ToWire(ControlAuthorityState.Available),
            null, null, null, null, null, 0, null, null,
            IsPersisted: false,
            Diagnostic: "no-authority-document; treated as implicit local-simulation");
    }

    public async Task<IReadOnlyList<ControlAuthorityEventDto>> GetAuditAsync(
        string scope, int limit, CancellationToken cancellationToken = default)
    {
        await EnsureIndexesAsync();
        var events = await _repository.GetEventsAsync(scope, limit);
        return events.Select(e => e.ToDto()).ToList();
    }

    // ── Acquisition and handover ───────────────────────────────────────

    public async Task<ControlAuthorityDto> AcquireAsync(
        string scope, AcquireControlAuthorityRequest request, string? correlationId)
    {
        await EnsureIndexesAsync();

        if (!ControlAuthorityRules.TryParseMode(request.Mode, out var mode))
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.InvalidMode,
                $"'{request.Mode}' is not a valid control authority mode.");
        }

        var ownerKind = ResolveOwnerKind(request.OwnerKind);
        ValidateOwner(mode, request.OwnerId);

        var now = UtcNow();
        var current = await _repository.GetAsync(scope);

        var decision = ControlAuthorityRules.ValidateAcquire(current, mode, request.OwnerId);
        if (!decision.Allowed)
        {
            await AuditAsync(scope, EventConflict, mode, current?.Mode, current?.OwnerId, request.OwnerId,
                correlationId, $"{decision.Code}: {decision.Message}", now);
            throw new OrchestrationConflictException(decision.Code!, decision.Message!);
        }

        if (mode == ControlAuthorityMode.ExternalController
            && !await _probe.IsOwnerReadyAsync(ownerKind, request.OwnerId!, CancellationToken.None))
        {
            await AuditAsync(scope, EventConflict, mode, current?.Mode, current?.OwnerId, request.OwnerId,
                correlationId, "handover rejected: owner not connected/healthy or mapping not validated", now);
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.HandoverRejected,
                $"External owner '{request.OwnerId}' is not connected, healthy or validated; refusing the handover.");
        }

        return await TransitionAsync(scope, mode, ownerKind, request.OwnerId, current, correlationId,
            request.LeaseSeconds, takeover: false, now);
    }

    public async Task<ControlAuthorityDto> TakeoverAsync(
        string scope, TakeoverControlAuthorityRequest request, string? correlationId)
    {
        await EnsureIndexesAsync();

        if (!ControlAuthorityRules.TryParseMode(request.Mode, out var mode))
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.InvalidMode,
                $"'{request.Mode}' is not a valid control authority mode.");
        }

        if (mode == ControlAuthorityMode.Replay)
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.ReplayReadOnly,
                "Replay is read-only and can never take over control authority.");
        }

        ValidateOwner(mode, request.OwnerId);
        var ownerKind = ResolveOwnerKind(request.OwnerKind);

        if (_requireConfirmation && !request.Confirm)
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.HandoverRejected,
                "Takeover requires an explicit operator confirmation.");
        }

        if (!string.IsNullOrWhiteSpace(_confirmationToken)
            && !string.Equals(request.ConfirmationToken, _confirmationToken, StringComparison.Ordinal))
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.HandoverRejected,
                "Takeover confirmation token is missing or invalid.");
        }

        if (mode == ControlAuthorityMode.ExternalController
            && !await _probe.IsOwnerReadyAsync(ownerKind, request.OwnerId, CancellationToken.None))
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.HandoverRejected,
                $"External owner '{request.OwnerId}' is not connected, healthy or validated; refusing the takeover.");
        }

        var now = UtcNow();
        var current = await _repository.GetAsync(scope);
        return await TransitionAsync(scope, mode, ownerKind, request.OwnerId, current, correlationId,
            request.LeaseSeconds, takeover: true, now);
    }

    public async Task<ControlAuthorityDto> ReleaseAsync(
        string scope, ReleaseControlAuthorityRequest request, string? correlationId)
    {
        await EnsureIndexesAsync();

        var current = await _repository.GetAsync(scope);
        var decision = ControlAuthorityRules.ValidateRelease(current, request.OwnerId);
        if (!decision.Allowed)
        {
            throw new OrchestrationConflictException(decision.Code!, decision.Message!);
        }

        var now = UtcNow();

        if (current is null || current.State == ControlAuthorityState.Available)
        {
            await AuditAsync(scope, EventReleased, ControlAuthorityMode.LocalSimulation, current?.Mode,
                current?.OwnerId, request.OwnerId, correlationId,
                "release was a no-op; authority already available", now);
            return (current ?? CreateDefault(scope)).ToDto(current is not null);
        }

        var previousMode = current.Mode;
        var previousOwner = current.OwnerId;
        current.Mode = ControlAuthorityMode.LocalSimulation;
        current.State = ControlAuthorityState.Available;
        current.OwnerId = null;
        current.OwnerKind = null;
        current.AcquiredAtUtc = null;
        current.LeaseExpiresAtUtc = null;
        current.LastHeartbeatUtc = null;
        current.DegradedReason = null;
        current.CorrelationId = correlationId;
        current.UpdatedAtUtc = now;

        if (!await _repository.ReplaceAsync(current))
        {
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Control authority '{scope}' was modified concurrently. Retry the release.");
        }

        await AuditAsync(scope, EventReleased, ControlAuthorityMode.LocalSimulation, previousMode, previousOwner,
            request.OwnerId, correlationId,
            $"released from {ControlAuthorityRules.ToWire(previousMode)}/{previousOwner ?? "unowned"}", now);

        var dto = current.ToDto();
        await BroadcastAsync(dto, previousMode, previousOwner, EventReleased, correlationId, now);
        return dto;
    }

    // ── Lease heartbeat and degraded mode ──────────────────────────────

    public async Task<ControlAuthorityDto> HeartbeatAsync(
        string scope, HeartbeatControlAuthorityRequest request, string? correlationId)
    {
        await EnsureIndexesAsync();

        var current = await _repository.GetAsync(scope);
        if (current is null || current.State == ControlAuthorityState.Available)
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.NotAcquired,
                $"Scope '{scope}' has no active authority to heartbeat.");
        }

        if (!string.Equals(current.OwnerId, request.OwnerId, StringComparison.Ordinal))
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.NotOwner,
                $"Scope '{scope}' is held by '{current.OwnerId ?? "unowned"}'; '{request.OwnerId}' may not heartbeat it.");
        }

        var now = UtcNow();
        var previousState = current.State;
        var revived = false;

        current.LastHeartbeatUtc = now;
        if (current.Mode == ControlAuthorityMode.ExternalController)
        {
            current.LeaseExpiresAtUtc = now.AddSeconds(
                ControlAuthorityRules.ClampLeaseSeconds(
                    request.LeaseSeconds <= 0 ? _defaultLeaseSeconds : request.LeaseSeconds));
        }

        if (current.State == ControlAuthorityState.Degraded && request.Resume)
        {
            current.State = ControlAuthorityState.Held;
            current.DegradedReason = null;
            revived = true;
        }

        current.UpdatedAtUtc = now;

        if (!await _repository.ReplaceAsync(current))
        {
            throw new OrchestrationConflictException(
                "concurrent_modification",
                $"Control authority '{scope}' was modified concurrently. Retry the heartbeat.");
        }

        await AuditAsync(scope, revived ? EventResumed : EventHeartbeat, current.Mode, current.Mode, current.OwnerId,
            request.OwnerId, correlationId,
            revived ? "owner resumed a degraded authority" : null, now);

        var dto = current.ToDto();
        if (previousState != current.State)
        {
            await BroadcastAsync(dto, current.Mode, current.OwnerId, revived ? EventResumed : EventHeartbeat,
                correlationId, now);
        }

        return dto;
    }

    /// <summary>
    /// Degrades held external leases that are past their expiry. Never grants authority to anyone
    /// else, so a running cycle cannot silently revert to another owner.
    /// </summary>
    public async Task<int> ExpireLeasesAsync(DateTime nowUtc, CancellationToken cancellationToken = default)
    {
        await EnsureIndexesAsync();
        var expired = await _repository.GetExpiredLeasesAsync(nowUtc);
        var degraded = 0;

        foreach (var authority in expired)
        {
            var previousMode = authority.Mode;
            var previousOwner = authority.OwnerId;
            authority.State = ControlAuthorityState.Degraded;
            authority.DegradedReason = "controller-heartbeat-lost";
            authority.UpdatedAtUtc = nowUtc;

            if (!await _repository.ReplaceAsync(authority))
            {
                _log.LogDebug("[Server][Authority] Skipped lease expiry for scope={Scope}: concurrent update.", authority.Id);
                continue;
            }

            degraded++;
            _log.LogWarning(
                "[Server][Authority] Lease expired → scope={Scope} owner={OwnerId} degraded (outputs de-energized, no silent takeover)",
                authority.Id, previousOwner);

            await AuditAsync(authority.Id, EventDegraded, ControlAuthorityMode.ExternalController,
                previousMode, previousOwner, previousOwner, null,
                "controller heartbeat/lease lost", nowUtc, actorId: "system");

            await BroadcastAsync(authority.ToDto(), previousMode, previousOwner, EventDegraded, null, nowUtc);
        }

        return degraded;
    }

    // ── Gate ───────────────────────────────────────────────────────────

    public async Task<ControlAuthorityDecision> AuthorizeCommandAsync(
        string scope,
        ControlAuthorityMode requestedMode,
        string? ownerId,
        CancellationToken cancellationToken = default)
    {
        await EnsureIndexesAsync();
        var authority = await _repository.GetAsync(scope);
        return ControlAuthorityRules.EvaluateCommand(authority, requestedMode, ownerId, UtcNow());
    }

    // ── Internals ──────────────────────────────────────────────────────

    private async Task<ControlAuthorityDto> TransitionAsync(
        string scope,
        ControlAuthorityMode mode,
        ControlAuthorityOwnerKind ownerKind,
        string? ownerId,
        ControlAuthority? current,
        string? correlationId,
        int requestedLeaseSeconds,
        bool takeover,
        DateTime now)
    {
        var previousMode = current?.Mode;
        var previousOwner = current?.OwnerId;
        var isNew = current is null;
        var authority = current ?? CreateDefault(scope);
        var leaseSeconds = ControlAuthorityRules.ClampLeaseSeconds(
            requestedLeaseSeconds <= 0 ? _defaultLeaseSeconds : requestedLeaseSeconds);

        // Quiesce documented before the transfer: actuators hold with outputs de-energized until the
        // new owner issues its first command.
        await AuditAsync(scope, EventQuiesce, mode, previousMode, previousOwner, ownerId, correlationId,
            "outputs de-energized; actuators hold position during handover", now);

        authority.Mode = mode;
        authority.State = ControlAuthorityState.Held;
        authority.OwnerKind = ownerKind;
        authority.OwnerId = ownerId;
        authority.AcquiredAtUtc = now;
        authority.LastHeartbeatUtc = now;
        authority.LeaseExpiresAtUtc = mode == ControlAuthorityMode.ExternalController
            ? now.AddSeconds(leaseSeconds)
            : null;
        authority.DegradedReason = null;
        authority.CorrelationId = correlationId;
        authority.UpdatedAtUtc = now;

        var persisted = isNew
            ? await _repository.TryCreateAsync(authority)
            : await _repository.ReplaceAsync(authority);

        if (!persisted)
        {
            await AuditAsync(scope, EventConflict, mode, previousMode, previousOwner, ownerId, correlationId,
                "concurrent authority acquisition lost the race", now);
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.Conflict,
                $"Scope '{scope}' was acquired concurrently. Retry or request an explicit takeover.");
        }

        var eventType = takeover ? EventTakeover : EventAcquired;
        await AuditAsync(scope, eventType, mode, previousMode, previousOwner, ownerId, correlationId,
            takeover
                ? $"takeover from {ControlAuthorityRules.ToWire(previousMode ?? ControlAuthorityMode.LocalSimulation)}/{previousOwner ?? "unowned"}"
                : null, now);

        var dto = authority.ToDto();
        await BroadcastAsync(dto, previousMode, previousOwner, eventType, correlationId, now);

        _log.LogInformation(
            "[Server][Authority] {Event} → scope={Scope} mode={Mode} owner={OwnerId} leaseExpires={Lease} correlation={CorrelationId}",
            eventType, scope, ControlAuthorityRules.ToWire(mode), ownerId, authority.LeaseExpiresAtUtc, correlationId);

        return dto;
    }

    private static ControlAuthority CreateDefault(string scope) => new()
    {
        Id = scope,
        Mode = ControlAuthorityMode.LocalSimulation,
        State = ControlAuthorityState.Available,
        Version = 0,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    private static void ValidateOwner(ControlAuthorityMode mode, string? ownerId)
    {
        if (mode != ControlAuthorityMode.LocalSimulation && string.IsNullOrWhiteSpace(ownerId))
        {
            throw new OrchestrationConflictException(
                ControlAuthorityCodes.InvalidRequest,
                $"Mode '{ControlAuthorityRules.ToWire(mode)}' requires an owner identity.");
        }
    }

    private static ControlAuthorityOwnerKind ResolveOwnerKind(string? value)
        => ControlAuthorityRules.TryParseOwnerKind(value, out var kind)
            ? kind
            : ControlAuthorityOwnerKind.Simulator;

    private Task AuditAsync(
        string scope,
        string eventType,
        ControlAuthorityMode mode,
        ControlAuthorityMode? previousMode,
        string? previousOwnerId,
        string? ownerId,
        string? correlationId,
        string? detail,
        DateTime now,
        string? actorId = null)
    {
        var actor = actorId ?? _identity?.AuditId ?? "system";
        var entry = new ControlAuthorityEvent
        {
            Scope = scope,
            EventType = eventType,
            Mode = ControlAuthorityRules.ToWire(mode),
            PreviousMode = previousMode is null ? null : ControlAuthorityRules.ToWire(previousMode.Value),
            OwnerId = ownerId,
            PreviousOwnerId = previousOwnerId,
            CorrelationId = correlationId,
            Detail = detail,
            ActorId = string.IsNullOrWhiteSpace(actor) ? "system" : actor,
            ActorRole = _identity?.Roles.FirstOrDefault(),
            TimestampUtc = now,
        };

        return _repository.AppendEventAsync(entry);
    }

    private Task BroadcastAsync(
        ControlAuthorityDto dto,
        ControlAuthorityMode? previousMode,
        string? previousOwner,
        string eventType,
        string? correlationId,
        DateTime now)
    {
        var evt = new ControlAuthorityChangedEvent(
            dto.Scope,
            dto.Mode,
            dto.State,
            dto.OwnerId,
            dto.OwnerKind,
            previousMode is null ? null : ControlAuthorityRules.ToWire(previousMode.Value),
            previousOwner,
            dto.DegradedReason,
            dto.LeaseExpiresAtUtc,
            eventType,
            now,
            correlationId);

        return _hub.ControlAuthorityChangedAsync(evt);
    }

    private Task EnsureIndexesAsync() => _indexesReady ??= _repository.EnsureIndexesAsync();

    private DateTime UtcNow() => _time.GetUtcNow().UtcDateTime;
}
