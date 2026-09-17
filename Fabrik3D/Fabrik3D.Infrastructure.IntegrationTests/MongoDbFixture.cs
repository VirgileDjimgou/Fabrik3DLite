using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Settings;
using Microsoft.Extensions.Options;
using Testcontainers.MongoDb;

namespace Fabrik3D.Infrastructure.IntegrationTests;

public sealed class MongoDbFixture : IAsyncLifetime
{
    private readonly MongoDbContainer _container = new MongoDbBuilder()
        .WithImage("mongo:7.0")
        .Build();

    public async Task InitializeAsync() => await _container.StartAsync();

    public async Task DisposeAsync() => await _container.DisposeAsync();

    public MongoDbContext CreateContext() => new(Options.Create(new MongoDbSettings
    {
        ConnectionString = _container.GetConnectionString(),
        DatabaseName = $"Fabrik3D_tests_{Guid.NewGuid():N}",
    }));
}

[CollectionDefinition(Name)]
public sealed class MongoDbCollection : ICollectionFixture<MongoDbFixture>
{
    public const string Name = "isolated-mongodb";
}
