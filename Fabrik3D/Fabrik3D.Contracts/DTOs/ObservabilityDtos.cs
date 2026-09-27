namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Optional, additive simulator performance report (S49). The simulator may push a frame-time and
/// render-metric sample to the local metrics endpoint when observability is enabled; it is never
/// required and never carries machine or user-identifying data.
/// </summary>
public record SimulatorMetricsDto(
    string SourceId,
    double FrameTimeMs,
    long DrawCalls,
    int Triangles,
    long TextureBytes,
    long HeapUsedBytes,
    DateTime Timestamp);

/// <summary>Read-only observability configuration/status (S49). Never exposes endpoints or secrets.</summary>
public record ObservabilityStatusDto(
    bool Enabled,
    bool MetricsEndpointEnabled,
    string Exporter,
    string? OtlpEndpoint,
    string ServiceName,
    int SeriesCount,
    long DroppedSeries);
