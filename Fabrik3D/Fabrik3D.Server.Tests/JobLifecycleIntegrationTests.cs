using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Server.Services;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S52 authoritative lifecycle integration: the server derives progress and terminal state from
/// persisted task/session facts, duplicate terminal reports are idempotent, failure propagates and
/// optimistic concurrency is preserved.
/// </summary>
[Collection(OrchestrationCollection.Name)]
public class JobLifecycleIntegrationTests
{
    private readonly OrchestrationFixture _fx;

    public JobLifecycleIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private async Task<(JobDto Job, DispatchResultDto Dispatch, string SimulatorId)> CreateDispatchedJobAsync()
    {
        var simulatorId = $"sim-lifecycle-{Guid.NewGuid():N}";
        _fx.Registry.Register(simulatorId, "reference-cell", $"conn-{simulatorId}", DateTime.UtcNow);

        var job = await _fx.Composer.CreateAsync(new CreateJobRequest
        {
            Name = $"Lifecycle {Guid.NewGuid():N}",
            MachineMode = "Automatic",
            TargetCellId = "reference-cell",
            ScenarioId = "pallet-processing",
            PalletLayout = new PalletLayoutRequest { PalletId = "pallet-1", Rows = 2, Columns = 2 },
            OccupiedSlots =
            [
                new PalletSlotRequest { Row = 0, Column = 0 },
                new PalletSlotRequest { Row = 0, Column = 1 },
            ],
        }, null);

        var dispatch = await _fx.DispatchService.StartDispatchAsync(
            job.Id, new StartJobDispatchRequest(), $"corr-{Guid.NewGuid():N}");
        Assert.NotNull(dispatch);

        // The registry is shared across the collection, so use the simulator the server actually
        // assigned rather than assuming this test's registration won the deterministic resolution.
        var assigned = dispatch!.AssignedSimulatorId;
        Assert.False(string.IsNullOrWhiteSpace(assigned));
        return (job, dispatch, assigned!);
    }

