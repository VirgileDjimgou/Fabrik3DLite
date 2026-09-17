using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Server.Exceptions;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Server.Tests;

[Collection(OrchestrationCollection.Name)]
public class TaskStatusIntegrationTests
{
    private readonly OrchestrationFixture _fx;

    public TaskStatusIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private async Task<(string JobId, string SessionId, string TaskId)> ClaimJobAsync()
    {
        var job = await _fx.JobService.CreateAsync(new CreateJobRequest
        {
            Name = "Task status job",
            Tasks =
            [
                new CreateTaskRequest { Name = "Slot R1 C2", PartType = "square-billet", PalletId = "pallet-1", SlotRow = 1, SlotColumn = 2 },
            ],
        });
        var claim = await _fx.JobService.ClaimAsync(job.Id, new ClaimJobRequest { SimulatorId = "sim-owner" }, null);
        Assert.NotNull(claim);
        return (job.Id, claim.Session.Id, claim.Tasks[0].Id);
    }

    [Fact]
    public async Task Owner_can_run_and_complete_a_task()
    {
        var (jobId, sessionId, taskId) = await ClaimJobAsync();

        var running = await _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
        {
            Status = "Running",
            SimulationSessionId = sessionId,
            SimulatorId = "sim-owner",
        }, "corr-task");

        Assert.NotNull(running);
        Assert.Equal(TaskStatusEnum.Running.ToString(), running.Status);
        Assert.NotNull(running.StartedAtUtc);

        var completed = await _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
        {
            Status = "Completed",
            SimulationSessionId = sessionId,
            SimulatorId = "sim-owner",
        }, "corr-task");

        Assert.NotNull(completed);
        Assert.Equal(TaskStatusEnum.Completed.ToString(), completed.Status);
        Assert.NotNull(completed.CompletedAtUtc);

        var taskEvent = Assert.Single(
            _fx.Hub.Events.OfType<TaskStateChangedEvent>(),
            e => e.TaskId == taskId && e.NewStatus == "Completed");
        Assert.Equal(jobId, taskEvent.JobId);
        Assert.Equal("Running", taskEvent.OldStatus);
        Assert.Equal("corr-task", taskEvent.CorrelationId);
    }

    [Fact]
    public async Task Foreign_simulator_cannot_update_task_status()
    {
        var (_, sessionId, taskId) = await ClaimJobAsync();

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
            {
                Status = "Running",
                SimulationSessionId = sessionId,
                SimulatorId = "sim-intruder",
            }, null));

        Assert.Equal("session_not_owned", conflict.Code);
    }

    [Fact]
    public async Task Wrong_session_reference_is_rejected()
    {
        var (_, sessionId, taskId) = await ClaimJobAsync();

        var conflict = await Assert.ThrowsAsync<OrchestrationConflictException>(() =>
            _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
            {
                Status = "Running",
                SimulationSessionId = "507f1f77bcf86cd799439011",
                SimulatorId = "sim-owner",
            }, null));

        Assert.Equal("session_not_owned", conflict.Code);
    }

    [Fact]
    public async Task Invalid_task_transition_is_rejected()
    {
        var (_, sessionId, taskId) = await ClaimJobAsync();

        await _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
        {
            Status = "Running", SimulationSessionId = sessionId, SimulatorId = "sim-owner",
        }, null);
        await _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
        {
            Status = "Completed", SimulationSessionId = sessionId, SimulatorId = "sim-owner",
        }, null);

        // Completed -> Completed must fail: duplicate command is rejected.
        var invalid = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _fx.TaskService.UpdateStatusAsync(taskId, new UpdateTaskStatusRequest
            {
                Status = "Completed", SimulationSessionId = sessionId, SimulatorId = "sim-owner",
            }, null));

        Assert.Contains("Cannot complete task in 'Completed' state", invalid.Message);
    }
}
