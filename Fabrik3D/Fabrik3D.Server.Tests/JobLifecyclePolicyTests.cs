using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Jobs;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S52 authoritative lifecycle policy: progress denominator/rounding, current task index, terminal
/// completion/failure/cancellation semantics and idempotent terminal evaluation.
/// </summary>
public class JobLifecyclePolicyTests
{
    private static MachiningTask Task(int order, TaskStatusEnum status, bool required = true) => new()
    {
        Id = $"task-{order}",
        JobId = "job-1",
        Name = $"Task {order}",
        SequenceOrder = order,
        Status = status,
        IsRequired = required,
    };

    [Fact]
    public void Zero_tasks_never_completes_and_reports_zero_progress()
    {
        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, [], SimulationStatus.Completed);

        Assert.Equal(0, snapshot.RequiredTaskCount);
        Assert.Equal(0, snapshot.ProgressPercent);
        Assert.Equal(JobLifecycleOutcome.None, snapshot.Outcome);
    }

    [Fact]
    public void Partial_tasks_do_not_complete_the_job()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Completed),
            Task(1, TaskStatusEnum.Running),
            Task(2, TaskStatusEnum.Pending),
        };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Running);

        Assert.Equal(1, snapshot.CompletedRequiredTaskCount);
        Assert.Equal(33, snapshot.ProgressPercent);
        Assert.Equal(1, snapshot.CurrentTaskIndex);
        Assert.Equal(JobLifecycleOutcome.None, snapshot.Outcome);
    }

    [Fact]
    public void All_tasks_completed_with_active_session_does_not_complete_the_job()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Completed),
            Task(1, TaskStatusEnum.Completed),
        };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Running);

        Assert.Equal(100, snapshot.ProgressPercent);
        Assert.Equal(JobLifecycleOutcome.None, snapshot.Outcome);
    }

    [Fact]
    public void Completed_session_with_open_tasks_does_not_complete_the_job()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Completed),
            Task(1, TaskStatusEnum.Running),
        };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Completed);

        Assert.Equal(50, snapshot.ProgressPercent);
        Assert.Equal(JobLifecycleOutcome.None, snapshot.Outcome);
    }

    [Fact]
    public void All_required_tasks_and_session_completed_completes_the_job()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Completed),
            Task(1, TaskStatusEnum.Completed),
        };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Completed);

        Assert.Equal(100, snapshot.ProgressPercent);
        Assert.Equal(2, snapshot.CurrentTaskIndex);
        Assert.Equal(JobLifecycleOutcome.Completed, snapshot.Outcome);
    }

    [Fact]
    public void Optional_tasks_do_not_block_completion()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Completed),
            Task(1, TaskStatusEnum.Pending, required: false),
        };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Completed);

        Assert.Equal(1, snapshot.RequiredTaskCount);
        Assert.Equal(100, snapshot.ProgressPercent);
        Assert.Equal(JobLifecycleOutcome.Completed, snapshot.Outcome);
    }

    [Fact]
    public void Failed_required_task_fails_the_job()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Completed),
            Task(1, TaskStatusEnum.Failed),
        };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Running);

        Assert.Equal(JobLifecycleOutcome.Failed, snapshot.Outcome);
    }

    [Fact]
    public void Faulted_session_fails_the_job()
    {
        var tasks = new[] { Task(0, TaskStatusEnum.Running) };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Faulted);

        Assert.Equal(JobLifecycleOutcome.Failed, snapshot.Outcome);
    }

    [Fact]
    public void All_required_tasks_cancelled_cancels_the_job()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Cancelled),
            Task(1, TaskStatusEnum.Cancelled),
        };

        var snapshot = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Stopped);

        Assert.Equal(JobLifecycleOutcome.Cancelled, snapshot.Outcome);
    }

    [Fact]
    public void Terminal_jobs_never_transition_again()
    {
        var tasks = new[] { Task(0, TaskStatusEnum.Completed) };

        foreach (var terminal in new[] { JobStatus.Completed, JobStatus.Stopped, JobStatus.Failed, JobStatus.Cancelled })
        {
            var snapshot = JobLifecyclePolicy.Evaluate(terminal, tasks, SimulationStatus.Completed);
            Assert.Equal(JobLifecycleOutcome.None, snapshot.Outcome);
        }
    }

    [Fact]
    public void Duplicate_evaluation_is_idempotent()
    {
        var tasks = new[] { Task(0, TaskStatusEnum.Completed) };

        var first = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Completed);
        var second = JobLifecyclePolicy.Evaluate(JobStatus.Running, tasks, SimulationStatus.Completed);

        Assert.Equal(first, second);
    }

    [Theory]
    [InlineData(0, 3, 0)]
    [InlineData(1, 3, 33)]
    [InlineData(2, 3, 66)]
    [InlineData(3, 3, 100)]
    [InlineData(1, 0, 0)]
    public void Progress_uses_floor_rounding_over_required_tasks(int completed, int required, int expected)
    {
        Assert.Equal(expected, JobLifecyclePolicy.ComputeProgressPercent(completed, required));
    }

    [Fact]
    public void Current_task_index_skips_terminal_tasks_and_uses_past_end_sentinel()
    {
        var tasks = new[]
        {
            Task(0, TaskStatusEnum.Completed),
            Task(1, TaskStatusEnum.Cancelled),
            Task(2, TaskStatusEnum.Running),
            Task(3, TaskStatusEnum.Pending),
        };

        Assert.Equal(2, JobLifecyclePolicy.ComputeCurrentTaskIndex(tasks));
        Assert.Equal(2, JobLifecyclePolicy.ComputeCurrentTaskIndex(
            [Task(0, TaskStatusEnum.Completed), Task(1, TaskStatusEnum.Cancelled)]));
    }
}