using System.Diagnostics;
using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Control;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Mapping;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.OpcUa.Fixture;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Opc.Ua;

namespace Fabrik3D.Server.Tests.Showcase;

/// <summary>
/// Siemens-profile node-id conventions. The committed Siemens I/O map addresses a real S7-1500 /
/// PLCSIM Advanced OPC UA server with the TIA Portal namespace index <c>3</c> and quoted DB syntax
/// (<c>ns=3;s="Fabrik3D_Cell_DB"."Start"</c>). The CI substitute serves the same symbolic
/// identifiers in the local fixture namespace (<c>ns=1</c>). Only the namespace index changes; the
/// identifier, direction, data type and scaling are never rewritten.
/// </summary>
internal static class SiemensProfileNodeIds
{
    /// <summary>TIA Portal exports DB tags under its own OPC UA namespace (conventionally index 3).</summary>
    public const string SiemensNsPrefix = "ns=3;s=";

    /// <summary>Strips the namespace prefix and the TIA Portal quoting to a stable symbolic identifier.</summary>
    public static string ToIdentifier(string nodeId)
    {
        var separator = nodeId.IndexOf(";s=", StringComparison.OrdinalIgnoreCase);
        var identifier = separator >= 0 ? nodeId[(separator + 3)..] : nodeId;
        return identifier.Replace("\"", string.Empty, StringComparison.Ordinal);
    }

    public static bool IsSiemensStyle(string nodeId)
        => nodeId.StartsWith(SiemensNsPrefix, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves the concrete <c>ns=…;s=</c> prefix of the running fixture. The fixture assigns its
    /// own namespace index, so the prefix is read from the fixture instead of being hard-coded.
    /// </summary>
    public static string FixturePrefix(OpcUaTestServer fixture)
    {
        const string probe = "Fabrik3D_FixtureProbe";
        var text = fixture.NodeIdText(probe);
        var index = text.IndexOf(";s=", StringComparison.OrdinalIgnoreCase);
        return index >= 0 ? text[..(index + 3)] : "ns=1;s=";
    }

    /// <summary>Copies the document with OPC UA targets re-addressed into the fixture namespace.</summary>
    public static SignalMappingDocumentDto RewriteToFixture(SignalMappingDocumentDto document, string fixturePrefix)
    {
        var entries = document.Entries
            .Select(entry => string.Equals(entry.Protocol?.Trim(), "opcua", StringComparison.OrdinalIgnoreCase)
                ? entry with
                {
                    Target = entry.Target with
                    {
                        NodeId = entry.Target.NodeId is { Length: > 0 } nodeId
                            ? fixturePrefix + ToIdentifier(nodeId)
                            : entry.Target.NodeId,
                    },
                }
                : entry)
            .ToList();

        return document with { Entries = entries };
    }

    public static NodeId FixtureDataType(string dataType) => dataType.Trim().ToLowerInvariant() switch
    {
        "bool" => DataTypeIds.Boolean,
        "float" => DataTypeIds.Double,
        _ => DataTypeIds.Int32,
    };

    public static object? InitialValue(string dataType) => dataType.Trim().ToLowerInvariant() switch
    {
        "bool" => false,
        "float" => 0d,
        _ => 0,
    };
}

/// <summary>
/// Minimal controller view over the running OPC UA fixture for the Siemens profile test. It reads
/// and writes the same symbolic tags the committed map addresses, so the test observes exactly the
/// values the real connector exchanged.
/// </summary>
internal sealed class SiemensPlcFixtureController
{
    private readonly OpcUaTestServer _fixture;
    private readonly IReadOnlyDictionary<string, string> _identifiersBySignalId;

    public SiemensPlcFixtureController(OpcUaTestServer fixture, IReadOnlyDictionary<string, string> identifiersBySignalId)
    {
        _fixture = fixture;
        _identifiersBySignalId = identifiersBySignalId;
    }

    private string Identifier(string signalId) =>
        _identifiersBySignalId.TryGetValue(signalId, out var identifier)
            ? identifier
            : throw new KeyNotFoundException($"Signal '{signalId}' is not declared in the Siemens profile map.");

    public void SetStart(bool value) => _fixture.SetValue(Identifier(ShowcaseSignalMap.Start), value);

    public void SetStop(bool value) => _fixture.SetValue(Identifier(ShowcaseSignalMap.Stop), value);

    public void SetReset(bool value) => _fixture.SetValue(Identifier(ShowcaseSignalMap.Reset), value);

    public void SetPalletPresent(bool value) => _fixture.SetValue(Identifier(ShowcaseSignalMap.PalletPresent), value);

