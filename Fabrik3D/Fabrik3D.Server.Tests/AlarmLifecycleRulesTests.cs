using Fabrik3D.Contracts.Enums;
using Fabrik3D.Server.Services;
namespace Fabrik3D.Server.Tests;
public class AlarmLifecycleRulesTests
{
    [Theory]
    [InlineData(AlarmLifecycleState.Active, AlarmLifecycleState.Acknowledged, true)]
    [InlineData(AlarmLifecycleState.Active, AlarmLifecycleState.ReturnedToNormal, true)]
    [InlineData(AlarmLifecycleState.Active, AlarmLifecycleState.Shelved, true)]
    [InlineData(AlarmLifecycleState.ReturnedToNormal, AlarmLifecycleState.Closed, true)]
    [InlineData(AlarmLifecycleState.Shelved, AlarmLifecycleState.Active, true)]
    [InlineData(AlarmLifecycleState.Closed, AlarmLifecycleState.Active, false)]
    [InlineData(AlarmLifecycleState.Active, AlarmLifecycleState.Closed, false)]
    public void Lifecycle_transitions_are_explicit(AlarmLifecycleState from, AlarmLifecycleState to, bool allowed)
        => Assert.Equal(allowed, AlarmLifecycleRules.CanTransition(from, to));
}
