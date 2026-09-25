using System.Diagnostics;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Signals;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Deterministic unit tests for the server-side signal mirror (S33). They cover the same
/// arbitration rules documented for the simulator signal core so the two vocabularies cannot drift.
/// </summary>
public class SignalMirrorStoreTests
{
    private static readonly DateTimeOffset Origin = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private readonly ITestOutputHelper _output;

    public SignalMirrorStoreTests(ITestOutputHelper output) => _output = output;

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static IndustrialSignalDefinition Definition(
        string signalId = "robot-1.Speed",
        SignalDataType dataType = SignalDataType.Float,
        bool writable = true,
        double? min = null,
        double? max = null,
        IReadOnlyList<string>? enumValues = null,
        int? staleAfterMs = null)
    {
        var separator = signalId.IndexOf('.', StringComparison.Ordinal);
        var equipmentId = separator > 0 ? signalId[..separator] : signalId;
        var name = separator > 0 ? signalId[(separator + 1)..] : signalId;
        return new IndustrialSignalDefinition(
            signalId,
            equipmentId,
            name,
            name,
            SignalDirection.InputToController,
            dataType,
            null,
            writable,
            min,
            max,
            enumValues,
            null,
            staleAfterMs);
    }

    private static IndustrialSignalUpdate Update(
        string signalId,
        object? value,
        DateTimeOffset timestamp,
        SignalQuality quality = SignalQuality.Good,
        SignalSource source = SignalSource.Observed,
        SignalOrigin origin = SignalOrigin.Controller)
        => new(signalId, value, quality, source, origin, timestamp);

    [Fact]
    public void Registration_rejects_invalid_and_duplicate_definitions()
    {
        var mirror = new SignalMirrorStore();

        Assert.False(mirror.TryRegister(Definition(""), out var invalid));
        Assert.Equal("invalid-definition", invalid);

        Assert.True(mirror.TryRegister(Definition("robot-1.Speed"), out var first));
        Assert.Null(first);

        Assert.False(mirror.TryRegister(Definition("robot-1.Speed"), out var duplicate));
        Assert.Equal("duplicate-signal", duplicate);
        Assert.Equal(1, mirror.DefinitionCount);
    }

    [Fact]
    public void Unknown_signals_and_default_timestamps_are_rejected()
    {
        var mirror = new SignalMirrorStore();

        Assert.Equal("unknown-signal",
            mirror.Apply(Update("robot-1.Speed", 1.0, Origin)).RejectionReason);

        mirror.TryRegister(Definition(), out _);
        Assert.Equal("invalid-timestamp",
            mirror.Apply(Update("robot-1.Speed", 1.0, default)).RejectionReason);
        Assert.Equal(0, mirror.SampleCount);
    }

    [Fact]
    public void Non_writable_signals_accept_observed_updates_but_reject_commanded_ones()
    {
        var mirror = new SignalMirrorStore();
        mirror.TryRegister(Definition(writable: false), out _);

        var observed = mirror.Apply(Update("robot-1.Speed", 1.5, Origin, source: SignalSource.Observed));
        Assert.True(observed.Accepted);

        var commanded = mirror.Apply(Update(
            "robot-1.Speed", 2.0, Origin.AddSeconds(1), source: SignalSource.Commanded, origin: SignalOrigin.Operator));
        Assert.False(commanded.Accepted);
        Assert.Equal("not-writable", commanded.RejectionReason);

        Assert.True(mirror.TryGetSample("robot-1.Speed", out var sample));
        Assert.Equal(1.5, sample!.Value);
    }