    public void SetCycleTarget(int value) => _fixture.SetValue(Identifier(ShowcaseSignalMap.CycleTarget), value);

    public bool Ready => ReadBool(ShowcaseSignalMap.Ready);

    public bool Running => ReadBool(ShowcaseSignalMap.Running);

    public bool RobotCycleComplete => ReadBool(ShowcaseSignalMap.RobotCycleComplete);

    public bool CncCycleComplete => ReadBool(ShowcaseSignalMap.CncCycleComplete);

    public bool CycleComplete => ReadBool(ShowcaseSignalMap.CycleComplete);

    public bool Fault => ReadBool(ShowcaseSignalMap.Fault);

    public int ActuatorPosition => ReadInt(ShowcaseSignalMap.ActuatorPosition);

    public int SensorPosition => ReadInt(ShowcaseSignalMap.SensorPosition);

    public int PartsCompleted => ReadInt(ShowcaseSignalMap.PartsCompleted);

    private bool ReadBool(string signalId) => true.Equals(_fixture.GetValue(Identifier(signalId)));

    private int ReadInt(string signalId) => Convert.ToInt32(_fixture.GetValue(Identifier(signalId)) ?? 0);
}

/// <summary>
/// Test-only S36 authority gate backed by the real pure <see cref="ControlAuthorityRules"/> engine
/// (no persistence). It lets the Siemens substitute exercise acquire / local-denial / controller
/// loss / release semantics without a database, while still using the shipped rule evaluation.
/// </summary>
internal sealed class SiemensProfileAuthority : IControlAuthorityGate
{
    private readonly ControlAuthority _authority;

    public SiemensProfileAuthority(string scope, string? ownerId = null)
    {
        _authority = new ControlAuthority
        {
            Id = scope,
            Mode = ControlAuthorityMode.ExternalController,
            State = ControlAuthorityState.Held,
            OwnerKind = ControlAuthorityOwnerKind.Connector,
            OwnerId = ownerId ?? ShowcaseSignalMap.ControllerOwnerId,
            AcquiredAtUtc = DateTime.UtcNow,
            LeaseExpiresAtUtc = DateTime.UtcNow.AddMinutes(10),
            LastHeartbeatUtc = DateTime.UtcNow,
        };
    }

    public string State => ControlAuthorityRules.ToWire(_authority.State);

    public string Mode => ControlAuthorityRules.ToWire(_authority.Mode);

    public string OwnerId => _authority.OwnerId ?? string.Empty;

    public Task<ControlAuthorityDecision> AuthorizeCommandAsync(
        string scope,
        ControlAuthorityMode requestedMode,
        string? ownerId,
        CancellationToken cancellationToken = default)
        => Task.FromResult(ControlAuthorityRules.EvaluateCommand(_authority, requestedMode, ownerId, DateTime.UtcNow));

    public void Degrade(string reason)
    {
        _authority.State = ControlAuthorityState.Degraded;
        _authority.DegradedReason = reason;
    }

    public void Release()
    {
        _authority.State = ControlAuthorityState.Available;
        _authority.OwnerId = null;
        _authority.Mode = ControlAuthorityMode.LocalSimulation;
        _authority.DegradedReason = null;
    }
}

/// <summary>
/// Automated substitute for a Siemens S7-1500 / PLCSIM Advanced controller used by CI (S47). It
/// starts the real in-process OPC UA fixture (real TCP transport, sessions, subscriptions,
/// monitored items), projects the committed <c>docs/showcases/siemens-plcsim/io-map.json</c> into
/// the real <see cref="OpcUaConnector"/>, and drives the shared deterministic cell state machine
/// through the same write delegate the Modbus showcase uses. No TIA Portal, PLCSIM, license or
/// hand-started server is required for the mandatory gates.
/// </summary>
internal sealed class SiemensPlcHarness : IAsyncDisposable
{
    public const string IoMapRelativePath = "docs/showcases/siemens-plcsim/io-map.json";

    private SiemensPlcHarness(
        OpcUaTestServer fixture,
        OpcUaConnector connector,
        SignalMirrorStore mirror,
        ShowcaseCellController cell,
        SiemensPlcFixtureController plc,
        SignalMappingDocumentDto ioMap,
        IReadOnlyDictionary<string, string> identifiersBySignalId)
    {
        Fixture = fixture;
        Connector = connector;
        Mirror = mirror;
        Cell = cell;
        Plc = plc;
        IoMap = ioMap;
        IdentifiersBySignalId = identifiersBySignalId;
    }

    public OpcUaTestServer Fixture { get; }

    public OpcUaConnector Connector { get; }

    public SignalMirrorStore Mirror { get; }

    public ShowcaseCellController Cell { get; }

