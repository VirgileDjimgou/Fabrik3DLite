using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Server.Exceptions;

namespace Fabrik3D.Server.Tests;

[Collection(OrchestrationCollection.Name)]
public class ConcurrentCommandIntegrationTests
{
    private readonly OrchestrationFixture _fx;

    public ConcurrentCommandIntegrationTests(OrchestrationFixture fx) => _fx = fx;

    private Task<JobDto> CreateJobAsync() => _fx.JobService.CreateAsync(new CreateJobRequest
    {
        Name = "Concurrency job",
    });

    [Fact]
    public async Task Concurrent_starts_let_exactly_one_writer_win()
    {
        var job = await CreateJobAsync();

        var results = await Task.WhenAll(
            SafeStartAsync(job.Id),
            SafeStartAsync(job.Id),
            SafeStartAsync(job.Id));

        Assert.Equal(1, results.Count(r => r));

        var stored = await _fx.Jobs.GetByIdAsync(job.Id);
        Assert.NotNull(stored);
        Assert.Equal(JobStatus.Running, stored.Status);
        Assert.NotNull(stored.SimulationSessionId);
    }

    [Fact]
    public async Task Duplicate_job_commands_are_rejected_consistently()
    {
        var job = await CreateJobAsync();
        await _fx.JobService.StartAsync(job.Id, null);

        // start on Running must fail
        var startAgain = await Assert.ThrowsAsync<InvalidOperationException>(() => _fx.JobService.StartAsync(job.Id, null));
        Assert.Contains("Cannot start job in 'Running' state", startAgain.Message);

        await _fx.JobService.PauseAsync(job.Id, null);

        // pause on Paused must fail
        var pauseAgain = await Assert.ThrowsAsync<InvalidOperationException>(() => _fx.JobService.PauseAsync(job.Id, null));
        Assert.Contains("Cannot pause job in 'Paused' state", pauseAgain.Message);

        // resume while Paused succeeds, so stop after resume to prove the path.
        await _fx.JobService.ResumeAsync(job.Id, null);

        // resume on Running must fail
        var resumeWrong = await Assert.ThrowsAsync<InvalidOperationException>(() => _fx.JobService.ResumeAsync(job.Id, null));
        Assert.Contains("Cannot resume job in 'Running' state", resumeWrong.Message);
    }

    [Fact]
    public async Task Version_guard_rejects_stale_writers_on_job_entity()
    {
        var job = await CreateJobAsync();
        var stored = await _fx.Jobs.GetByIdAsync(job.Id);
        Assert.NotNull(stored);

        // Two writers hold the same version; the second replace must lose.
        stored.Status = JobStatus.Ready;
        Assert.True(await _fx.Jobs.UpdateAsync(stored));

        var stale = await _fx.Jobs.GetByIdAsync(job.Id);
        Assert.NotNull(stale);
        Assert.False(await _fx.Jobs.UpdateAsync(new Job
        {
            Id = stale.Id,
            Version = 0,
            Status = JobStatus.Ready,
        }));
    }

    private async Task<bool> SafeStartAsync(string jobId)
    {
        try
        {
            await _fx.JobService.StartAsync(jobId, null);
            return true;
        }
        catch (OrchestrationConflictException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            // A request that read the job after the winner committed is
            // rejected by the transition rules — also a consistent rejection.
            return false;
        }
    }
}
