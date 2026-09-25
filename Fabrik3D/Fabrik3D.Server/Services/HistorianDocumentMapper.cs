using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Validation and mapping between historian transport DTOs and versioned documents (S40).
/// Pure and deterministic; never touches IO so it is directly unit-testable.
/// </summary>
public static class HistorianDocumentMapper
{
    /// <summary>Earliest accepted timestamp. Older data is rejected as implausible rather than silently stored.</summary>
    public static readonly DateTime EarliestAcceptedUtc = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static bool TryMapSample(
        IngestTelemetrySampleRequest request,
        DateTime nowUtc,
        out TelemetrySample? sample,
        out string? error)
    {
        sample = null;
        error = null;

        if (string.IsNullOrWhiteSpace(request.EquipmentId))
        {
            error = "equipmentId is required";
            return false;
        }

        if (string.IsNullOrWhiteSpace(request.SignalId))
        {
            error = "signalId is required";
            return false;
        }

        if (!TryNormalizeTimestamp(request.TimestampUtc, nowUtc, out var timestamp))
        {
            error = $"timestampUtc '{request.TimestampUtc:o}' is implausible";
            return false;
        }

        if (!SignalVocabulary.TryParseDataType(request.ValueType, out var dataType))
        {
            error = $"valueType '{request.ValueType}' is not a known signal data type";
            return false;
        }

        if (!SignalVocabulary.TryParseQuality(request.Quality, out var quality))
        {
            error = $"quality '{request.Quality}' is not a known quality";
            return false;
        }

        if (!SignalVocabulary.TryParseSource(request.Source, out var source))
        {
            error = $"source '{request.Source}' is not a known source";
            return false;
        }

        if (!SignalVocabulary.TryParseOrigin(request.Origin, out var origin))
        {
            error = $"origin '{request.Origin}' is not a known origin";
            return false;
        }

        double? numeric = null;
        string? text = null;
        if (dataType == SignalDataType.String)
        {
            if (string.IsNullOrEmpty(request.TextValue) && request.NumericValue is null)
            {
                error = "a string value requires textValue";
                return false;
            }
            text = request.TextValue;
        }
        else
        {
            if (request.NumericValue is null)
            {
                error = $"valueType '{request.ValueType}' requires numericValue";
                return false;
            }
            numeric = request.NumericValue;
        }

        sample = new TelemetrySample
        {
            TimestampUtc = timestamp,
            SessionId = NullIfBlank(request.SessionId),
            RunId = NullIfBlank(request.RunId),
            EquipmentId = request.EquipmentId.Trim(),
            SignalId = request.SignalId.Trim(),
            NumericValue = numeric,
            TextValue = text,
            ValueType = dataType,
            Quality = quality,
            Source = source,
            Origin = origin,
            CorrelationId = NullIfBlank(request.CorrelationId),
        };
        return true;
    }

    public static bool TryMapEvent(
        IngestHistorizedEventRequest request,
        int maxPayloadLength,
        DateTime nowUtc,
        out HistorizedEvent? historizedEvent,
        out string? error)
    {
        historizedEvent = null;
        error = null;

        if (!TryNormalizeTimestamp(request.TimestampUtc, nowUtc, out var timestamp))
        {
            error = $"timestampUtc '{request.TimestampUtc:o}' is implausible";
            return false;
        }

        if (!HistorianVocabulary.TryParseKind(request.Kind, out var kind))
        {
            error = $"kind '{request.Kind}' is not a known historian event kind";
            return false;
        }

        var severity = request.Severity?.Trim().ToLowerInvariant() ?? "info";
        if (!HistorianVocabulary.IsKnownSeverity(severity))
        {
            error = $"severity '{request.Severity}' is not info/warning/error/critical";
            return false;
        }

        var payload = string.IsNullOrWhiteSpace(request.Payload) ? "{}" : request.Payload;
        if (payload.Length > maxPayloadLength)
        {
            error = $"payload length {payload.Length} exceeds the bound of {maxPayloadLength}";
            return false;
        }

        if (!IsBoundedJson(payload))
        {
            error = "payload must be a valid JSON object or array";
            return false;
        }

        historizedEvent = new HistorizedEvent
        {
            TimestampUtc = timestamp,
            Kind = kind,
            SessionId = NullIfBlank(request.SessionId),
            RunId = NullIfBlank(request.RunId),
            EquipmentId = NullIfBlank(request.EquipmentId),
            Severity = severity,
            Code = request.Code?.Trim() ?? string.Empty,
            Payload = payload,
            Source = string.IsNullOrWhiteSpace(request.Source) ? "simulation" : request.Source.Trim(),
            Sequence = request.Sequence,
            CorrelationId = NullIfBlank(request.CorrelationId),
        };
        return true;
    }

    public static TelemetrySampleDto ToDto(TelemetrySample sample) => new(
        sample.Id,
        sample.SchemaVersion,
        sample.TimestampUtc,
        sample.SessionId,
        sample.RunId,
        sample.EquipmentId,
        sample.SignalId,
        sample.NumericValue,
        sample.TextValue,
        SignalVocabulary.ToWire(sample.ValueType),
        SignalVocabulary.ToWire(sample.Quality),
        SignalVocabulary.ToWire(sample.Source),
        SignalVocabulary.ToWire(sample.Origin),
        sample.CorrelationId);

    public static HistorizedEventDto ToDto(HistorizedEvent historizedEvent) => new(
        historizedEvent.Id,
        historizedEvent.SchemaVersion,
        historizedEvent.TimestampUtc,
        HistorianVocabulary.ToWire(historizedEvent.Kind),
        historizedEvent.SessionId,
        historizedEvent.RunId,
        historizedEvent.EquipmentId,
        historizedEvent.Severity,
        historizedEvent.Code,
        historizedEvent.Payload,
        historizedEvent.Source,
        historizedEvent.Sequence,
        historizedEvent.CorrelationId);

    /// <summary>
    /// Accepts forward-dated samples within one day (clock skew) but rejects implausible or
    /// pre-2000 timestamps so corrupted input cannot skew queries.
    /// </summary>
    public static bool TryNormalizeTimestamp(DateTime value, DateTime nowUtc, out DateTime timestampUtc)
    {
        timestampUtc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };

        if (timestampUtc < EarliestAcceptedUtc) return false;
        if (timestampUtc > nowUtc.AddDays(1)) return false;
        return true;
    }

    private static bool IsBoundedJson(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
