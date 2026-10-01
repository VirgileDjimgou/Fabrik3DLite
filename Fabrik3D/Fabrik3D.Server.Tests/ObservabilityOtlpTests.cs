using Fabrik3D.Server.Observability;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// OTLP export stays off unless explicitly enabled with a valid absolute endpoint.
/// </summary>
public class ObservabilityOtlpTests
{
    [Fact]
    public void External_export_is_disabled_by_default()
    {
        Assert.False(ObservabilityOtlp.IsEnabled(new Fabrik3DObservabilityOptions()));
    }

    [Fact]
    public void Otlp_requires_the_otlp_exporter_an_enabled_master_switch_and_an_absolute_endpoint()
    {
        var options = new Fabrik3DObservabilityOptions
        {
            Exporter = Fabrik3DObservabilityOptions.Exporters.Otlp,
            OtlpEndpoint = "http://collector.internal:4317",
        };
        Assert.True(ObservabilityOtlp.IsEnabled(options));
        Assert.Equal(new Uri("http://collector.internal:4317"), ObservabilityOtlp.ResolveEndpoint(options));

        options.OtlpEndpoint = "not-an-absolute-uri";
        Assert.False(ObservabilityOtlp.IsEnabled(options));

        options.OtlpEndpoint = "http://collector.internal:4317";
        options.Enabled = false;
        Assert.False(ObservabilityOtlp.IsEnabled(options));

        options.Enabled = true;
        options.Exporter = Fabrik3DObservabilityOptions.Exporters.Console;
        Assert.False(ObservabilityOtlp.IsEnabled(options));
    }
}
