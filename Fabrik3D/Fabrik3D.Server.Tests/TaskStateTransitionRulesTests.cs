using Fabrik3D.Contracts.Enums;
using Fabrik3D.Server.Services;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Server.Tests;

public class TaskStateTransitionRulesTests
{
    public static TheoryData<TaskStatusEnum, bool> RunCases = new()
    {
        { TaskStatusEnum.Pending, true },
        { TaskStatusEnum.Ready, true },
        { TaskStatusEnum.Running, false },
        { TaskStatusEnum.Paused, false },
        { TaskStatusEnum.Completed, false },
        { TaskStatusEnum.Failed, false },
        { TaskStatusEnum.Cancelled, false },
    };

    [Theory]
    [MemberData(nameof(RunCases))]
    public void CanRun_accepts_only_pending_or_ready(TaskStatusEnum status, bool expected)
        => Assert.Equal(expected, TaskStateTransitionRules.CanRun(status));

    [Fact]
    public void CanComplete_accepts_only_running()
    {
        Assert.True(TaskStateTransitionRules.CanComplete(TaskStatusEnum.Running));
        Assert.False(TaskStateTransitionRules.CanComplete(TaskStatusEnum.Pending));
        Assert.False(TaskStateTransitionRules.CanComplete(TaskStatusEnum.Completed));
    }

    [Fact]
    public void CanFail_accepts_only_running()
    {
        Assert.True(TaskStateTransitionRules.CanFail(TaskStatusEnum.Running));
        Assert.False(TaskStateTransitionRules.CanFail(TaskStatusEnum.Pending));
    }

    [Fact]
    public void CanCancel_accepts_open_states()
    {
        Assert.True(TaskStateTransitionRules.CanCancel(TaskStatusEnum.Pending));
        Assert.True(TaskStateTransitionRules.CanCancel(TaskStatusEnum.Ready));
        Assert.True(TaskStateTransitionRules.CanCancel(TaskStatusEnum.Running));
        Assert.True(TaskStateTransitionRules.CanCancel(TaskStatusEnum.Paused));
        Assert.False(TaskStateTransitionRules.CanCancel(TaskStatusEnum.Completed));
        Assert.False(TaskStateTransitionRules.CanCancel(TaskStatusEnum.Cancelled));
    }

    [Fact]
    public void Ensure_methods_report_current_and_allowed_states()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            TaskStateTransitionRules.EnsureCanComplete(TaskStatusEnum.Pending));

        Assert.Contains("'Pending'", ex.Message);
        Assert.Contains("Running", ex.Message);
    }
}
