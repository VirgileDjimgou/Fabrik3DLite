using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Settings;
using Fabrik3D.Server.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Testcontainers.MongoDb;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Dedicated MongoDB Testcontainer for historian integration tests (S40). Each test gets an
/// isolated database so sampling state, pruning and performance runs cannot interfere.
/// </summary>
public sealed class HistorianFixture : IAsyncLifetime
{
    private readonly MongoDbContainer _container = new MongoDbBuilder()
        .WithImage("mongo:7.0")
        .Build();

    public async Task InitializeAsync() => await _container.StartAsync();

    public async Task DisposeAsync() => await _container.DisposeAsync();

    public MongoDbContext CreateContext() => new(Options.Create(new MongoDbSettings
    {
        ConnectionString = _container.GetConnectionString(),
        DatabaseName = $"Fabrik3D_historian_{Guid.NewGuid():N}",
    }));

    public HistorianRepository CreateRepository(MongoDbContext context) => new(context);

    public HistorianService CreateService(
        MongoDbContext context,
        HistorianOptions? options = null,
        TimeProvider? timeProvider = null) =>
        new(
            new HistorianRepository(context),
            Options.Create(options ?? new HistorianOptions { Enabled = true }),
            NullLogger<HistorianService>.Instance,
            timeProvider ?? TimeProvider.System);
}

[CollectionDefinition(Name)]
public sealed class HistorianCollection : ICollectionFixture<HistorianFixture>
{
    public const string Name = "isolated-historian-mongodb";
}
