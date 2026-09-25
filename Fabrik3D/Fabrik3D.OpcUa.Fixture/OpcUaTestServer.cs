using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Logging;
using Opc.Ua;
using Opc.Ua.Configuration;
using Opc.Ua.Server;

namespace Fabrik3D.OpcUa.Fixture;

/// <summary>
/// Minimal OPC UA server used only by the S33 connector integration tests. It exposes a handful
/// of read/write variables. It is a real OPC UA server (real TCP transport, binary encoding,
/// sessions, subscriptions and monitored items), but it is not a product and is never shipped.
/// </summary>
public sealed class FixtureServer : StandardServer
{
    private readonly IReadOnlyList<FixtureVariable> _definitions;

    public FixtureServer(IReadOnlyList<FixtureVariable> definitions) => _definitions = definitions;

    public FixtureNodeManager? NodeManager { get; private set; }

    protected override MasterNodeManager CreateMasterNodeManager(IServerInternal server, ApplicationConfiguration configuration)
    {
        NodeManager = new FixtureNodeManager(server, configuration, _definitions);
        return new MasterNodeManager(server, configuration, null, new INodeManager[] { NodeManager });
    }

    protected override ServerProperties LoadServerProperties() => new()
    {
        ManufacturerName = "Fabrik3D",
        ProductName = "Fabrik3D OPC UA test fixture",
        ProductUri = "urn:fabrik3d:product",
        SoftwareVersion = "1.0.0",
        BuildNumber = "1",
        BuildDate = DateTime.UtcNow,
    };
}

/// <summary>Lifecycle wrapper around an in-process <see cref="FixtureServer"/> on a free loopback port.</summary>
public sealed class OpcUaTestServer : IAsyncDisposable
{
    private static readonly ITelemetryContext Telemetry =
        DefaultTelemetry.Create(builder => builder.SetMinimumLevel(LogLevel.Warning));

    public static readonly IReadOnlyList<FixtureVariable> DefaultVariables =
    [
        new FixtureVariable("Fabrik3D/Robot/Speed", DataTypeIds.Double, 1.5d),
        new FixtureVariable("Fabrik3D/Robot/ExecutionState", DataTypeIds.String, "Idle"),
        new FixtureVariable("Fabrik3D/Robot/Start", DataTypeIds.Boolean, false),
        new FixtureVariable("Fabrik3D/Robot/Counter", DataTypeIds.Int32, 0),
    ];

    private readonly ApplicationInstance _application;
    private readonly string _pkiRoot;

    private OpcUaTestServer(ApplicationInstance application, FixtureServer server, string endpointUrl, string pkiRoot)
    {
        _application = application;
        _pkiRoot = pkiRoot;
        FixtureServer = server;
        EndpointUrl = endpointUrl;
    }

    public FixtureServer FixtureServer { get; }

    public string EndpointUrl { get; }

    public FixtureNodeManager NodeManager => FixtureServer.NodeManager
        ?? throw new InvalidOperationException("The fixture node manager is not available before the server starts.");

    public string NodeIdText(string identifier) => NodeManager.NodeIdText(identifier);

    public void SetValue(string identifier, object? value, uint statusCode = StatusCodes.Good)
        => NodeManager.SetValue(identifier, value, statusCode);

    public object? GetValue(string identifier) => NodeManager.GetValue(identifier);

    public static async Task<OpcUaTestServer> StartAsync(
        string? pkiRoot = null,
        IReadOnlyList<FixtureVariable>? variables = null,
        int? port = null)
    {
        var resolvedPort = port ?? GetFreeTcpPort();
        var endpointUrl = $"opc.tcp://127.0.0.1:{resolvedPort}/Fabrik3D";
        var root = pkiRoot ?? Path.Combine(Path.GetTempPath(), $"fabrik3d-opcua-fixture-{Guid.NewGuid():N}");
        var appRoot = Path.Combine(root, "own");
        var rejectedRoot = Path.Combine(root, "rejected");
        Directory.CreateDirectory(appRoot);
        Directory.CreateDirectory(rejectedRoot);

        var application = new ApplicationInstance(Telemetry)
        {
            ApplicationName = "Fabrik3D.OpcUa.Fixture",
            ApplicationType = ApplicationType.Server,
        };

        var applicationCertificate = new CertificateIdentifier
        {
            StoreType = CertificateStoreType.Directory,
            StorePath = appRoot,
            SubjectName = "CN=Fabrik3D.OpcUa.Fixture, O=Fabrik3D",
            CertificateType = ObjectTypeIds.RsaSha256ApplicationCertificateType,
        };

        var configuration = await application
            .Build("urn:fabrik3d:opcua:fixture", "urn:fabrik3d:product")
            .SetOperationTimeout(15000)
            .AsServer([endpointUrl], [])
            .AddUnsecurePolicyNone(true)
            .AddSignAndEncryptPolicies(true)
            .AddSecurityConfiguration(new CertificateIdentifierCollection { applicationCertificate }, root, rejectedRoot)
            .SetAutoAcceptUntrustedCertificates(true)
            .SetAddAppCertToTrustedStore(true)
            .CreateAsync(CancellationToken.None)
            .ConfigureAwait(false);

        application.ApplicationConfiguration = configuration;
        await application.CheckApplicationInstanceCertificatesAsync(true, null, CancellationToken.None).ConfigureAwait(false);

        var server = new FixtureServer(variables ?? DefaultVariables);
        await application.StartAsync(server).ConfigureAwait(false);

        return new OpcUaTestServer(application, server, endpointUrl, root);
    }

    /// <summary>
    /// Returns an available loopback TCP port so a test can restart a fixture on the same endpoint
    /// (used to exercise connector reconnection deterministically).
    /// </summary>
    public static int ReserveLoopbackPort() => GetFreeTcpPort();

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

    public async ValueTask DisposeAsync()
    {
        try
        {
            await _application.StopAsync().ConfigureAwait(false);
        }
        catch (Exception)
        {
            // Best-effort shutdown for a test fixture.
        }

        try
        {
            if (Directory.Exists(_pkiRoot))
            {
                Directory.Delete(_pkiRoot, recursive: true);
            }
        }
        catch (IOException)
        {
            // Certificate handles can outlive the test; the temp directory is disposable.
        }
    }
}
