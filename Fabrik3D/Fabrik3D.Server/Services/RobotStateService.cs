using System.Collections.Concurrent;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Control;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Hubs;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Pure, deterministic jog rules shared by the server service and the tests (S53). It never touches
/// persistence, the hub or SignalR; it answers only "may this intent proceed and why".
/// </summary>
public static class JogCommandRules
{
    public const string ActionPress = "press";
    public const string ActionRelease = "release";
    public const string ManualMode = "manual-training";

    public const string CodeRobotUnavailable = "robot_unavailable";
    public const string CodeStaleTelemetry = "robot_telemetry_stale";
    public const string CodeModeNotCompatible = "mode_not_compatible";
    public const string CodeSimulatorOffline = "simulator_offline";
    public const string CodeDeadManRequired = "dead_man_required";
    public const string CodeInvalidJoint = "invalid_joint";
    public const string CodeInvalidDirection = "invalid_direction";
    public const string CodeReplayReadOnly = "authority_replay_read_only";
    public const string CodeInvalidRobotState = "invalid_robot_state";

    /// <summary>True when the action is a recognized press/release pair.</summary>
    public static bool IsRelease(string? action)
        => string.Equals(action?.Trim(), ActionRelease, StringComparison.OrdinalIgnoreCase);

    /// <summary>Parses J1..J6 (or 1..6) into a zero-based axis index, or -1 when invalid.</summary>
    public static int ParseJointIndex(string? joint)
    {
        if (string.IsNullOrWhiteSpace(joint)) return -1;
        var value = joint.Trim();
        if (value.StartsWith('J') || value.StartsWith('j')) value = value[1..];
        return int.TryParse(value, out var number) && number is >= 1 and <= 6 ? number - 1 : -1;
    }

    /// <summary>True when the direction is exactly -1 or 1.</summary>
    public static bool IsValidDirection(int direction) => direction is -1 or 1;

    /// <summary>
    /// Pre-flight validation for a jog press. Returns null when the intent may proceed. The control
    /// authority decision is evaluated separately because it is asynchronous.
    /// </summary>
    public static string? ValidatePress(RobotPositionsDto? snapshot, string? mode, int direction, string? deadManToken)
    {
        if (snapshot is null) return CodeRobotUnavailable;
        if (snapshot.IsStale) return CodeStaleTelemetry;
        if (string.Equals(snapshot.ControlAuthorityMode, "replay", StringComparison.OrdinalIgnoreCase)
            || string.Equals(mode?.Trim(), "replay", StringComparison.OrdinalIgnoreCase))
        {
            return CodeReplayReadOnly;
        }
        if (!string.Equals(mode?.Trim(), ManualMode, StringComparison.OrdinalIgnoreCase)) return CodeModeNotCompatible;
        // Defence in depth: the simulator's published mode must also be compatible.
        if (!string.Equals(snapshot.OperatingMode, ManualMode, StringComparison.OrdinalIgnoreCase)) return CodeModeNotCompatible;
        if (!IsValidDirection(direction)) return CodeInvalidDirection;
        if (string.IsNullOrWhiteSpace(deadManToken)) return CodeDeadManRequired;
        return null;
    }

    /// <summary>Structural validation shared by press and release.</summary>
    public static string? ValidateJoint(string? joint) => ParseJointIndex(joint) < 0 ? CodeInvalidJoint : null;
}

/// <summary>
/// Authoritative robot-position snapshot store and jog command authority (S53). Positions arrive
/// from the assigned simulator through the scoped REST contract; the server never fabricates a
/// pose. Jog intent is authorized here (role is enforced by the controller policy) and is published
/// to the assigned simulator's SignalR group only. Staleness is computed at read time from a
/// documented cadence so a disconnected simulator is never shown as live.
/// </summary>
public sealed class RobotStateService
{
    private const int MaxAuditEntriesPerRobot = 200;
    private const int MaxRobots = 256;

    private sealed record Snapshot(RobotPositionsDto Dto, DateTime PublishedAtUtc);

    private readonly IControlAuthorityGate _authority;
    private readonly IHubNotificationService _hub;
    private readonly SimulatorRegistry _registry;
    private readonly ICurrentIdentity? _identity;
    private readonly ILogger<RobotStateService> _log;
    private readonly TimeProvider _time;
    private readonly TimeSpan _staleAfter;

    private readonly ConcurrentDictionary<string, Snapshot> _snapshots = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, ConcurrentQueue<JogAuditDto>> _audit = new(StringComparer.Ordinal);