    private Task<TaskDto?> ReportTaskAsync(
        string taskId, string status, string sessionId, string simulatorId, string? error = null)
        => _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
        {
            Status = status,
            SimulationSessionId = sessionId,
            SimulatorId = simulatorId,
            ErrorMessage = error,
        }, null);

    private Task<SimulationSessionDto?> ReportSessionAsync(
        string sessionId, string status, string simulatorId, int machined = 0, int remaining = 0, int total = 0)
        => _fx.SessionService.UpdateStateAsync(sessionId, new UpdateSimulationStateRequest
        {
            Status = status,
            SimulatorId = simulatorId,
            MachinedCount = machined,
            RemainingCount = remaining,
            TotalCount = total,
        }, null);

    [Fact]
    public async Task Partial_task_completion_never_completes_the_job()
    {
        var (job, dispatch, simulatorId) = await CreateDispatchedJobAsync();
        var tasks = dispatch.Tasks.OrderBy(t => t.SequenceOrder).ToList();

        await ReportTaskAsync(tasks[0].Id, "Running", dispatch.Session.Id, simulatorId);
        await ReportTaskAsync(tasks[0].Id, "Completed", dispatch.Session.Id, simulatorId);

        var afterFirst = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(afterFirst);
        Assert.Equal(JobStatus.Running.ToString(), afterFirst!.Status);
        Assert.Equal(50, afterFirst.ProgressPercent);
        Assert.Equal(1, afterFirst.CompletedTaskCount);
        Assert.Null(afterFirst.CompletedAtUtc);
    }

    [Fact]
    public async Task All_tasks_with_active_session_do_not_complete_the_job()
    {
        var (job, dispatch, simulatorId) = await CreateDispatchedJobAsync();
        var tasks = dispatch.Tasks.OrderBy(t => t.SequenceOrder).ToList();

        foreach (var task in tasks)
        {
            await ReportTaskAsync(task.Id, "Running", dispatch.Session.Id, simulatorId);
            await ReportTaskAsync(task.Id, "Completed", dispatch.Session.Id, simulatorId);
        }

        var afterTasks = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(afterTasks);
        Assert.Equal(JobStatus.Running.ToString(), afterTasks!.Status);
        Assert.Equal(100, afterTasks.ProgressPercent);
        Assert.Null(afterTasks.CompletedAtUtc);
    }

    [Fact]
    public async Task Completed_session_with_open_tasks_does_not_complete_the_job()
    {
        var (job, dispatch, simulatorId) = await CreateDispatchedJobAsync();
        var tasks = dispatch.Tasks.OrderBy(t => t.SequenceOrder).ToList();

        await ReportSessionAsync(dispatch.Session.Id, "Completed", simulatorId, 0, 2, 2);

        var afterSession = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(afterSession);
        Assert.Equal(JobStatus.Running.ToString(), afterSession!.Status);
        Assert.Null(afterSession.CompletedAtUtc);

        foreach (var task in tasks)
        {
            await ReportTaskAsync(task.Id, "Running", dispatch.Session.Id, simulatorId);
            await ReportTaskAsync(task.Id, "Completed", dispatch.Session.Id, simulatorId);
        }

        var completed = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(completed);
        Assert.Equal(JobStatus.Completed.ToString(), completed!.Status);
        Assert.NotNull(completed.CompletedAtUtc);
        Assert.Equal(100, completed.ProgressPercent);
    }

    [Fact]
    public async Task All_tasks_and_session_completed_completes_the_job_once()
    {
        var (job, dispatch, simulatorId) = await CreateDispatchedJobAsync();
        var tasks = dispatch.Tasks.OrderBy(t => t.SequenceOrder).ToList();

        foreach (var task in tasks)
        {
            await ReportTaskAsync(task.Id, "Running", dispatch.Session.Id, simulatorId);
            await ReportTaskAsync(task.Id, "Completed", dispatch.Session.Id, simulatorId);
        }

        await ReportSessionAsync(dispatch.Session.Id, "Completed", simulatorId, 2, 0, 2);

        var completed = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(completed);
        Assert.Equal(JobStatus.Completed.ToString(), completed!.Status);
        var completedAt = completed.CompletedAtUtc;
        Assert.NotNull(completedAt);

        // Duplicate terminal reports are harmless and never overwrite the terminal timestamp.
        await ReportSessionAsync(dispatch.Session.Id, "Completed", simulatorId, 2, 0, 2);
        await ReportTaskAsync(tasks[0].Id, "Completed", dispatch.Session.Id, simulatorId);

        var afterDuplicates = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(afterDuplicates);
        Assert.Equal(JobStatus.Completed.ToString(), afterDuplicates!.Status);
        Assert.Equal(completedAt, afterDuplicates.CompletedAtUtc);
    }

    [Fact]
    public async Task Failed_task_fails_the_job_with_evidence()
    {
        var (job, dispatch, simulatorId) = await CreateDispatchedJobAsync();
        var tasks = dispatch.Tasks.OrderBy(t => t.SequenceOrder).ToList();

        await ReportTaskAsync(tasks[0].Id, "Running", dispatch.Session.Id, simulatorId);
        await ReportTaskAsync(tasks[0].Id, "Failed", dispatch.Session.Id, simulatorId, "gripper fault");

        var failed = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(failed);
        Assert.Equal(JobStatus.Failed.ToString(), failed!.Status);
        Assert.NotNull(failed.FailedAtUtc);

        var storedTask = (await _fx.JobService.GetTasksByJobIdAsync(job.Id))
            .Single(t => t.Id == tasks[0].Id);
        Assert.Equal("Failed", storedTask.Status);
        Assert.Equal("gripper fault", storedTask.ErrorMessage);
    }

    [Fact]
    public async Task Faulted_session_fails_the_job()
    {
        var (job, dispatch, simulatorId) = await CreateDispatchedJobAsync();

        await ReportSessionAsync(dispatch.Session.Id, "Faulted", simulatorId);

        var failed = await _fx.JobService.GetByIdAsync(job.Id);
        Assert.NotNull(failed);
        Assert.Equal(JobStatus.Failed.ToString(), failed!.Status);
        Assert.NotNull(failed.FailedAtUtc);
    }

    [Fact]
    public async Task Legacy_job_without_tasks_remains_readable()
    {
        var legacy = await _fx.JobService.CreateAsync(new CreateJobRequest
        {
            Name = $"Legacy {Guid.NewGuid():N}",
            MachineMode = "Automatic",
        });

        var stored = await _fx.JobService.GetByIdAsync(legacy.Id);
        Assert.NotNull(stored);
        Assert.Equal(0, stored!.TaskCount);
        Assert.Equal(0, stored.ProgressPercent);
        Assert.Equal(1, stored.SchemaVersion);
        Assert.Equal("Created", stored.Status);
    }

    [Fact]
    public async Task Stale_job_update_is_rejected_by_optimistic_concurrency()
    {
        var job = await _fx.Composer.CreateAsync(new CreateJobRequest
        {
            Name = $"Concurrency {Guid.NewGuid():N}",
            MachineMode = "Automatic",
            TargetCellId = "reference-cell",
            PalletLayout = new PalletLayoutRequest { PalletId = "pallet-1", Rows = 1, Columns = 1 },
            OccupiedSlots = [new PalletSlotRequest { Row = 0, Column = 0 }],
        }, null);

        var first = await _fx.Jobs.GetByIdAsync(job.Id);
        var stale = await _fx.Jobs.GetByIdAsync(job.Id);
        Assert.NotNull(first);
        Assert.NotNull(stale);

        first!.Description = "first writer";
        Assert.True(await _fx.Jobs.UpdateAsync(first));

        stale!.Description = "stale writer";
        Assert.False(await _fx.Jobs.UpdateAsync(stale));

        var stored = await _fx.Jobs.GetByIdAsync(job.Id);
        Assert.Equal("first writer", stored!.Description);
    }
}