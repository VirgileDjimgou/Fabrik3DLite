using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;

namespace Fabrik3D.Domain.Control;

/// <summary>Stable, documented authority error codes surfaced by the REST API.</summary>
public static class ControlAuthorityCodes
{
    /// <summary>Another owner already controls the scope.</summary>
    public const string Conflict = "authority_conflict";

    /// <summary>The caller does not currently hold the authority it needs.</summary>
    public const string NotAcquired = "authority_not_acquired";

    /// <summary>A handover precondition failed (connector unhealthy, mapping invalid, not confirmed).</summary>
    public const string HandoverRejected = "authority_handover_rejected";

    /// <summary>The lease expired or the owner became unhealthy; commands fail closed.</summary>
    public const string Lost = "authority_lost";

    /// <summary>Replay is read-only and can never command.</summary>
    public const string ReplayReadOnly = "authority_replay_read_only";

    /// <summary>The requested mode is not a known authority mode.</summary>
    public const string InvalidMode = "authority_invalid_mode";

    /// <summary>The caller is not the owner of the authority and may not release/take it over.</summary>
    public const string NotOwner = "authority_not_owner";

    /// <summary>The request is structurally invalid (for example a missing owner identity).</summary>
    public const string InvalidRequest = "authority_invalid_request";
}

/// <summary>Result of an authority evaluation. Pure data so rules stay unit-testable.</summary>
public sealed record ControlAuthorityDecision(bool Allowed, string? Code, string? Message)
{
    public static readonly ControlAuthorityDecision Allow = new(true, null, null);

    public static ControlAuthorityDecision Deny(string code, string message) => new(false, code, message);
}

/// <summary>
/// Pure authority semantics shared by the server service, the simulator and the tests. It holds no
/// state and never touches persistence or protocols.
/// </summary>
public static class ControlAuthorityRules
{
    public const int DefaultLeaseSeconds = 30;
    public const int MaxLeaseSeconds = 600;

    /// <summary>Only these modes may drive actuators; observed-twin and replay never command.</summary>
    public static bool ModeAllowsCommanding(ControlAuthorityMode mode)
        => mode is ControlAuthorityMode.LocalSimulation or ControlAuthorityMode.ExternalController;

    public static bool TryParseMode(string? value, out ControlAuthorityMode mode)
    {
        if (Enum.TryParse(value?.Trim(), ignoreCase: true, out mode) && Enum.IsDefined(mode))
        {
            return true;
        }

        mode = ControlAuthorityMode.LocalSimulation;
        return false;
    }