    [Fact]
    public void Type_range_and_enum_validation_never_mutates_the_stored_sample()
    {
        var mirror = new SignalMirrorStore();
        mirror.TryRegister(Definition("robot-1.Speed", SignalDataType.Float, min: 0, max: 10), out _);
        mirror.TryRegister(Definition("robot-1.Mode", SignalDataType.Enum, enumValues: ["Auto", "Manual"]), out _);
        mirror.TryRegister(Definition("robot-1.ServoOn", SignalDataType.Bool), out _);
        mirror.TryRegister(Definition("robot-1.Recipe", SignalDataType.String), out _);

        Assert.True(mirror.Apply(Update("robot-1.Speed", 5.0, Origin)).Accepted);

        Assert.Equal("out-of-range", mirror.Apply(Update("robot-1.Speed", 11.0, Origin.AddSeconds(1))).RejectionReason);
        Assert.Equal("type-mismatch", mirror.Apply(Update("robot-1.Speed", "fast", Origin.AddSeconds(2))).RejectionReason);
        Assert.Equal("type-mismatch", mirror.Apply(Update("robot-1.ServoOn", 1, Origin)).RejectionReason);
        Assert.True(mirror.Apply(Update("robot-1.ServoOn", true, Origin)).Accepted);
        Assert.Equal("invalid-enum", mirror.Apply(Update("robot-1.Mode", "Teleop", Origin)).RejectionReason);
        Assert.True(mirror.Apply(Update("robot-1.Mode", "Auto", Origin)).Accepted);
        Assert.Equal("type-mismatch", mirror.Apply(Update("robot-1.Recipe", 42, Origin)).RejectionReason);

        Assert.True(mirror.TryGetSample("robot-1.Speed", out var sample));
        Assert.Equal(5.0, sample!.Value);
        Assert.Equal(3, mirror.SampleCount);
    }

    [Fact]
    public void Timestamps_and_source_priority_arbitrate_deterministically()
    {
        var mirror = new SignalMirrorStore();
        mirror.TryRegister(Definition(), out _);

        Assert.True(mirror.Apply(Update("robot-1.Speed", 2.0, Origin, source: SignalSource.Observed)).Accepted);

        Assert.Equal("stale-timestamp",
            mirror.Apply(Update("robot-1.Speed", 1.0, Origin.AddSeconds(-1), source: SignalSource.Observed)).RejectionReason);

        Assert.Equal("lower-priority-source",
            mirror.Apply(Update("robot-1.Speed", 3.0, Origin, source: SignalSource.Commanded)).RejectionReason);

        Assert.Equal("lower-priority-source",
            mirror.Apply(Update("robot-1.Speed", 4.0, Origin, source: SignalSource.Simulated)).RejectionReason);

        Assert.True(mirror.Apply(Update("robot-1.Speed", 4.0, Origin.AddSeconds(1), source: SignalSource.Simulated)).Accepted);

        Assert.True(mirror.TryGetSample("robot-1.Speed", out var sample));
        Assert.Equal(4.0, sample!.Value);
        Assert.Equal(SignalSource.Simulated, sample.Source);
    }

    [Fact]
    public void Read_time_staleness_marks_old_good_samples_stale_without_mutating_them()
    {
        var clock = new MutableTimeProvider(Origin);
        var mirror = new SignalMirrorStore(clock, defaultStaleAfterMs: 1_000);
        mirror.TryRegister(Definition(staleAfterMs: 1_000), out _);
        mirror.Apply(Update("robot-1.Speed", 1.0, Origin));

        Assert.True(mirror.TryGetSample("robot-1.Speed", Origin.AddMilliseconds(999), out var fresh));
        Assert.Equal(SignalQuality.Good, fresh!.Quality);

        Assert.True(mirror.TryGetSample("robot-1.Speed", Origin.AddMilliseconds(1_001), out var stale));
        Assert.Equal(SignalQuality.Stale, stale!.Quality);

        Assert.True(mirror.TryGetSample("robot-1.Speed", Origin, out var stored));
        Assert.Equal(SignalQuality.Good, stored!.Quality);
        Assert.Equal(1.0, stored.Value);
    }

