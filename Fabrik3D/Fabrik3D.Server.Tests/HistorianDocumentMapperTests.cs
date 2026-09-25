using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Server.Services;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Unit tests for historian schema validation and DTO/document mapping (S40). No IO: these are the
/// rules that decide what may be stored and what must be rejected with a diagnostic.
/// </summary>
public class HistorianDocumentMapperTests
{
    private static readonly DateTime Now = new(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);

    private static IngestTelemetrySampleRequest Sample() => new()
    {
        TimestampUtc = Now.AddSeconds(-5),
        SessionId = "session-1",
        RunId = "run-1",
        EquipmentId = "cnc-1",
        SignalId = "cnc.spindle.speed",
        NumericValue = 1450.5,
        ValueType = "float",
        Quality = "good",
        Source = "simulated",
        Origin = "simulation",
        CorrelationId = "corr-1",
    };

    [Fact]
    public void A_well_formed_sample_maps_with_source_quality_timestamp_and_correlation()
    {
        var mapped = HistorianDocumentMapper.TryMapSample(Sample(), Now, out var document, out var error);

        Assert.True(mapped, error);
        Assert.NotNull(document);
        Assert.Equal(HistorianSchema.Version, document!.SchemaVersion);
        Assert.Equal("cnc-1", document.EquipmentId);
        Assert.Equal(1450.5, document.NumericValue);
        Assert.Equal(SignalQuality.Good, document.Quality);
        Assert.Equal(SignalSource.Simulated, document.Source);
        Assert.Equal(SignalOrigin.Simulation, document.Origin);
        Assert.Equal("corr-1", document.CorrelationId);
        Assert.Equal("session-1", document.SessionId);
    }

    [Fact]
    public void An_unspecified_timestamp_is_read_as_utc()
    {
        var request = Sample() with { TimestampUtc = new DateTime(2026, 6, 1, 11, 0, 0, DateTimeKind.Unspecified) };

        Assert.True(HistorianDocumentMapper.TryMapSample(request, Now, out var document, out _));
        Assert.Equal(DateTimeKind.Utc, document!.TimestampUtc.Kind);
        Assert.Equal(new DateTime(2026, 6, 1, 11, 0, 0, DateTimeKind.Utc), document.TimestampUtc);
    }

    [Theory]
    [InlineData("", "signal")]
    [InlineData("cnc", "")]
    public void Missing_identity_fields_are_rejected(string equipmentId, string signalId)
    {
        var request = Sample() with { EquipmentId = equipmentId, SignalId = signalId };

        Assert.False(HistorianDocumentMapper.TryMapSample(request, Now, out var document, out var error));
        Assert.Null(document);
        Assert.Contains("required", error);
    }

    [Theory]
    [InlineData("weird-quality", "quality")]
    [InlineData("weird-source", "source")]
    [InlineData("weird-origin", "origin")]
    [InlineData("weird-type", "valueType")]
    public void Unknown_vocabulary_values_are_rejected(string value, string field)
    {
        var request = field switch
        {
            "quality" => Sample() with { Quality = value },
            "source" => Sample() with { Source = value },
            "origin" => Sample() with { Origin = value },
            _ => Sample() with { ValueType = value },
        };

        Assert.False(HistorianDocumentMapper.TryMapSample(request, Now, out _, out var error));
        Assert.Contains(field, error);
    }

    [Fact]
    public void String_values_require_text_and_numeric_values_require_a_number()
    {
        var stringRequest = Sample() with { ValueType = "string", NumericValue = null, TextValue = null };
        var floatRequest = Sample() with { ValueType = "float", NumericValue = null };

        Assert.False(HistorianDocumentMapper.TryMapSample(stringRequest, Now, out _, out var stringError));
        Assert.Contains("textValue", stringError);
        Assert.False(HistorianDocumentMapper.TryMapSample(floatRequest, Now, out _, out var floatError));
        Assert.Contains("numericValue", floatError);

        var mappedString = Sample() with { ValueType = "string", NumericValue = null, TextValue = "RUNNING" };
        Assert.True(HistorianDocumentMapper.TryMapSample(mappedString, Now, out var document, out _));
        Assert.Equal("RUNNING", document!.TextValue);
        Assert.Equal(SignalDataType.String, document.ValueType);
    }