    public static bool TryParseOwnerKind(string? value, out ControlAuthorityOwnerKind kind)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "simulator": kind = ControlAuthorityOwnerKind.Simulator; return true;
            case "connector": kind = ControlAuthorityOwnerKind.Connector; return true;
            default: kind = ControlAuthorityOwnerKind.Simulator; return false;
        }
    }

    public static string ToWire(ControlAuthorityMode mode) => mode switch
    {
        ControlAuthorityMode.LocalSimulation => "local-simulation",
        ControlAuthorityMode.ExternalController => "external-controller",
        ControlAuthorityMode.ObservedTwin => "observed-twin",
        ControlAuthorityMode.Replay => "replay",
        _ => "local-simulation",
    };

    public static string ToWire(ControlAuthorityState state) => state switch
    {
        ControlAuthorityState.Available => "available",
        ControlAuthorityState.Held => "held",
        ControlAuthorityState.Degraded => "degraded",
        _ => "available",
    };

    public static string ToWire(ControlAuthorityOwnerKind kind) => kind switch
    {
        ControlAuthorityOwnerKind.Simulator => "simulator",
        ControlAuthorityOwnerKind.Connector => "connector",
        _ => "simulator",
    };

    public static int ClampLeaseSeconds(int requested)
        => requested <= 0 ? DefaultLeaseSeconds : Math.Min(requested, MaxLeaseSeconds);

    /// <summary>True when a held external lease is past its expiry and must be degraded.</summary>
    public static bool IsLeaseExpired(ControlAuthority authority, DateTime nowUtc)
        => authority.State == ControlAuthorityState.Held
           && authority.Mode == ControlAuthorityMode.ExternalController
           && authority.LeaseExpiresAtUtc is { } lease
           && lease <= nowUtc;

    /// <summary>
    /// Decides whether a caller identified by <paramref name="requestedMode"/>/<paramref name="ownerId"/>
    /// may command actuators in the scope. An absent or available document means implicit local
    /// simulation. Fails closed on degraded authority.
    /// </summary>
    public static ControlAuthorityDecision EvaluateCommand(
        ControlAuthority? authority,
        ControlAuthorityMode requestedMode,
        string? ownerId,
        DateTime nowUtc)
    {
        if (!ModeAllowsCommanding(requestedMode))
        {
            return ControlAuthorityDecision.Deny(
                requestedMode == ControlAuthorityMode.Replay
                    ? ControlAuthorityCodes.ReplayReadOnly
                    : ControlAuthorityCodes.NotAcquired,
                $"Mode '{ToWire(requestedMode)}' is read-only and cannot command actuators.");
        }

        if (authority is null || authority.State == ControlAuthorityState.Available)
        {
            return requestedMode == ControlAuthorityMode.LocalSimulation
                ? ControlAuthorityDecision.Allow
                : ControlAuthorityDecision.Deny(
                    ControlAuthorityCodes.NotAcquired,
                    "External control authority has not been acquired for this scope.");
        }

        if (authority.State == ControlAuthorityState.Degraded)
        {
            return ControlAuthorityDecision.Deny(
                ControlAuthorityCodes.Lost,
                $"Control authority for scope '{authority.Id}' is degraded ({authority.DegradedReason ?? "controller lost"}); explicit operator resume or release is required.");
        }

        if (authority.Mode == requestedMode
            && !string.IsNullOrWhiteSpace(ownerId)
            && string.Equals(authority.OwnerId, ownerId, StringComparison.Ordinal))
        {
            return ControlAuthorityDecision.Allow;
        }

        if (authority.Mode == ControlAuthorityMode.LocalSimulation
            && requestedMode == ControlAuthorityMode.LocalSimulation)
        {
            return ControlAuthorityDecision.Allow;
        }

        return ControlAuthorityDecision.Deny(
            ControlAuthorityCodes.Conflict,
            $"Scope '{authority.Id}' is controlled by {ToWire(authority.Mode)}/{authority.OwnerId ?? "unowned"}; '{ownerId ?? ToWire(requestedMode)}' may not drive it.");
    }

    /// <summary>
    /// Validates a plain acquisition. An authority that is already held (or degraded) may only be
    /// re-acquired idempotently by the same owner/mode; otherwise the caller must use takeover.
    /// Replay can never acquire.
    /// </summary>
    public static ControlAuthorityDecision ValidateAcquire(
        ControlAuthority? current,
        ControlAuthorityMode requestedMode,
        string? ownerId)
    {
        if (requestedMode == ControlAuthorityMode.Replay)
        {
            return ControlAuthorityDecision.Deny(
                ControlAuthorityCodes.ReplayReadOnly,
                "Replay is read-only and can never acquire control authority.");
        }

        if (current is null || current.State == ControlAuthorityState.Available)
        {
            return ControlAuthorityDecision.Allow;
        }

        if (current.Mode == requestedMode
            && !string.IsNullOrWhiteSpace(ownerId)
            && string.Equals(current.OwnerId, ownerId, StringComparison.Ordinal))
        {
            return ControlAuthorityDecision.Allow;
        }

        return ControlAuthorityDecision.Deny(
            ControlAuthorityCodes.Conflict,
            $"Scope '{current.Id}' already has an authority ({ToWire(current.Mode)}/{current.OwnerId ?? "unowned"}, state {ToWire(current.State)}); release it or request an explicit takeover.");
    }

    /// <summary>Only the holder may release an authority.</summary>
    public static ControlAuthorityDecision ValidateRelease(ControlAuthority? authority, string? ownerId)
    {
        if (authority is null || authority.State == ControlAuthorityState.Available)
        {
            return ControlAuthorityDecision.Allow;
        }

        if (!string.IsNullOrWhiteSpace(ownerId)
            && string.Equals(authority.OwnerId, ownerId, StringComparison.Ordinal))
        {
            return ControlAuthorityDecision.Allow;
        }

        return ControlAuthorityDecision.Deny(
            ControlAuthorityCodes.NotOwner,
            $"Scope '{authority.Id}' is held by '{authority.OwnerId ?? "unowned"}'; '{ownerId ?? "unknown"}' may not release it.");
    }
}

/// <summary>
/// Precondition probe for an authority owner. The server implementation reports real connector
/// health; tests may substitute a deterministic probe. Unknown owners fail closed.
/// </summary>
public interface IControlAuthorityOwnerProbe
{
    Task<bool> IsOwnerReadyAsync(
        ControlAuthorityOwnerKind ownerKind,
        string ownerId,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Authority check used by orchestration code that is about to drive an actuator or emit a protocol
/// write. Connectors never decide authority themselves; they request it through this boundary.
/// </summary>
public interface IControlAuthorityGate
{
    Task<ControlAuthorityDecision> AuthorizeCommandAsync(
        string scope,
        ControlAuthorityMode requestedMode,
        string? ownerId,
        CancellationToken cancellationToken = default);
}
