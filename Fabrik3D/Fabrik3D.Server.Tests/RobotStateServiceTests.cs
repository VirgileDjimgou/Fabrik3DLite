using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Control;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Services;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S53 jog and robot-state rules. These are pure unit tests: authority is a deterministic fake and
/// the hub is a recording fake, so every negative (mode, dead-man, replay, stale, offline, authority)
/// is exercised without MongoDB or SignalR.
/// </summary>
public class RobotStateServiceTests
{
    private const string Cell = "reference-cell";
    private const string Robot = "robot-1";

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FakeAuthorityGate : IControlAuthorityGate
    {
        public ControlAuthorityDecision Decision { get; set; } = ControlAuthorityDecision.Allow;
        public string? LastOwnerId { get; private set; }
        public ControlAuthorityMode LastMode { get; private set; }

        public Task<ControlAuthorityDecision> AuthorizeCommandAsync(
            string scope, ControlAuthorityMode requestedMode, string? ownerId, CancellationToken cancellationToken = default)
        {
            LastOwnerId = ownerId;
            LastMode = requestedMode;
            return Task.FromResult(Decision);
        }
    }

    private sealed class FakeIdentity(string subject = "operator-1") : ICurrentIdentity
    {
        public bool IsAuthenticated => true;
        public string Subject { get; } = subject;
        public string? Name => Subject;
        public IReadOnlyList<string> Roles { get; } = ["Operator"];
        public string AuditId => Subject;
    }

    private static List<RobotJointDto> Joints(double j1 = 0.1) =>
    [
        new(0, "J1", j1, -Math.PI, Math.PI),
        new(1, "J2", 0.0, -Math.PI, Math.PI),
        new(2, "J3", 0.0, -Math.PI, Math.PI),
        new(3, "J4", 0.0, -Math.PI, Math.PI),
        new(4, "J5", 0.0, -Math.PI, Math.PI),
        new(5, "J6", 0.0, -Math.PI, Math.PI),
    ];

    private static PublishRobotPositionsRequest Report(string operatingMode = "manual-training") => new(
        Robot,
        "medium-6axis",
        Joints(),
        new RobotPoseDto(0.4, 0.1, 0.5, 0, 0, 0),
        new RobotFramesDto("world", "tool0", "workobject-1", "tool-1"),
        "IDLE",
        operatingMode,
        "sim-1");

