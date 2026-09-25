using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Automated Mosquitto broker fixture for MQTT connector integration tests. It is started and
/// stopped by the tests themselves through Testcontainers (image <c>eclipse-mosquitto:2</c>), so no
/// hand-started broker is required for the mandatory gates. The container publishes a captured log
/// line once the broker is listening.
/// </summary>
public sealed class MosquittoContainerFixture : IAsyncDisposable
{
    public const string ImageTag = "eclipse-mosquitto:2";

    private readonly int _hostPort;
    private IContainer _container;

    private MosquittoContainerFixture(IContainer container, int hostPort)
    {
        _container = container;
        _hostPort = hostPort;
    }

    public string Host => "127.0.0.1";

    public int Port => _hostPort;

    public string BrokerUri => $"mqtt://{Host}:{Port}";

    public string Image => ImageTag;

    public static async Task<MosquittoContainerFixture> StartAsync()
    {
        var hostPort = GetFreeTcpPort();
        var fixture = new MosquittoContainerFixture(CreateContainer(hostPort), hostPort);
        await fixture._container.StartAsync().ConfigureAwait(false);
        return fixture;
    }

    private static IContainer CreateContainer(int hostPort)
        => new ContainerBuilder()
            .WithImage(ImageTag)
            .WithPortBinding(hostPort, 1883)
            .WithWaitStrategy(Wait.ForUnixContainer()
                .UntilMessageIsLogged(new Regex("mosquitto version .* running")))
            .Build();

    /// <summary>
    /// Restarts the broker on the same host port so a connected client observes a real outage and
    /// must reconnect. If the container cannot be restarted in place it is recreated on the same port.
    /// </summary>
    public async Task RestartAsync()
    {
        await _container.StopAsync().ConfigureAwait(false);
        try
        {
            await _container.StartAsync().ConfigureAwait(false);
        }
        catch
        {
            await _container.DisposeAsync().ConfigureAwait(false);
            _container = CreateContainer(_hostPort);
            await _container.StartAsync().ConfigureAwait(false);
        }
    }

    /// <summary>Recent broker log excerpt, used as completion evidence.</summary>
    public async Task<string> GetLogsAsync()
    {
        var (stdout, stderr) = await _container
            .GetLogsAsync(DateTime.UtcNow.AddMinutes(-5), DateTime.UtcNow, false, CancellationToken.None)
            .ConfigureAwait(false);
        return $"{stdout}\n{stderr}".Trim();
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await _container.DisposeAsync().ConfigureAwait(false);
        }
        catch
        {
            // Disposable test fixture; best-effort teardown.
        }
    }

    private static int GetFreeTcpPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
        finally
        {
            listener.Stop();
        }
    }
}
