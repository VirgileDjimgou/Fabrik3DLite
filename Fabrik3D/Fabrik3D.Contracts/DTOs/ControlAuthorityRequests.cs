using System.ComponentModel.DataAnnotations;

namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Acquires the authority for a scope for the caller's mode/identity. Fails closed on conflict.
/// </summary>
public record AcquireControlAuthorityRequest
{
    /// <summary>One of local-simulation, external-controller, observed-twin, replay.</summary>
    [Required, MinLength(1), MaxLength(50)]
    public string Mode { get; init; } = "LocalSimulation";

    /// <summary>Owner identity (simulator id or connector id). Required for all non-local modes.</summary>
    [MaxLength(200)]
    public string? OwnerId { get; init; }

    /// <summary>One of simulator, connector. Defaults to simulator when omitted.</summary>
    [MaxLength(20)]
    public string? OwnerKind { get; init; }

    /// <summary>Optional lease length in seconds; clamped to the documented bounds.</summary>
    public int LeaseSeconds { get; init; }

    [MaxLength(200)]
    public string? CorrelationId { get; init; }
}

/// <summary>
/// Explicit takeover of an authority that is already held. Requires confirmation and, when the
/// server has a token configured, a matching confirmation token.
/// </summary>
public record TakeoverControlAuthorityRequest
{
    [Required, MinLength(1), MaxLength(50)]
    public string Mode { get; init; } = "ExternalController";

    [Required, MinLength(1), MaxLength(200)]
    public string OwnerId { get; init; } = string.Empty;

    [MaxLength(20)]
    public string? OwnerKind { get; init; }

    /// <summary>Explicit operator acknowledgement. A takeover without confirmation is rejected.</summary>
    public bool Confirm { get; init; }

    /// <summary>Optional confirmation token; required when the server is configured with one.</summary>
    [MaxLength(200)]
    public string? ConfirmationToken { get; init; }

    public int LeaseSeconds { get; init; }

    [MaxLength(200)]
    public string? CorrelationId { get; init; }
}

/// <summary>Releases the authority back to the free/parked state. Only the current owner may release.</summary>
public record ReleaseControlAuthorityRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string OwnerId { get; init; } = string.Empty;

    [MaxLength(200)]
    public string? CorrelationId { get; init; }
}

/// <summary>Refreshes an authority lease. The current owner must present its identity.</summary>
public record HeartbeatControlAuthorityRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public string OwnerId { get; init; } = string.Empty;

    /// <summary>
    /// When true and the authority is degraded, the owner reasserts control. Without this flag a
    /// degraded authority stays degraded (no silent revert).
    /// </summary>
    public bool Resume { get; init; }

    public int LeaseSeconds { get; init; }
}
