using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Historian;

/// <summary>Read query for telemetry samples. All filters are optional and combined with AND.</summary>
public sealed record TelemetrySampleQuery(
    string? SessionId = null,
    string? EquipmentId = null,
    string? SignalId = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    SignalQuality? Quality = null,
    SignalSource? Source = null,
    string? CorrelationId = null,
    int Skip = 0,
    int Limit = 100);

/// <summary>Read query for historized events. All filters are optional and combined with AND.</summary>
public sealed record HistorizedEventQuery(
    string? SessionId = null,
    string? EquipmentId = null,
    HistorianEventKind? Kind = null,
    string? Severity = null,
    string? Code = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    string? CorrelationId = null,
    int Skip = 0,
    int Limit = 100);

/// <summary>
/// Builds deterministic MongoDB filters and page windows for historian queries. Read-only by
/// construction: there is no command or write path from a query.
/// </summary>
public static class HistorianQueryBuilder
{
    public static FilterDefinition<TelemetrySample> BuildTelemetryFilter(TelemetrySampleQuery query)
    {
        var filters = new List<FilterDefinition<TelemetrySample>>();
        if (!string.IsNullOrWhiteSpace(query.SessionId))
            filters.Add(Builders<TelemetrySample>.Filter.Eq(s => s.SessionId, query.SessionId));
        if (!string.IsNullOrWhiteSpace(query.EquipmentId))
            filters.Add(Builders<TelemetrySample>.Filter.Eq(s => s.EquipmentId, query.EquipmentId));
        if (!string.IsNullOrWhiteSpace(query.SignalId))
            filters.Add(Builders<TelemetrySample>.Filter.Eq(s => s.SignalId, query.SignalId));
        if (query.FromUtc is not null)
            filters.Add(Builders<TelemetrySample>.Filter.Gte(s => s.TimestampUtc, query.FromUtc.Value));
        if (query.ToUtc is not null)
            filters.Add(Builders<TelemetrySample>.Filter.Lte(s => s.TimestampUtc, query.ToUtc.Value));
        if (query.Quality is not null)
            filters.Add(Builders<TelemetrySample>.Filter.Eq(s => s.Quality, query.Quality.Value));
        if (query.Source is not null)
            filters.Add(Builders<TelemetrySample>.Filter.Eq(s => s.Source, query.Source.Value));
        if (!string.IsNullOrWhiteSpace(query.CorrelationId))
            filters.Add(Builders<TelemetrySample>.Filter.Eq(s => s.CorrelationId, query.CorrelationId));

        return filters.Count == 0
            ? Builders<TelemetrySample>.Filter.Empty
            : Builders<TelemetrySample>.Filter.And(filters);
    }

    public static FilterDefinition<HistorizedEvent> BuildEventFilter(HistorizedEventQuery query)
    {
        var filters = new List<FilterDefinition<HistorizedEvent>>();
        if (!string.IsNullOrWhiteSpace(query.SessionId))
            filters.Add(Builders<HistorizedEvent>.Filter.Eq(e => e.SessionId, query.SessionId));
        if (!string.IsNullOrWhiteSpace(query.EquipmentId))
            filters.Add(Builders<HistorizedEvent>.Filter.Eq(e => e.EquipmentId, query.EquipmentId));
        if (query.Kind is not null)
            filters.Add(Builders<HistorizedEvent>.Filter.Eq(e => e.Kind, query.Kind.Value));
        if (!string.IsNullOrWhiteSpace(query.Severity))
            filters.Add(Builders<HistorizedEvent>.Filter.Eq(e => e.Severity, query.Severity));
        if (!string.IsNullOrWhiteSpace(query.Code))
            filters.Add(Builders<HistorizedEvent>.Filter.Eq(e => e.Code, query.Code));
        if (query.FromUtc is not null)
            filters.Add(Builders<HistorizedEvent>.Filter.Gte(e => e.TimestampUtc, query.FromUtc.Value));
        if (query.ToUtc is not null)
            filters.Add(Builders<HistorizedEvent>.Filter.Lte(e => e.TimestampUtc, query.ToUtc.Value));
        if (!string.IsNullOrWhiteSpace(query.CorrelationId))
            filters.Add(Builders<HistorizedEvent>.Filter.Eq(e => e.CorrelationId, query.CorrelationId));

        return filters.Count == 0
            ? Builders<HistorizedEvent>.Filter.Empty
            : Builders<HistorizedEvent>.Filter.And(filters);
    }

    /// <summary>Clamps a page window to documented bounds; deterministic and never negative.</summary>
    public static (int Skip, int Limit) NormalizePage(int skip, int limit, int maxPageSize)
    {
        var bounded = Math.Clamp(limit, 1, Math.Max(1, maxPageSize));
        return (Math.Max(0, skip), bounded);
    }
}
