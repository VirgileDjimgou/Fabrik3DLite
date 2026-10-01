using Fabrik3D.Contracts.DTOs;
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
/// S53 jog authority against the real <see cref="ControlAuthorityService"/> (isolated MongoDB):
/// an unowned scope fails closed, an owned scope authorizes the same subject, and the targeted jog
/// event only reaches the assigned simulator group.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class RobotJogAuthorityIntegrationTests
{
    private const string Robot = "robot-1";

    private sealed class FakeIdentity(string subject) : ICurrentIdentity
    {
        public bool IsAuthenticated => true;
        public string Subject { get; } = subject;
        public string? Name => Subject;
        public IReadOnlyList<string> Roles { get; } = ["Operator"];
        public string AuditId => Subject;
    }

    private readonly OrchestrationFixture _fx;

    public RobotJogAuthorityIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private RobotStateService CreateService(string subject)
        => new(
            _fx.AuthorityService,
            _fx.Hub,
            _fx.Registry,
            Options.Create(new OrchestrationOptions { RobotTelemetryStaleAfterSeconds = 30 }),
            TimeProvider.System,
            NullLogger<RobotStateService>.Instance,
            new FakeIdentity(subject));

    private static PublishRobotPositionsRequest Report() => new(
        Robot,
        "medium-6axis",
        Enumerable.Range(0, 6)
            .Select(i => new RobotJointDto(i, $"J{i + 1}", 0.0, -Math.PI, Math.PI))
            .ToList(),
        new RobotPoseDto(0.4, 0.1, 0.5, 0, 0, 0),
        new RobotFramesDto("world", "tool0", "workobject-1", "tool-1"),
        "IDLE",
        "manual-training",
        "sim-jog");

    private static JogCommandRequest Press() =>
        new(Robot, "J1", 1, "press", "dm-token", "manual-training");

    [Fact]
    public async Task Press_on_an_unowned_scope_fails_closed()
    {
        var cell = $"cell-{Guid.NewGuid():N}";
        var service = CreateService("operator-jog");
        _fx.Registry.Register("sim-jog", cell, "conn-jog", DateTime.UtcNow);
        service.Publish(cell, Report());

        var error = await Assert.ThrowsAsync<OrchestrationConflictException>(
            () => service.IssueJogAsync(cell, Robot, Press(), "corr-unowned"));

        Assert.Equal(ControlAuthorityCodes.NotAcquired, error.Code);
    }

    [Fact]
    public async Task Press_is_authorized_for_the_subject_that_holds_the_scope()
    {
        var cell = $"cell-{Guid.NewGuid():N}";
        var service = CreateService("operator-owner");
        _fx.Registry.Register("sim-jog", cell, "conn-jog", DateTime.UtcNow);
        service.Publish(cell, Report());

        await _fx.AuthorityService.AcquireAsync(cell, new AcquireControlAuthorityRequest
        {
            Mode = "ExternalController",
            OwnerId = "operator-owner",
            OwnerKind = "simulator",
            LeaseSeconds = 120,
        }, null);

        var result = await service.IssueJogAsync(cell, Robot, Press(), "corr-owned");

        Assert.Equal("accepted", result.State);
        Assert.Contains(
            _fx.Hub.Events.OfType<JogCommandIssuedEvent>(),
            evt => evt.CellId == cell && evt.SimulatorId == "sim-jog");
    }

    [Fact]
    public async Task A_denied_release_still_stops_the_robot()
    {
        var cell = $"cell-{Guid.NewGuid():N}";
        var service = CreateService("operator-release");
        _fx.Registry.Register("sim-jog", cell, "conn-jog", DateTime.UtcNow);

        // Never acquired and never published: a stop must still be accepted.
        var result = await service.IssueJogAsync(
            cell, Robot, new JogCommandRequest(Robot, "J1", 1, "release", null, "automatic"), "corr-release");

        Assert.Equal("released", result.State);
    }
}