    private static (RobotStateService Service, RecordingHub Hub, FakeAuthorityGate Gate, FixedTimeProvider Clock, SimulatorRegistry Registry) Create()
    {
        var clock = new FixedTimeProvider(new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.Zero));
        var hub = new RecordingHub();
        var gate = new FakeAuthorityGate();
        var registry = new SimulatorRegistry(TimeSpan.FromSeconds(60));
        registry.Register("sim-1", Cell, "conn-1", clock.GetUtcNow().UtcDateTime);
        var options = Options.Create(new OrchestrationOptions { RobotTelemetryStaleAfterSeconds = 3 });
        var service = new RobotStateService(
            gate, hub, registry, options, clock, NullLogger<RobotStateService>.Instance, new FakeIdentity());
        return (service, hub, gate, clock, registry);
    }

    private static JogCommandRequest Press(string joint = "J1", int direction = 1, string mode = "manual-training", string? deadMan = "dm-token") =>
        new(Robot, joint, direction, "press", deadMan, mode);

    private static List<JogCommandIssuedEvent> JogEvents(RecordingHub hub) =>
        hub.Events.OfType<JogCommandIssuedEvent>().ToList();

    // ── Reads / publish ────────────────────────────────────────────────

    [Fact]
    public void Get_returns_null_until_a_simulator_publishes()
    {
        var (service, _, _, _, _) = Create();
        Assert.Null(service.Get(Cell, Robot));
    }

    [Fact]
    public void Publish_stores_joints_tcp_frames_and_marks_fresh()
    {
        var (service, _, _, _, _) = Create();
        var dto = service.Publish(Cell, Report());

        Assert.Equal(Cell, dto.CellId);
        Assert.Equal("radians, meters", dto.Units);
        Assert.Equal(6, dto.Joints.Count);
        Assert.Equal(0.4, dto.Tcp.X);
        Assert.Equal("tool-1", dto.Frames.CurrentToolId);
        Assert.False(dto.IsStale);

        var read = service.Get(Cell, Robot);
        Assert.NotNull(read);
        Assert.False(read!.IsStale);
    }

    [Fact]
    public void Publish_rejects_a_malformed_joint_set()
    {
        var (service, _, _, _, _) = Create();
        var bad = Report() with { Joints = Joints().Take(5).ToList() };
        var error = Assert.Throws<OrchestrationConflictException>(() => service.Publish(Cell, bad));
        Assert.Equal(JogCommandRules.CodeInvalidRobotState, error.Code);
    }

    [Fact]
    public void Publish_never_echoes_the_authority_it_does_not_own()
    {
        var (service, _, _, _, _) = Create();
        var dto = service.Publish(Cell, Report());
        // The live authority is overlaid by the controller; the stored default is explicit.
        Assert.Equal("local-simulation", dto.ControlAuthorityMode);
        Assert.Equal("available", dto.ControlAuthorityState);
    }

    // ── Jog negatives ──────────────────────────────────────────────────

    [Fact]
    public async Task Press_is_rejected_when_no_robot_state_was_published()
    {
        var (service, _, _, _, _) = Create();
        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(), "c1"));
        Assert.Equal(JogCommandRules.CodeRobotUnavailable, error.Code);
    }

    [Fact]
    public async Task Press_is_rejected_when_telemetry_is_stale()
    {
        var (service, _, _, clock, _) = Create();
        service.Publish(Cell, Report());
        clock.Now = clock.Now.AddSeconds(10);

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(), "c1"));
        Assert.Equal(JogCommandRules.CodeStaleTelemetry, error.Code);
    }

    [Fact]
    public async Task Press_is_rejected_when_the_mode_is_not_manual_training()
    {
        var (service, _, _, _, _) = Create();
        service.Publish(Cell, Report());

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(mode: "automatic"), "c1"));
        Assert.Equal(JogCommandRules.CodeModeNotCompatible, error.Code);
    }

    [Fact]
    public async Task Press_is_rejected_when_the_simulator_mode_is_not_manual_training()
    {
        var (service, _, _, _, _) = Create();
        service.Publish(Cell, Report(operatingMode: "automatic"));

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(), "c1"));
        Assert.Equal(JogCommandRules.CodeModeNotCompatible, error.Code);
    }

    [Fact]
    public async Task Press_is_rejected_without_a_dead_man_token()
    {
        var (service, _, _, _, _) = Create();
        service.Publish(Cell, Report());

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(deadMan: null), "c1"));
        Assert.Equal(JogCommandRules.CodeDeadManRequired, error.Code);
    }

    [Fact]
    public async Task Press_is_rejected_for_an_unknown_joint_or_direction()
    {
        var (service, _, _, _, _) = Create();
        service.Publish(Cell, Report());

        var joint = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(joint: "J9"), "c1"));
        Assert.Equal(JogCommandRules.CodeInvalidJoint, joint.Code);

        var direction = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(direction: 3), "c1"));
        Assert.Equal(JogCommandRules.CodeInvalidDirection, direction.Code);
    }

    [Fact]
    public async Task Press_is_rejected_when_the_authority_gate_denies_it()
    {
        var (service, _, gate, _, _) = Create();
        service.Publish(Cell, Report());
        gate.Decision = ControlAuthorityDecision.Deny(ControlAuthorityCodes.Conflict, "held by someone else");

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(), "c1"));
        Assert.Equal(ControlAuthorityCodes.Conflict, error.Code);
        Assert.Equal("operator-1", gate.LastOwnerId);
        Assert.Equal(ControlAuthorityMode.ExternalController, gate.LastMode);
    }

    [Fact]
    public async Task Press_is_rejected_when_the_scene_is_in_replay()
    {
        var (service, _, gate, _, _) = Create();
        service.Publish(Cell, Report());
        // A replay echo from the simulator is enough to refuse, even before the authority gate.
        gate.Decision = ControlAuthorityDecision.Deny(ControlAuthorityCodes.ReplayReadOnly, "replay");

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(mode: "replay"), "c1"));
        Assert.Equal(JogCommandRules.CodeReplayReadOnly, error.Code);
    }

    [Fact]
    public async Task Press_is_rejected_when_no_simulator_is_assigned()
    {
        var (service, _, _, _, registry) = Create();
        service.Publish(Cell, Report());
        registry.Unregister("sim-1");

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(Cell, Robot, Press(), "c1"));
        Assert.Equal(JogCommandRules.CodeSimulatorOffline, error.Code);
    }

    // ── Jog positives ──────────────────────────────────────────────────

    [Fact]
    public async Task Authorized_press_publishes_a_targeted_event_and_audits_the_actor()
    {
        var (service, hub, _, _, _) = Create();
        service.Publish(Cell, Report());

        var result = await service.IssueJogAsync(Cell, Robot, Press(deadMan: "dm-1"), "corr-1");

        Assert.Equal("accepted", result.State);
        Assert.Equal("corr-1", result.CorrelationId);
        var evt = Assert.Single(JogEvents(hub));
        Assert.Equal("sim-1", evt.SimulatorId);
        Assert.Equal("J1", evt.Joint);
        Assert.Equal(1, evt.Direction);
        Assert.Equal("dm-1", evt.DeadManToken);

        var audit = service.GetAudit(Cell, Robot, 10);
        Assert.Contains(audit, entry => entry.Outcome == "accepted" && entry.ActorId == "operator-1" && entry.CorrelationId == "corr-1");
    }

    [Fact]
    public async Task Release_is_always_accepted_even_when_the_authority_gate_would_deny()
    {
        var (service, hub, gate, _, _) = Create();
        // No publish and a denied authority; a stop must not be blocked.
        gate.Decision = ControlAuthorityDecision.Deny(ControlAuthorityCodes.NotAcquired, "not acquired");

        var result = await service.IssueJogAsync(Cell, Robot, new JogCommandRequest(Robot, "J1", 1, "release", null, "automatic"), "corr-2");

        Assert.Equal("released", result.State);
        Assert.Single(JogEvents(hub));
        Assert.Contains(service.GetAudit(Cell, Robot, 10), entry => entry.Outcome == "released");
    }

    [Fact]
    public async Task JogEvents_never_carry_a_token_on_release()
    {
        var (service, hub, _, _, _) = Create();
        service.Publish(Cell, Report());

        await service.IssueJogAsync(Cell, Robot, new JogCommandRequest(Robot, "J1", -1, "release", "dm-should-be-dropped", "manual-training"), "c");

        var evt = Assert.Single(JogEvents(hub));
        Assert.Null(evt.DeadManToken);
        Assert.Equal(-1, evt.Direction);
    }

    [Theory]
    [InlineData("J1", 0)]
    [InlineData("j6", 5)]
    [InlineData("3", 2)]
    [InlineData("J9", -1)]
    [InlineData("", -1)]
    public void ParseJointIndex_is_bounded(string joint, int expected)
        => Assert.Equal(expected, JogCommandRules.ParseJointIndex(joint));
}
