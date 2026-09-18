using Fabrik3D.Contracts.Enums;
namespace Fabrik3D.Server.Services;
public static class AlarmLifecycleRules
{
    public static bool CanTransition(AlarmLifecycleState from, AlarmLifecycleState to) => (from, to) switch
    {
        (AlarmLifecycleState.Active, AlarmLifecycleState.ReturnedToNormal or AlarmLifecycleState.Acknowledged or AlarmLifecycleState.Shelved) => true,
        (AlarmLifecycleState.ReturnedToNormal, AlarmLifecycleState.Acknowledged or AlarmLifecycleState.Shelved or AlarmLifecycleState.Closed) => true,
        (AlarmLifecycleState.Acknowledged, AlarmLifecycleState.ReturnedToNormal or AlarmLifecycleState.Shelved or AlarmLifecycleState.Closed) => true,
        (AlarmLifecycleState.Shelved, AlarmLifecycleState.Active or AlarmLifecycleState.ReturnedToNormal) => true,
        _ => false,
    };
    public static void EnsureCanTransition(AlarmLifecycleState from, AlarmLifecycleState to)
    { if (!CanTransition(from, to)) throw new InvalidOperationException($"Alarm cannot transition from {from} to {to}."); }
}
