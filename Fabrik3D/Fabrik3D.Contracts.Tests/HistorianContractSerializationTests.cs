using System.Text.Json;
using Fabrik3D.Contracts.DTOs;

namespace Fabrik3D.Contracts.Tests;

/// <summary>
/// Contract tests for the S40 historian DTOs: stable camelCase wire shape and round-trippable
/// payloads shared by the server, simulator bridge and HMI.
/// </summary>
public class HistorianContractSerializationTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly DateTime Timestamp = new(2026, 2, 3, 4, 5, 6, DateTimeKind.Utc);

    [Fact]
    public void Historian_dtos_use_camel_case_json_properties()
    {
        var contracts = new object[]
        {
            new TelemetrySampleDto("sample-1", "1.0", Timestamp, "session-1", "run-1", "cnc-1", "cnc.spindle.speed",
                1450.5, null, "float", "good", "simulated", "simulation", "corr-1"),
            new IngestTelemetrySampleRequest
            {
                TimestampUtc = Timestamp, SessionId = "session-1", EquipmentId = "cnc-1", SignalId = "cnc.spindle.speed",
                NumericValue = 1450.5, ValueType = "float", Quality = "good", Source = "simulated",
                Origin = "simulation", CorrelationId = "corr-1",
            },
            new IngestTelemetryBatchRequest
            {
                Samples = [new IngestTelemetrySampleRequest { EquipmentId = "cnc-1", SignalId = "s", NumericValue = 1 }],
                SourceId = "sim-1",
            },
            new HistorizedEventDto("event-1", "1.0", Timestamp, "alarm", "session-1", "run-1", "cnc-1", "critical",
                "A001", "{}", "simulation", 7, "corr-1"),
            new IngestHistorizedEventRequest
            {
                TimestampUtc = Timestamp, Kind = "alarm", SessionId = "session-1", EquipmentId = "cnc-1",
                Severity = "critical", Code = "A001", Payload = "{}", Source = "simulation", Sequence = 7,
                CorrelationId = "corr-1",
            },
            new IngestHistorizedEventBatchRequest
            {
                Events = [new IngestHistorizedEventRequest { Kind = "event" }],
                SourceId = "sim-1",
            },
            new HistorianIngestResultDto(3, 3, 0, 0, true, false, "accepted", ["ok"]),
            new HistorianPageDto<TelemetrySampleDto>(
                [new TelemetrySampleDto("sample-1", "1.0", Timestamp, null, null, "cnc-1", "s", 1, null,
                    "float", "good", "simulated", "simulation", null)], 1, 0, 100),
            new HistorianStatusDto(true, true, "1.0", 10, 5, 4096, 2, 7, 200000, 500000, Timestamp, 12,
                [new HistorianSignalPolicyDto("*", "*", "on-change", 1000, 0)]),
        };

        foreach (var contract in contracts)
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(contract, contract.GetType(), Json));
            Assert.Equal(JsonValueKind.Object, document.RootElement.ValueKind);
            Assert.All(document.RootElement.EnumerateObject(), property =>
                Assert.True(char.IsLower(property.Name[0]), $"{contract.GetType().Name}.{property.Name} is not camelCase"));
        }
    }

    [Fact]
    public void Telemetry_sample_dto_round_trips()
    {
        var sample = new TelemetrySampleDto("sample-1", "1.0", Timestamp, "session-1", "run-1", "cnc-1",
            "cnc.spindle.speed", 1450.5, null, "float", "good", "simulated", "simulation", "corr-1");

        var json = JsonSerializer.Serialize(sample, Json);
        var restored = JsonSerializer.Deserialize<TelemetrySampleDto>(json, Json);

        Assert.Equal(sample, restored);
    }

    [Fact]
    public void Historian_page_wrapper_round_trips()
    {
        var page = new HistorianPageDto<HistorizedEventDto>(
            [new HistorizedEventDto("event-1", "1.0", Timestamp, "state-transition", null, null, "robot-1", "info",
                "STATE.MOVING", """{"from":"MOVING"}""", "simulation", 1, null)],
            1, 0, 100);

        var json = JsonSerializer.Serialize(page, Json);
        var restored = JsonSerializer.Deserialize<HistorianPageDto<HistorizedEventDto>>(json, Json);

        Assert.NotNull(restored);
        Assert.Equal(1, restored!.TotalCount);
        Assert.Single(restored.Items);
        Assert.Equal("state-transition", restored.Items[0].Kind);
    }
}