    public RobotStateService(
        IControlAuthorityGate authority,
        IHubNotificationService hub,
        SimulatorRegistry registry,
        IOptions<OrchestrationOptions> options,
        TimeProvider time,
        ILogger<RobotStateService> log,
        ICurrentIdentity? identity = null)
    {
        _authority = authority;
        _hub = hub;
        _registry = registry;
        _log = log;
        _time = time;
        _identity = identity;
        var seconds = options.Value.RobotTelemetryStaleAfterSeconds;
        _staleAfter = TimeSpan.FromSeconds(seconds <= 0 ? 3 : seconds);
    }

    // ── Reads ──────────────────────────────────────────────────────────

    /// <summary>Current authoritative snapshot for one robot, or null when none was ever published.</summary>
    public RobotPositionsDto? Get(string cellId, string robotId)
    {
        if (!TryKey(cellId, robotId, out var key)) return null;
        if (!_snapshots.TryGetValue(key, out var snapshot)) return null;
        return snapshot.Dto with { IsStale = _time.GetUtcNow().UtcDateTime - snapshot.PublishedAtUtc > _staleAfter };
    }

    /// <summary>Bounded audit trail for one robot, newest last.</summary>
    public IReadOnlyList<JogAuditDto> GetAudit(string cellId, string robotId, int limit)
    {
        if (!TryKey(cellId, robotId, out var key)) return [];
        if (!_audit.TryGetValue(key, out var queue)) return [];
        var take = Math.Clamp(limit, 1, MaxAuditEntriesPerRobot);
        return queue.Reverse().Take(take).Reverse().ToList();
    }

    // ── Publication ────────────────────────────────────────────────────

    /// <summary>
    /// Stores the robot state the assigned simulator executed. The server validates structure and
    /// rejects synthetic or malformed reports; it does not clamp joint values (the simulator owns
    /// the executed pose and its safety path).
    /// </summary>
    public RobotPositionsDto Publish(string cellId, PublishRobotPositionsRequest request)
    {
        if (!TryKey(cellId, request.RobotId, out var key))
        {
            throw new OrchestrationConflictException(JogCommandRules.CodeInvalidRobotState, "A valid cell and robot id are required.");
        }

        if (request.Joints is null || request.Joints.Count != 6
            || request.Joints.Select(j => j.Index).Distinct().Count() != 6
            || request.Joints.Any(j => j.Index is < 0 or > 5))
        {
            throw new OrchestrationConflictException(
                JogCommandRules.CodeInvalidRobotState, "A robot report requires six distinct joint positions J1..J6.");
        }

        if (request.Tcp is null || request.Frames is null)
        {
            throw new OrchestrationConflictException(
                JogCommandRules.CodeInvalidRobotState, "A robot report requires the TCP pose and frame context.");
        }

        var now = _time.GetUtcNow().UtcDateTime;
        var dto = new RobotPositionsDto(
            cellId.Trim(),
            request.RobotId.Trim(),
            request.RobotModel ?? string.Empty,
            request.Joints.OrderBy(j => j.Index).ToList(),
            request.Tcp,
            request.Frames,
            request.MotionStatus ?? "IDLE",
            request.OperatingMode ?? "offline-demo",
            "local-simulation",
            "available",
            null,
            IsStale: false,
            now,
            "radians, meters",
            1);

        if (_snapshots.Count >= MaxRobots && !_snapshots.ContainsKey(key))
        {
            throw new OrchestrationConflictException(
                JogCommandRules.CodeInvalidRobotState, "The in-memory robot registry is at capacity.");
        }

        _snapshots[key] = new Snapshot(dto, now);
        return dto;
    }

    // ── Jog ────────────────────────────────────────────────────────────

