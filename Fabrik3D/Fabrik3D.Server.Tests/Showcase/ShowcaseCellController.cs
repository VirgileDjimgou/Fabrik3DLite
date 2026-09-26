using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;

namespace Fabrik3D.Server.Tests.Showcase;

/// <summary>Deterministic phases of the showcase reference cell.</summary>
internal enum ShowcasePhase
{
    Idle,
    Ready,
    Robot,
    Cnc,
    Complete,
    Fault,
}

/// <summary>Deterministic outcome and observable state of one showcase cell tick.</summary>
internal sealed record ShowcaseTickResult(
    bool Authorized,
    string? RejectionCode,
    string Phase,
    bool Start,
    bool Stop,
    bool Reset,
    bool PalletPresent,
    int Target,
    bool Ready,
    bool Running,
    bool RobotCycleComplete,
    bool CncCycleComplete,
    bool CycleComplete,
    bool Fault,
    int ActuatorPosition,
    int SensorPosition,
    int PartsCompleted,
    IReadOnlyList<string> RejectedWrites);

/// <summary>
/// Test-only deterministic virtual cell for the S46 showcase. It is the Fabrik3D side of the closed
/// loop: it consumes controller outputs from the real Modbus-connector signal mirror
/// (<c>showcase.cell.*</c> command/feedback signals) and publishes its virtual actuator and sensor
/// values back to the controller through the real <see cref="ModbusConnector"/> write path. Every
/// tick is authorized through the S36 <see cref="IControlAuthorityGate"/> before it can move the
/// actuator or emit a protocol write, so a denied tick has no actuator and no protocol effect.
///
/// This is an educational reference model, not a certified controller, and it is not part of the
/// shipped Fabrik3D server.
/// </summary>
internal sealed class ShowcaseCellController
{
    private const int MaxStepPerTick = 25;
    private const int MinimumPhaseTicks = 3;

    private readonly IControlAuthorityGate _gate;
    private readonly SignalMirrorStore _mirror;
    private readonly ModbusConnector _connector;
    private readonly string _scope;
    private readonly object _lock = new();

    private ShowcasePhase _phase = ShowcasePhase.Idle;
    private int _actuator;
    private int _target;
    private int _parts;
    private int _phaseTicks;
    private bool _robotComplete;
    private bool _cncComplete;
    private bool _cycleComplete;

    public ShowcaseCellController(
        IControlAuthorityGate gate,
        SignalMirrorStore mirror,
        ModbusConnector connector,
        string? scope = null)
    {
        _gate = gate;
        _mirror = mirror;
        _connector = connector;
        _scope = string.IsNullOrWhiteSpace(scope) ? ShowcaseSignalMap.Scope : scope;
    }

    public string Scope => _scope;

    public ShowcasePhase Phase
    {
        get { lock (_lock) return _phase; }
    }

    public int ActuatorPosition
    {
        get { lock (_lock) return _actuator; }
    }

    public int PartsCompleted
    {
        get { lock (_lock) return _parts; }
    }

    /// <summary>
    /// Runs one deterministic cell cycle. A denied authority decision returns without moving the
    /// actuator and without any protocol write.
    /// </summary>
    public async Task<ShowcaseTickResult> TickAsync(CancellationToken cancellationToken = default)
    {
        var decision = await _gate.AuthorizeCommandAsync(
            _scope,
            ControlAuthorityMode.ExternalController,
            ShowcaseSignalMap.ControllerOwnerId,
            cancellationToken);

        var start = ReadBool(ShowcaseSignalMap.Start);
        var stop = ReadBool(ShowcaseSignalMap.Stop);
        var reset = ReadBool(ShowcaseSignalMap.Reset);
        var pallet = ReadBool(ShowcaseSignalMap.PalletPresent);
        var target = ReadInt(ShowcaseSignalMap.CycleTarget);

        if (!decision.Allowed)
        {
            return Snapshot(false, decision.Code, start, stop, reset, pallet, target, []);
        }

        bool ready, running, robotComplete, cncComplete, cycleComplete, fault;
        int actuator, parts;

        lock (_lock)
        {
            Advance(stop, start, reset, pallet, target);
            ready = _phase == ShowcasePhase.Ready;
            running = _phase is ShowcasePhase.Robot or ShowcasePhase.Cnc;
            robotComplete = _robotComplete;
            cncComplete = _cncComplete;
            cycleComplete = _cycleComplete;
            fault = _phase == ShowcasePhase.Fault;
            actuator = _actuator;
            parts = _parts;
        }

        var rejected = new List<string>();
        await WriteAsync(ShowcaseSignalMap.Ready, ready, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.Running, running, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.RobotCycleComplete, robotComplete, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.CncCycleComplete, cncComplete, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.CycleComplete, cycleComplete, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.Fault, fault, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.ActuatorPosition, actuator, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.SensorPosition, actuator, rejected, cancellationToken);
        await WriteAsync(ShowcaseSignalMap.PartsCompleted, parts, rejected, cancellationToken);

        return Snapshot(true, null, start, stop, reset, pallet, target, rejected);
    }

