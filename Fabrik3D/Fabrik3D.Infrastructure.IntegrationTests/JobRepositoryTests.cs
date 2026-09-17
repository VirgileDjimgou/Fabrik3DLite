using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Infrastructure.IntegrationTests;

[Collection(MongoDbCollection.Name)]
public class JobRepositoryTests
{
    private readonly MongoDbFixture _fixture;

    public JobRepositoryTests(MongoDbFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Create_update_and_get_are_persisted_in_an_isolated_database()
    {
        var repository = new JobRepository(_fixture.CreateContext());
        var job = new Job { Name = "Repository test", Status = JobStatus.Created };

        await repository.CreateAsync(job);
        job.Status = JobStatus.Running;
        job.ProgressPercent = 40;
        await repository.UpdateAsync(job);

        var stored = await repository.GetByIdAsync(job.Id);

        Assert.NotNull(stored);
        Assert.Equal(JobStatus.Running, stored.Status);
        Assert.Equal(40, stored.ProgressPercent);
    }
}
