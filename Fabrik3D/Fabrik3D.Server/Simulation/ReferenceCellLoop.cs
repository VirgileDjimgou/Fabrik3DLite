using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;

namespace Fabrik3D.Server.Simulation;

/// <summary>Outcome of one deterministic reference-cell cycle.</summary>
public sealed record ReferenceCellLoopResult(
    bool Authorized,
    string? RejectionCode,
    double? CommandTarget,
    double? ActuatorPosition,
    double? SensorValue,
    bool SensorWritten);

/// <summary>
/// Minimal deterministic virtual-commissioning cell used for S36 external-controller evidence. It is
/// explicitly a training/VC mechanism, not a certified controller and not a product.
///
/// Closed loop per cycle:
/// fixture/controller output → connector → observed signal mirror (<c>cell-1.actuator.command</c>)
/// → authority-gated virtual actuator → virtual sensor (<c>cell-1.sensor.position</c>)
/// → connector write back to the fixture/controller input.
///
/// All position values are normalized engineering units for the fixture (documented, not SI); no
/// protocol address or type is referenced here.
/// </summary>
public sealed class ReferenceCellLoop
{
    public const string DefaultScope = "cell-1";
    public const string DefaultControllerOwnerId = "modbus";
    public const string CommandSignalId = "cell-1.actuator.command";
    public const string SensorSignalId = "cell-1.sensor.position";

    private readonly IControlAuthorityGate _gate;
    private readonly SignalMirrorStore _mirror;
    private readonly ModbusConnector _connector;
    private readonly TimeProvider _time;
    private readonly object _gateLock = new();

    private double _position;

    public ReferenceCellLoop(
        IControlAuthorityGate gate,
        SignalMirrorStore mirror,
        ModbusConnector connector,
        TimeProvider timeProvider,
        string scope = DefaultScope,
        string controllerOwnerId = DefaultControllerOwnerId,
        double maxStepPerCycle = 100.0)
    {
        _gate = gate;
        _mirror = mirror;
        _connector = connector;
        _time = timeProvider;
        Scope = scope;
        ControllerOwnerId = controllerOwnerId;
        MaxStepPerCycle = maxStepPerCycle > 0 ? maxStepPerCycle : 100.0;
    }

    public string Scope { get; }

    public string ControllerOwnerId { get; }

    /// <summary>Maximum actuator travel per cycle in normalized units. Bounded so the model is deterministic.</summary>
    public double MaxStepPerCycle { get; }

    public double Position
    {
        get { lock (_gateLock) return _position; }
    }

    public double? LastSensorValue { get; private set; }

    /// <summary>
    /// Runs one loop cycle. When neither the local simulation nor the external controller holds the
    /// authority the cycle is refused and no actuator or protocol effect occurs (fail closed).
    /// </summary>
    public async Task<ReferenceCellLoopResult> StepAsync(
        ControlAuthorityMode requestedMode = ControlAuthorityMode.ExternalController,
        string? ownerId = null,
        CancellationToken cancellationToken = default)
    {
        var decision = await _gate.AuthorizeCommandAsync(
            Scope, requestedMode, ownerId ?? ControllerOwnerId, cancellationToken);

        // A denied cycle has no actuator and no sensor effect: it reports no value for this cycle.
        if (!decision.Allowed)
        {
            return new ReferenceCellLoopResult(false, decision.Code, null, Position, null, false);
        }

        if (!_mirror.TryGetSample(CommandSignalId, out var sample)
            || sample?.Value is null
            || sample.Value is bool)
        {
            return new ReferenceCellLoopResult(true, null, null, Position, null, false);
        }

        var target = Convert.ToDouble(sample.Value);
        double position;
        lock (_gateLock)
        {
            var delta = Math.Clamp(target - _position, -MaxStepPerCycle, MaxStepPerCycle);
            _position += delta;
            position = _position;
        }

        LastSensorValue = position;

        // Write the virtual sensor back to the external controller input through the real adapter,
        // then publish it locally as a simulated sample carrying the authority context.
        var write = await _connector.WriteAsync(SensorSignalId, position, cancellationToken);

        _mirror.Apply(new IndustrialSignalUpdate(
            SensorSignalId, position, SignalQuality.Good, SignalSource.Simulated, SignalOrigin.Simulation,
            _time.GetUtcNow(), Scope, ControlAuthorityRules.ToWire(requestedMode)));

        return new ReferenceCellLoopResult(true, write.Accepted ? null : write.RejectionReason, target, position, position, write.Accepted);
    }
}
