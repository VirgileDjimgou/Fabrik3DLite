using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.MongoDb;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Boots the production <c>Program.cs</c> pipeline in the <c>Testing</c> environment against an
/// isolated MongoDB container so HTTP-level authentication and authorization can be exercised for
/// real. The signing key is fixed so negative token tests can be forged deterministically; it is a
/// throwaway test value and never used outside this fixture.
/// </summary>
public sealed class AuthServerFixture : IAsyncLifetime
{
    public const string SigningKey = "fabrik3d-test-signing-key-0123456789-abcdefghijklmnopqrstuvwxyz-AB";

    private readonly MongoDbContainer _mongo = new MongoDbBuilder()
        .WithImage("mongo:7.0")
        .Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _mongo.StartAsync();

        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, configuration) =>
            {
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["MongoDb:ConnectionString"] = _mongo.GetConnectionString(),
                    ["MongoDb:DatabaseName"] = $"Fabrik3D_auth_tests_{Guid.NewGuid():N}",
                    ["Authentication:Mode"] = "Test",
                    ["Authentication:SigningKey"] = SigningKey,
                    ["Authentication:AccessTokenLifetimeMinutes"] = "15",
                    ["Authentication:PublicDemoEnabled"] = "true",
                    ["Historian:Enabled"] = "false",
                    ["OpcUa:Enabled"] = "false",
                    ["Mqtt:Enabled"] = "false",
                    ["Modbus:Enabled"] = "false",
                });
            });
        });
    }

    public Task<HttpClient> CreateAnonymousClientAsync() => Task.FromResult(Factory.CreateClient());

    /// <summary>Creates a client carrying a real test identity token for the given role.</summary>
    public async Task<HttpClient> CreateClientAsync(string role, string? subject = null)
    {
        var client = Factory.CreateClient();
        var token = await RequestTokenAsync(client, role, subject);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        return client;
    }

    /// <summary>Requests a development/test token without attaching it to the client.</summary>
    public static async Task<AuthTokenDto> RequestTokenAsync(HttpClient client, string role, string? subject = null)
    {
        var response = await client.PostAsJsonAsync("/api/auth/dev-token", new DevTokenRequest
        {
            Role = role,
            Subject = subject,
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthTokenDto>())!;
    }

    public async Task DisposeAsync()
    {
        Factory?.Dispose();
        await _mongo.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class AuthServerCollection : ICollectionFixture<AuthServerFixture>
{
    public const string Name = "auth-server-mongodb";
}