    public SiemensPlcFixtureController Plc { get; }

    public SignalMappingDocumentDto IoMap { get; }

    public IReadOnlyDictionary<string, string> IdentifiersBySignalId { get; }

    public static async Task<SiemensPlcHarness> StartAsync(
        SignalMappingDocumentDto ioMap,
        IControlAuthorityGate gate,
        string? scope = null,
        string securityPolicy = "None",
        bool autoAcceptUntrustedCertificates = true,
        CancellationToken cancellationToken = default)
    {
        var opcuaEntries = ioMap.Entries
            .Where(entry => string.Equals(entry.Protocol?.Trim(), "opcua", StringComparison.OrdinalIgnoreCase) && entry.Enabled)
            .ToList();

        var identifiersBySignalId = opcuaEntries.ToDictionary(
            entry => entry.InternalSignalId,
            entry => SiemensProfileNodeIds.ToIdentifier(entry.Target.NodeId ?? string.Empty),
            StringComparer.Ordinal);

        var variables = opcuaEntries
            .Select(entry => new FixtureVariable(
                identifiersBySignalId[entry.InternalSignalId],
                SiemensProfileNodeIds.FixtureDataType(entry.DataType),
                SiemensProfileNodeIds.InitialValue(entry.DataType)))
            .ToList();

        var fixture = await OpcUaTestServer.StartAsync(variables: variables);
        var fixturePrefix = SiemensProfileNodeIds.FixturePrefix(fixture);
        var fixtureDocument = SiemensProfileNodeIds.RewriteToFixture(ioMap, fixturePrefix);

        var baseOptions = new OpcUaOptions
        {
            Enabled = true,
            Endpoint = fixture.EndpointUrl,
            SecurityPolicy = securityPolicy,
            ApplicationName = "Fabrik3D.SiemensProfileTests",
            CertificateTrustStore = TempTrustStore(),
            AutoAcceptUntrustedCertificates = autoAcceptUntrustedCertificates,
            ReconnectDelaySeconds = 1,
            MaxReconnectDelaySeconds = 2,
            SamplingIntervalMilliseconds = 100,
            PublishingIntervalMilliseconds = 200,
            OperationTimeoutMilliseconds = 10_000,
            SessionTimeoutMilliseconds = 30_000,
            StaleAfterMilliseconds = 30_000,
            AllowWrites = true,
            WriteAllowList = fixtureDocument.Entries
                .Where(entry => SignalMappingVocabulary.DirectionAllowsWrite(entry.Direction))
                .Select(entry => entry.Target.NodeId!)
                .ToList(),
        };

        var options = SignalMappingProjection.BuildOpcUaOptions(baseOptions, fixtureDocument);
        var mirror = new SignalMirrorStore();
        var connector = new OpcUaConnector(Options.Create(options), mirror, NullLogger<OpcUaConnector>.Instance);
        var cell = new ShowcaseCellController(
            gate,
            mirror,
            async (signalId, value, token) =>
            {
                var result = await connector.WriteAsync(signalId, value, token);
                return new ShowcaseWriteOutcome(result.Accepted, result.RejectionReason);
            },
            scope);

        await connector.StartAsync(cancellationToken);
        return new SiemensPlcHarness(
            fixture, connector, mirror, cell,
            new SiemensPlcFixtureController(fixture, identifiersBySignalId),
            ioMap, identifiersBySignalId);
    }

    public static SignalMappingDocumentDto LoadIoMap()
    {
        var path = LocateIoMap() ?? throw new FileNotFoundException("Siemens profile io-map.json was not found above the test output directory.");
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        return JsonSerializer.Deserialize<SignalMappingDocumentDto>(File.ReadAllText(path), options)
               ?? throw new InvalidDataException("Siemens profile io-map.json could not be deserialized.");
    }

    public static string? LocateIoMap()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, IoMapRelativePath);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        return null;
    }

    public async Task<bool> WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
    {
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < timeout)
        {
            if (condition())
            {
                return true;
            }

            await Task.Delay(25);
        }

        return condition();
    }

    public Task<bool> WaitForConnectedAsync(TimeSpan timeout)
        => WaitUntilAsync(() => Connector.State == OpcUaConnectorState.Connected, timeout);

    private static string TempTrustStore()
        => Path.Combine(Path.GetTempPath(), "fabrik3d-siemens-tests", Guid.NewGuid().ToString("N"));

    public async ValueTask DisposeAsync()
    {
        try
        {
            await Connector.StopAsync(CancellationToken.None);
        }
        catch (Exception)
        {
            // Best-effort teardown.
        }

        await Connector.DisposeAsync();
        await Fixture.DisposeAsync();
    }
}
