using Fabrik3D.Infrastructure.Observability;
using OpenTelemetry;
using OpenTelemetry.Exporter;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Fabrik3D.Server.Observability;

/// <summary>
/// Wires the standard OpenTelemetry OTLP exporter to the Fabrik3D activity source and meter (S49
/// instrumentation) when <c>Observability:Exporter=Otlp</c> and an absolute
/// <c>Observability:OtlpEndpoint</c> are configured. Disabled by default: an on-prem install never
/// needs a collector.
/// </summary>
public static class ObservabilityOtlp
{
    public static bool IsEnabled(Fabrik3DObservabilityOptions options) =>
        options.ResolveEnabled()
        && string.Equals(
            options.NormalizedExporter(),
            Fabrik3DObservabilityOptions.Exporters.Otlp,
            StringComparison.Ordinal)
        && ResolveEndpoint(options) is not null;

    public static Uri? ResolveEndpoint(Fabrik3DObservabilityOptions options) =>
        Uri.TryCreate(options.OtlpEndpoint, UriKind.Absolute, out var endpoint) ? endpoint : null;

    public static IServiceCollection AddFabrik3DOtlpExporter(
        this IServiceCollection services,
        Fabrik3DObservabilityOptions options)
    {
        if (!IsEnabled(options))
        {
            return services;
        }

        var endpoint = ResolveEndpoint(options)!;
        services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(
                Fabrik3DTelemetry.ServiceName,
                serviceVersion: Fabrik3DTelemetry.ServiceVersion))
            .WithTracing(tracing => tracing.AddSource(Fabrik3DTelemetry.ActivitySource.Name))
            .WithMetrics(metrics => metrics.AddMeter(Fabrik3DTelemetry.Meter.Name))
            .UseOtlpExporter(OtlpExportProtocol.Grpc, endpoint);
        return services;
    }
}