    [Fact]
    public void Implausible_timestamps_are_rejected()
    {
        var tooOld = Sample() with { TimestampUtc = new DateTime(1999, 12, 31, 0, 0, 0, DateTimeKind.Utc) };
        var tooNew = Sample() with { TimestampUtc = Now.AddDays(2) };

        Assert.False(HistorianDocumentMapper.TryMapSample(tooOld, Now, out _, out var oldError));
        Assert.Contains("implausible", oldError);
        Assert.False(HistorianDocumentMapper.TryMapSample(tooNew, Now, out _, out var newError));
        Assert.Contains("implausible", newError);
    }

    private static IngestHistorizedEventRequest Event() => new()
    {
        TimestampUtc = Now.AddSeconds(-1),
        Kind = "state-transition",
        SessionId = "session-1",
        EquipmentId = "robot-1",
        Severity = "warning",
        Code = "ROBOT.DWELL",
        Payload = """{"from":"MOVING","to":"WAITING"}""",
        Source = "simulation",
        Sequence = 7,
        CorrelationId = "corr-2",
    };

    [Fact]
    public void A_well_formed_event_maps_kind_severity_and_payload()
    {
        Assert.True(HistorianDocumentMapper.TryMapEvent(Event(), 4096, Now, out var document, out var error));

        Assert.NotNull(document);
        Assert.Equal(HistorianEventKind.StateTransition, document!.Kind);
        Assert.Equal("warning", document.Severity);
        Assert.Equal("ROBOT.DWELL", document.Code);
        Assert.Equal(7, document.Sequence);
        Assert.Equal("corr-2", document.CorrelationId);
    }

    [Theory]
    [InlineData("not-a-kind", "kind")]
    [InlineData("", "info")]
    public void Unknown_event_kind_or_severity_is_rejected(string kind, string severity)
    {
        var request = Event() with { Kind = kind, Severity = severity };

        Assert.False(HistorianDocumentMapper.TryMapEvent(request, 4096, Now, out _, out var error));
        Assert.NotNull(error);
    }

    [Fact]
    public void Oversized_and_malformed_payloads_are_rejected()
    {
        var malformed = Event() with { Payload = "{ not json" };
        var oversized = Event() with { Payload = "{\"data\":\"" + new string('x', 5000) + "\"}" };

        Assert.False(HistorianDocumentMapper.TryMapEvent(malformed, 4096, Now, out _, out var malformedError));
        Assert.Contains("valid JSON", malformedError);
        Assert.False(HistorianDocumentMapper.TryMapEvent(oversized, 4096, Now, out _, out var oversizedError));
        Assert.Contains("exceeds", oversizedError);
    }

    [Fact]
    public void A_blank_payload_defaults_to_an_empty_object()
    {
        Assert.True(HistorianDocumentMapper.TryMapEvent(Event() with { Payload = "" }, 4096, Now, out var document, out _));
        Assert.Equal("{}", document!.Payload);
    }

    [Fact]
    public void Historian_vocabulary_maps_timeline_kinds()
    {
        Assert.Equal(HistorianEventKind.Command, HistorianVocabulary.FromTimelineKind("command"));
        Assert.Equal(HistorianEventKind.StateTransition, HistorianVocabulary.FromTimelineKind("state-transition"));
        Assert.Equal(HistorianEventKind.Alarm, HistorianVocabulary.FromTimelineKind("alarm"));
        Assert.Equal(HistorianEventKind.Acknowledgement, HistorianVocabulary.FromTimelineKind("acknowledgement"));
        Assert.Equal(HistorianEventKind.Fault, HistorianVocabulary.FromTimelineKind("fault-action"));
        Assert.Equal(HistorianEventKind.Event, HistorianVocabulary.FromTimelineKind("telemetry"));
        Assert.Equal(HistorianEventKind.Event, HistorianVocabulary.FromTimelineKind("unknown"));
    }
}
