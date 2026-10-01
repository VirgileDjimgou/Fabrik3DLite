namespace Fabrik3D.Contracts.DTOs;

// ── Authoritative robot positions (S53) ─────────────────────────────
//
// One joint position. Angle is always radians (SI), clamped server-side is NOT performed: the
// simulator is the execution authority and reports the values it actually applied. The declared
// limits travel with the value so the HMI can render bounded sliders without inventing them.

public record RobotJointDto(
    int Index,
    string Name,
    double AngleRadians,
    double MinRadians,
    double MaxRadians);

/// <summary>
/// Cartesian tool-centre-point pose. Position is meters (SI); orientation is intrinsic X-Y-Z
/// (roll-pitch-yaw) radians, matching the documented runtime frame convention. It is the pose the
/// simulator actually executed, never a re-derived or fabricated value.
/// </summary>
public record RobotPoseDto(
    double X,
    double Y,
    double Z,
    double Rx,
    double Ry,
    double Rz);

/// <summary>Active frame and tool context for a reported pose.</summary>
public record RobotFramesDto(
    string BaseFrame,
    string ToolFrame,
    string WorkObjectFrame,
    string CurrentToolId);

/// <summary>
/// Authoritative robot snapshot published by the assigned simulator (S53). Carries the units,
/// authority and published timestamp so stale or unavailable data is never shown as fresh.
/// </summary>
public record RobotPositionsDto(
    string CellId,
    string RobotId,
    string RobotModel,
    List<RobotJointDto> Joints,
    RobotPoseDto Tcp,
    RobotFramesDto Frames,
    string MotionStatus,
    string OperatingMode,
    string ControlAuthorityMode,
    string ControlAuthorityState,
    string? ControlAuthorityOwnerId,
    bool IsStale,
    DateTime PublishedAtUtc,
    string Units,
    int SchemaVersion);

/// <summary>Simulator publication of the robot state it is executing.</summary>
public record PublishRobotPositionsRequest(
    string RobotId,
    string RobotModel,
    List<RobotJointDto> Joints,
    RobotPoseDto Tcp,
    RobotFramesDto Frames,
    string MotionStatus,
    string OperatingMode,
    string SimulatorId);

/// <summary>
/// Operator jog intent (S53). <c>Action</c> is <c>press</c> or <c>release</c>; a press requires a
/// dead-man token that the simulator validates against the held input. The server never trusts a
/// client-crafted robot/cell id across a tenant or authority boundary.
/// </summary>
public record JogCommandRequest(
    string RobotId,
    string Joint,
    int Direction,
    string Action,
    string? DeadManToken,
    string Mode,
    string? CorrelationId = null);

/// <summary>Result of a jog command: normalized state, reason and the correlation id to trace it.</summary>
public record JogCommandResultDto(
    string CellId,
    string RobotId,
    string Action,
    string Joint,
    int Direction,
    string State,
    string? Reason,
    string? CorrelationId,
    DateTime IssuedAtUtc);

/// <summary>One bounded jog audit record. Never contains tokens or secrets.</summary>
public record JogAuditDto(
    string CellId,
    string RobotId,
    string Action,
    string Joint,
    int Direction,
    string Outcome,
    string? Reason,
    string ActorId,
    string? CorrelationId,
    DateTime TimestampUtc);
