using System.Diagnostics;
using Fabrik3D.Server.Observability;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit.Abstractions;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S49 recorded measurement for the metric-recording hot path. Instrumentation runs on every request
/// and every connector/signal event, so it must add microseconds, not milliseconds. The bound is a
/// generous regression guard; the measured rate is reported for evidence.
/// </summary>
public class ObservabilityPerformanceTests
{
    private readonly ITestOutputHelper _output;

    public ObservabilityPerformanceTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public void Recording_200k_signal_updates_stays_within_the_budget()
    {
        var metrics = new ObservabilityMetrics(
            Options.Create(new Fabrik3DObservabilityOptions()),
            NullLogger<ObservabilityMetrics>.Instance);

        const int iterations = 200_000;
        var stopwatch = Stopwatch.StartNew();
        for (var index = 0; index < iterations; index++)
        {
            metrics.RecordSignalUpdate(1);
        }

        stopwatch.Stop();

        var updatesPerSecond = iterations / stopwatch.Elapsed.TotalSeconds;
        _output.WriteLine(
            "[observability] {0} signal updates in {1:0.0} ms ({2:0} updates/s)",
            iterations, stopwatch.Elapsed.TotalMilliseconds, updatesPerSecond);

        Assert.Equal(iterations, metrics.Snapshot().Single(s => s.Name == "fabrik3d.signal.updates").Value);
        Assert.True(stopwatch.Elapsed.TotalMilliseconds < 5000,
            $"Recording {iterations} updates took {stopwatch.Elapsed.TotalMilliseconds:0.0} ms");
    }

    [Fact]
    public void Recording_200k_api_requests_stays_within_the_budget()
    {
        var metrics = new ObservabilityMetrics(
            Options.Create(new Fabrik3DObservabilityOptions()),
            NullLogger<ObservabilityMetrics>.Instance);

        const int iterations = 200_000;
        var stopwatch = Stopwatch.StartNew();
        for (var index = 0; index < iterations; index++)
        {
            metrics.RecordApiRequest("GET", "/api/jobs/{id}", 200, 1.5);
        }

        stopwatch.Stop();

        _output.WriteLine(
            "[observability] {0} api request records in {1:0.0} ms ({2:0} records/s)",
            iterations, stopwatch.Elapsed.TotalMilliseconds, iterations / stopwatch.Elapsed.TotalSeconds);

        Assert.True(stopwatch.Elapsed.TotalMilliseconds < 5000,
            $"Recording {iterations} requests took {stopwatch.Elapsed.TotalMilliseconds:0.0} ms");
    }
}
