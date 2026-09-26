using Fabrik3D.Domain.Mapping;

namespace Fabrik3D.Server.Tests.Showcase;

/// <summary>
/// Canonical signal model of the S46 CODESYS / SoftPLC showcase. The showcase I/O map is a data
/// artifact (<c>docs/showcases/codesys-softplc/io-map.json</c>); this type is its deterministic
/// in-test counterpart so the mapping can be validated against a real catalog and the automated
/// fixture controller and virtual cell can share stable signal ids. It is test support only: no
/// showcase-specific code is added to the Fabrik3D server.
///
/// Direction convention is always relative to the Fabrik3D controller boundary:
/// <list type="bullet">
/// <item>"read" points are controller outputs consumed by Fabrik3D (PLC → cell);</item>
/// <item>"write" points are Fabrik3D outputs consumed by the controller (cell → PLC).</item>
/// </list>
/// </summary>
internal static class ShowcaseSignalMap
{
    public const string Scope = "showcase-cell";
    public const string ControllerOwnerId = "showcase-plc";
    public const string EquipmentId = "showcase.cell";

    // Controller outputs consumed by the cell (direction "read").
    public const string Start = "showcase.cell.Start";
    public const string Stop = "showcase.cell.Stop";
    public const string Reset = "showcase.cell.Reset";
    public const string PalletPresent = "showcase.cell.PalletPresent";
    public const string CycleTarget = "showcase.cell.CycleTarget";

    // Cell outputs consumed by the controller (direction "write").
    public const string Ready = "showcase.cell.Ready";
    public const string Running = "showcase.cell.Running";
    public const string RobotCycleComplete = "showcase.cell.RobotCycleComplete";
    public const string CncCycleComplete = "showcase.cell.CncCycleComplete";
    public const string CycleComplete = "showcase.cell.CycleComplete";
    public const string Fault = "showcase.cell.Fault";
    public const string ActuatorPosition = "showcase.cell.ActuatorPosition";
    public const string SensorPosition = "showcase.cell.SensorPosition";
    public const string PartsCompleted = "showcase.cell.PartsCompleted";

    public static readonly IReadOnlyList<string> WriteSignals =
    [
        Ready, Running, RobotCycleComplete, CncCycleComplete,
        CycleComplete, Fault, ActuatorPosition, SensorPosition, PartsCompleted,
    ];

    public static readonly IReadOnlyList<string> ReadSignals =
    [
        Start, Stop, Reset, PalletPresent, CycleTarget,
    ];

    /// <summary>
    /// The internal signal catalog the showcase I/O map must resolve against. Writable is true only
    /// for the cell outputs the mapping declares as "write", so an accidental write mapping to a
    /// read-only input is rejected during validation.
    /// </summary>
    public static IReadOnlyDictionary<string, InternalSignalDescriptor> Catalog()
    {
        var catalog = new Dictionary<string, InternalSignalDescriptor>(StringComparer.Ordinal);
        foreach (var signalId in ReadSignals)
        {
            catalog[signalId] = new InternalSignalDescriptor(signalId, EquipmentId, Writable: false, DataType: IsBoolean(signalId) ? "bool" : "uint");
        }

        foreach (var signalId in WriteSignals)
        {
            catalog[signalId] = new InternalSignalDescriptor(signalId, EquipmentId, Writable: true, DataType: IsBoolean(signalId) ? "bool" : "uint");
        }

        return catalog;
    }

    private static bool IsBoolean(string signalId)
        => signalId is Start or Stop or Reset or PalletPresent
            or Ready or Running or RobotCycleComplete or CncCycleComplete or CycleComplete or Fault;
}
