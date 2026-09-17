using Fabrik3D.Contracts.Enums;
using Fabrik3D.Server.Services;

namespace Fabrik3D.Server.Tests;

public class JobStateTransitionRulesTests
{
    [Theory]
    [InlineData(JobStatus.Created, true)]
    [InlineData(JobStatus.Ready, true)]
    [InlineData(JobStatus.Running, false)]
    [InlineData(JobStatus.Paused, false)]
    [InlineData(JobStatus.Stopped, false)]
    public void Start_is_allowed_only_from_created_or_ready(JobStatus status, bool expected)
    {
        Assert.Equal(expected, JobStateTransitionRules.CanStart(status));
    }

    [Fact]
    public void Pause_resume_and_stop_follow_the_job_lifecycle()
    {
        Assert.True(JobStateTransitionRules.CanPause(JobStatus.Running));
        Assert.True(JobStateTransitionRules.CanResume(JobStatus.Paused));
        Assert.True(JobStateTransitionRules.CanStop(JobStatus.Running));
        Assert.True(JobStateTransitionRules.CanStop(JobStatus.Paused));

        Assert.False(JobStateTransitionRules.CanPause(JobStatus.Created));
        Assert.False(JobStateTransitionRules.CanResume(JobStatus.Running));
        Assert.False(JobStateTransitionRules.CanStop(JobStatus.Completed));
    }

    [Fact]
    public void Invalid_transition_includes_the_current_state_in_the_error()
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            JobStateTransitionRules.EnsureCanPause(JobStatus.Created));

        Assert.Contains("Created", error.Message);
        Assert.Contains("Running", error.Message);
    }
}