    [Fact]
    public void Bad_quality_is_preserved_and_never_read_as_stale_or_good()
    {
        var clock = new MutableTimeProvider(Origin);
        var mirror = new SignalMirrorStore(clock, defaultStaleAfterMs: 1_000);
        mirror.TryRegister(Definition(), out _);
        Assert.True(mirror.Apply(Update("robot-1.Speed", 1.0, Origin, quality: SignalQuality.Bad)).Accepted);

        Assert.True(mirror.TryGetSample("robot-1.Speed", Origin.AddHours(1), out var sample));
        Assert.Equal(SignalQuality.Bad, sample!.Quality);
    }

    [Fact]
    public void Snapshot_is_versioned_and_deterministically_ordered()
    {
        var clock = new MutableTimeProvider(Origin);
        var mirror = new SignalMirrorStore(clock);
        mirror.TryRegister(Definition("robot-2.Speed"), out _);
        mirror.TryRegister(Definition("robot-1.Speed"), out _);
        mirror.Apply(Update("robot-2.Speed", 2.0, Origin));
        mirror.Apply(Update("robot-1.Speed", 1.0, Origin));

        var snapshot = mirror.Snapshot();

        Assert.Equal("1.0", snapshot.SchemaVersion);
        Assert.Equal(Origin, snapshot.GeneratedAt);
        Assert.Equal(new[] { "robot-1.Speed", "robot-2.Speed" }, snapshot.Signals.Select(signal => signal.SignalId).ToArray());
    }

    [Fact]
    public void Vocabulary_wire_names_round_trip_and_unknown_values_fall_back()
    {
        Assert.Equal("good", SignalVocabulary.ToWire(SignalQuality.Good));
        Assert.Equal("fault-injection", SignalVocabulary.ToWire(SignalOrigin.FaultInjection));
        Assert.Equal("output-from-controller", SignalVocabulary.ToWire(SignalDirection.OutputFromController));
        Assert.Equal("telemetry-only", SignalVocabulary.ToWire(SignalDirection.TelemetryOnly));
        Assert.Equal("uint", SignalVocabulary.ToWire(SignalDataType.UInt));

        Assert.True(SignalVocabulary.TryParseQuality(" Bad ", out var bad));
        Assert.Equal(SignalQuality.Bad, bad);
        Assert.False(SignalVocabulary.TryParseQuality("excellent", out var unknownQuality));
        Assert.Equal(SignalQuality.Invalid, unknownQuality);
        Assert.False(SignalVocabulary.TryParseSource("", out var unknownSource));
        Assert.Equal(SignalSource.Observed, unknownSource);
    }

    [Fact]
    public void Mirror_sustains_bounded_throughput_with_deterministic_timestamps()
    {
        const int updates = 20_000;
        var clock = new MutableTimeProvider(Origin);
        var mirror = new SignalMirrorStore(clock);
        mirror.TryRegister(Definition(), out _);

        var cpuBefore = Process.GetCurrentProcess().TotalProcessorTime;
        var stopwatch = Stopwatch.StartNew();
        for (var index = 0; index < updates; index++)
        {
            var result = mirror.Apply(Update("robot-1.Speed", (double)index, Origin.AddMilliseconds(index)));
            Assert.True(result.Accepted, result.RejectionReason);
        }

        stopwatch.Stop();
        var cpuAfter = Process.GetCurrentProcess().TotalProcessorTime;
        var perSecond = updates / Math.Max(stopwatch.Elapsed.TotalSeconds, 0.001);
        _output.WriteLine(
            $"{updates} mirror updates applied in {stopwatch.ElapsedMilliseconds} ms ({perSecond:F0} updates/s); " +
            $"process CPU delta {(cpuAfter - cpuBefore).TotalMilliseconds:F0} ms.");

        Assert.Equal(1, mirror.SampleCount);
        Assert.True(mirror.TryGetSample("robot-1.Speed", out var latest));
        Assert.Equal((double)(updates - 1), latest!.Value);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(10), $"20,000 updates took {stopwatch.Elapsed}.");
    }
}
