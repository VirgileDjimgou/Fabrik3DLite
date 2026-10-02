namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Bounded counts of the simulated public-demo state removed by an explicit demo reset (S63).
/// Only simulated demo state is represented here; production/profile data (organizations,
/// memberships, cell templates, connector configuration, schema migrations) is never touched.
/// </summary>
public record DemoResetCountsDto(
    int Jobs,
    int Tasks,
    int SimulationSessions,
    int Alarms,
    int OperatorMessages,
    int MachineStates,
    int TrainingSessions,
    int TrainingActions,
    int ControlAuthorities,
    int ControlAuthorityEvents);

/// <summary>
/// Result of an explicit, audited demo reset. It carries the authenticated actor and the tenant the
/// reset was scoped to so the operation is auditable without logging any secret or token.
/// </summary>
public record DemoResetResultDto(
    DateTime ResetAtUtc,
    string ActorId,
    string OrganizationId,
    DemoResetCountsDto Counts);