    /// <summary>Deterministic state machine shared by every tick.</summary>
    private void Advance(bool stop, bool start, bool reset, bool pallet, int target)
    {
        _target = target;

        switch (_phase)
        {
            case ShowcasePhase.Idle:
                if (!stop)
                {
                    _phase = ShowcasePhase.Ready;
                }
                break;

            case ShowcasePhase.Ready:
                if (stop)
                {
                    _phase = ShowcasePhase.Idle;
                }
                else if (start && pallet)
                {
                    ClearLatches();
                    _actuator = 0;
                    _phaseTicks = 1;
                    _phase = ShowcasePhase.Robot;
                    _actuator = RampToward(_actuator, _target);
                }
                break;

            case ShowcasePhase.Robot:
                if (stop)
                {
                    EnterFault();
                }
                else
                {
                    _phaseTicks++;
                    _actuator = RampToward(_actuator, _target);
                    if (_phaseTicks >= MinimumPhaseTicks && _actuator == _target)
                    {
                        _robotComplete = true;
                        _phaseTicks = 0;
                        _phase = ShowcasePhase.Cnc;
                    }
                }
                break;

            case ShowcasePhase.Cnc:
                if (stop)
                {
                    EnterFault();
                }
                else
                {
                    _phaseTicks++;
                    if (_phaseTicks >= MinimumPhaseTicks)
                    {
                        _cncComplete = true;
                        _cycleComplete = true;
                        _parts++;
                        _phaseTicks = 0;
                        _phase = ShowcasePhase.Complete;
                    }
                }
                break;

            case ShowcasePhase.Complete:
            case ShowcasePhase.Fault:
                if (reset && !stop)
                {
                    ClearLatches();
                    _phase = ShowcasePhase.Idle;
                }
                break;
        }
    }

    private void EnterFault()
    {
        _phase = ShowcasePhase.Fault;
        _robotComplete = false;
        _cncComplete = false;
        _cycleComplete = false;
        // The actuator holds its last position; a fault never commands motion.
    }

    private void ClearLatches()
    {
        _robotComplete = false;
        _cncComplete = false;
        _cycleComplete = false;
    }

    private static int RampToward(int current, int target)
    {
        var delta = Math.Clamp(target - current, -MaxStepPerTick, MaxStepPerTick);
        return Math.Clamp(current + delta, 0, 100);
    }

    private bool ReadBool(string signalId)
        => _mirror.TryGetSample(signalId, out var sample) && sample!.Value is bool value && value;

    private int ReadInt(string signalId)
        => _mirror.TryGetSample(signalId, out var sample) && sample!.Value is not null && sample.Value is not bool
            ? (int)Math.Clamp(Math.Round(Convert.ToDouble(sample.Value)), 0, 100)
            : 0;

    private async Task WriteAsync(string signalId, object value, List<string> rejected, CancellationToken cancellationToken)
    {
        var result = await _connector.WriteAsync(signalId, value, cancellationToken);
        if (!result.Accepted)
        {
            rejected.Add($"{signalId}:{result.RejectionReason}");
        }
    }

    private ShowcaseTickResult Snapshot(
        bool authorized,
        string? rejectionCode,
        bool start,
        bool stop,
        bool reset,
        bool pallet,
        int target,
        IReadOnlyList<string> rejectedWrites)
    {
        lock (_lock)
        {
            return new ShowcaseTickResult(
                authorized,
                rejectionCode,
                _phase.ToString().ToLowerInvariant(),
                start,
                stop,
                reset,
                pallet,
                target,
                _phase == ShowcasePhase.Ready,
                _phase is ShowcasePhase.Robot or ShowcasePhase.Cnc,
                _robotComplete,
                _cncComplete,
                _cycleComplete,
                _phase == ShowcasePhase.Fault,
                _actuator,
                _actuator,
                _parts,
                rejectedWrites);
        }
    }
}
