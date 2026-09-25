namespace Fabrik3D.Contracts.DTOs;

/// <summary>
/// Health and diagnostics for an industrial connector. Additive: it extends the
/// observability surface without changing HealthDto.
/// </summary>
public record ConnectorStatusDto(
    string Connector,
    string State,
    string? Endpoint,
    string? LastError,
    int ReconnectCount,
    int MonitoredItemCount,
    long NotificationsReceived,
    long UpdatesAccepted,
    long UpdatesRejected,
    long WriteAttempts,
    long WritesAccepted,
    long WritesRejected,
    DateTimeOffset TimestampUtc);
