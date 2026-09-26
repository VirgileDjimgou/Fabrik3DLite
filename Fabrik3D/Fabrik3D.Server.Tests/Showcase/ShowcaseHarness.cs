using System.Diagnostics;
using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Control;
using Fabrik3D.Infrastructure.Mapping;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;
using Fabrik3D.Modbus.Fixture;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Tests.Showcase;

/// <summary>
/// Automated substitute for the CODESYS / SoftPLC controller used by CI. It exposes the same I/O
/// map as the showcase documentation (<c>docs/showcases/codesys-softplc/io-map.json</c>) through the
/// in-process, real Modbus TCP fixture server, so no proprietary or hand-started software is needed
/// for the mandatory gates. This is deliberately a deterministic test fixture, not a product PLC.
/// </summary>
internal sealed class ShowcaseFixtureController
{
    // Zero-based holding-register layout, identical to the committed io-map.json.
    private const int CommandRegister = 0;
    private const int PalletRegister = 1;
    private const int TargetRegister = 2;
    private const int StatusRegister = 10;
    private const int ActuatorRegister = 11;
    private const int SensorRegister = 12;
    private const int PartsRegister = 13;

    private const int StartBit = 0;
    private const int StopBit = 1;
    private const int ResetBit = 2;
    private const int PalletBit = 0;

    private const int ReadyBit = 0;
    private const int RunningBit = 1;
    private const int RobotCompleteBit = 2;
    private const int CncCompleteBit = 3;
    private const int CycleCompleteBit = 4;
    private const int FaultBit = 5;

    private readonly ModbusTcpFixtureServer _server;

    public ShowcaseFixtureController(ModbusTcpFixtureServer server) => _server = server;

    private ushort CommandWord
    {
        get => _server.GetHoldingRegister(CommandRegister);
        set => _server.SetHoldingRegister(CommandRegister, value);
    }

    private ushort PalletWord
    {
        get => _server.GetHoldingRegister(PalletRegister);
        set => _server.SetHoldingRegister(PalletRegister, value);
    }

    public void SetStart(bool value) => SetCommandBit(StartBit, value);

    public void SetStop(bool value) => SetCommandBit(StopBit, value);

    public void SetReset(bool value) => SetCommandBit(ResetBit, value);

    public void SetPalletPresent(bool value)
        => PalletWord = ApplyBit(PalletWord, value, PalletBit);

    public void SetCycleTarget(int value)
        => _server.SetHoldingRegister(TargetRegister, (ushort)Math.Clamp(value, 0, 100));

    public bool Ready => ReadStatusBit(ReadyBit);

    public bool Running => ReadStatusBit(RunningBit);

    public bool RobotCycleComplete => ReadStatusBit(RobotCompleteBit);

    public bool CncCycleComplete => ReadStatusBit(CncCompleteBit);

    public bool CycleComplete => ReadStatusBit(CycleCompleteBit);

    public bool Fault => ReadStatusBit(FaultBit);

    public int ActuatorPosition => _server.GetHoldingRegister(ActuatorRegister);

    public int SensorPosition => _server.GetHoldingRegister(SensorRegister);

    public int PartsCompleted => _server.GetHoldingRegister(PartsRegister);

    private void SetCommandBit(int bit, bool value)
        => CommandWord = ApplyBit(CommandWord, value, bit);

    private bool ReadStatusBit(int bit)
        => ((_server.GetHoldingRegister(StatusRegister) >> bit) & 0x1) == 1;

    private static ushort ApplyBit(ushort register, bool value, int bitIndex)
    {
        var mask = (ushort)(1 << bitIndex);
        return value ? (ushort)(register | mask) : (ushort)(register & ~mask);
    }
}

/// <summary>
/// Test harness for the S46 showcase: a real Modbus TCP fixture server, the real Modbus connector
/// driven by the committed showcase I/O map, the protocol-free signal mirror and the deterministic
/// virtual cell. It reproduces the documented run without CODESYS or any proprietary dependency.
/// </summary>
internal sealed class ShowcaseHarness : IAsyncDisposable
{
    public const string IoMapRelativePath = "docs/showcases/codesys-softplc/io-map.json";

    private ShowcaseHarness(
        ModbusTcpFixtureServer fixture,
        ModbusConnector connector,
        SignalMirrorStore mirror,
        ShowcaseCellController cell,
        SignalMappingDocumentDto ioMap)
    {
        Fixture = fixture;
        Connector = connector;
        Mirror = mirror;
        Cell = cell;
        Plc = new ShowcaseFixtureController(fixture);
        IoMap = ioMap;
    }

    public ModbusTcpFixtureServer Fixture { get; }

    public ModbusConnector Connector { get; }

    public SignalMirrorStore Mirror { get; }

    public ShowcaseCellController Cell { get; }

    public ShowcaseFixtureController Plc { get; }

    public SignalMappingDocumentDto IoMap { get; }

    /// <summary>Starts the fixture, applies the committed map and binds the cell to the authority gate.</summary>
    public static async Task<ShowcaseHarness> StartAsync(
        SignalMappingDocumentDto ioMap,
        IControlAuthorityGate gate,
        string? scope = null,
        CancellationToken cancellationToken = default)
    {
        var fixture = await ModbusTcpFixtureServer.StartAsync();
        var baseOptions = new ModbusOptions
        {
            Enabled = true,
            Host = "127.0.0.1",
            Port = fixture.Port,
            UnitId = 1,
            ConnectTimeoutMilliseconds = 5000,
            RequestTimeoutMilliseconds = 2000,
            PollIntervalMilliseconds = 50,
            ReconnectDelaySeconds = 1,
            MaxReconnectDelaySeconds = 1,
            StaleAfterMilliseconds = 30000,
            AllowWrites = true,
            WriteAllowList = [.. ShowcaseSignalMap.WriteSignals],
            AddressConvention = "zero-based",
        };

        var options = SignalMappingProjection.BuildModbusOptions(baseOptions, ioMap);
        var mirror = new SignalMirrorStore();
        var connector = new ModbusConnector(
            Options.Create(options), mirror, TimeProvider.System, NullLogger<ModbusConnector>.Instance);
        var cell = new ShowcaseCellController(gate, mirror, connector, scope);

        await connector.StartAsync(cancellationToken);
        return new ShowcaseHarness(fixture, connector, mirror, cell, ioMap);
    }

    public static SignalMappingDocumentDto LoadIoMap()
    {
        var path = LocateIoMap() ?? throw new FileNotFoundException("showcase io-map.json was not found above the test output directory.");
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        return JsonSerializer.Deserialize<SignalMappingDocumentDto>(File.ReadAllText(path), options)
               ?? throw new InvalidDataException("showcase io-map.json could not be deserialized.");
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
        => WaitUntilAsync(() => Connector.State == ModbusConnectorState.Connected, timeout);

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