    /// <summary>
    /// Authorizes and dispatches an operator jog intent. A press fails closed when the robot is
    /// unknown, stale, in an incompatible mode, missing a dead-man token, not authorized by the
    /// control-authority gate or has no live assigned simulator. A release is always accepted so a
    /// stop can never be blocked by a transient condition.
    /// </summary>
    public async Task<JogCommandResultDto> IssueJogAsync(
        string cellId, string robotId, JogCommandRequest request, string? correlationId, CancellationToken cancellationToken = default)
    {
        var now = _time.GetUtcNow().UtcDateTime;
        var actor = _identity?.AuditId ?? "system";
        var resolvedCorrelation = request.CorrelationId ?? correlationId ?? Guid.NewGuid().ToString("N");
        var isRelease = JogCommandRules.IsRelease(request.Action);

        if (!TryKey(cellId, robotId, out var key))
        {
            throw new OrchestrationConflictException(JogCommandRules.CodeInvalidRobotState, "A valid cell and robot id are required.");
        }

        var joint = JogCommandRules.ValidateJoint(request.Joint);
        if (joint is not null)
        {
            Audit(key, cellId, robotId, request, "rejected", joint, actor, resolvedCorrelation, now);
            throw new OrchestrationConflictException(joint, $"Joint '{request.Joint}' is not a J1..J6 axis.");
        }

        var snapshot = Get(cellId, robotId);
        var simulatorId = _registry.ResolveForCell(cellId, now);

        if (!isRelease)
        {
            var reason = JogCommandRules.ValidatePress(snapshot, request.Mode, request.Direction, request.DeadManToken);
            if (reason is not null)
            {
                Audit(key, cellId, robotId, request, "rejected", reason, actor, resolvedCorrelation, now);
                throw new OrchestrationConflictException(reason, Describe(reason));
            }

            var decision = await _authority.AuthorizeCommandAsync(
                cellId, ControlAuthorityMode.ExternalController, _identity?.Subject, cancellationToken);
            if (!decision.Allowed)
            {
                Audit(key, cellId, robotId, request, "rejected", decision.Code, actor, resolvedCorrelation, now);
                throw new OrchestrationConflictException(decision.Code ?? "authority_denied", decision.Message ?? "Control authority denied the jog.");
            }

            if (simulatorId is null)
            {
                Audit(key, cellId, robotId, request, "rejected", JogCommandRules.CodeSimulatorOffline, actor, resolvedCorrelation, now);
                throw new OrchestrationConflictException(
                    JogCommandRules.CodeSimulatorOffline, "No live simulator is assigned to this cell.");
            }
        }

        if (simulatorId is not null)
        {
            var evt = new JogCommandIssuedEvent(
                cellId.Trim(),
                robotId.Trim(),
                simulatorId,
                isRelease ? JogCommandRules.ActionRelease : JogCommandRules.ActionPress,
                request.Joint.Trim().ToUpperInvariant(),
                request.Direction,
                isRelease ? null : request.DeadManToken,
                isRelease ? "operator-release" : null,
                resolvedCorrelation,
                now);
            await _hub.JogCommandIssuedAsync(evt);
        }

        Audit(key, cellId, robotId, request, isRelease ? "released" : "accepted", null, actor, resolvedCorrelation, now);

        _log.LogInformation(
            "[Server][Robot] Jog {Action} → cell={Cell} robot={Robot} joint={Joint} direction={Direction} simulator={SimulatorId} correlation={CorrelationId}",
            request.Action, cellId, robotId, request.Joint, request.Direction, simulatorId ?? "none", resolvedCorrelation);

        return new JogCommandResultDto(
            cellId.Trim(),
            robotId.Trim(),
            isRelease ? JogCommandRules.ActionRelease : JogCommandRules.ActionPress,
            request.Joint.Trim().ToUpperInvariant(),
            request.Direction,
            isRelease ? "released" : "accepted",
            simulatorId is null ? JogCommandRules.CodeSimulatorOffline : null,
            resolvedCorrelation,
            now);
    }

    // ── Internals ──────────────────────────────────────────────────────

    private static string Describe(string reason) => reason switch
    {
        JogCommandRules.CodeRobotUnavailable => "No authoritative robot state has been published for this cell.",
        JogCommandRules.CodeStaleTelemetry => "Robot telemetry is stale; jog commands are disabled.",
        JogCommandRules.CodeModeNotCompatible => "Jog is only allowed in manual-training mode.",
        JogCommandRules.CodeDeadManRequired => "A held dead-man signal is required to jog.",
        JogCommandRules.CodeInvalidDirection => "Jog direction must be -1 or 1.",
        JogCommandRules.CodeReplayReadOnly => "Replay is read-only and can never jog.",
        JogCommandRules.CodeSimulatorOffline => "No live simulator is assigned to this cell.",
        _ => reason,
    };

    private void Audit(
        string key,
        string cellId,
        string robotId,
        JogCommandRequest request,
        string outcome,
        string? reason,
        string actor,
        string? correlationId,
        DateTime now)
    {
        var queue = _audit.GetOrAdd(key, _ => new ConcurrentQueue<JogAuditDto>());
        queue.Enqueue(new JogAuditDto(
            cellId.Trim(),
            robotId.Trim(),
            request.Action ?? string.Empty,
            request.Joint ?? string.Empty,
            request.Direction,
            outcome,
            reason,
            string.IsNullOrWhiteSpace(actor) ? "system" : actor,
            correlationId,
            now));
        while (queue.Count > MaxAuditEntriesPerRobot) queue.TryDequeue(out _);
    }

    private static bool TryKey(string? cellId, string? robotId, out string key)
    {
        key = string.Empty;
        if (string.IsNullOrWhiteSpace(cellId) || string.IsNullOrWhiteSpace(robotId)) return false;
        if (cellId.Length > 100 || robotId.Length > 100) return false;
        key = $"{cellId.Trim()}\u0001{robotId.Trim()}";
        return true;
    }
}
