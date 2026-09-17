using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Events;

namespace Fabrik3D.Contracts.Tests;

public class TransportContractSerializationTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly DateTime Timestamp = new(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);

    [Fact]
    public void Rest_dtos_use_camel_case_json_properties()
    {
        var contracts = new object[]
        {
            new JobDto("job-1", "Job", "Description", "Running", "Automatic", Timestamp, Timestamp, null, null, null, null, 0, 0, null, new(), 1),
            new TaskDto("task-1", "job-1", "Task", "Description", "Pending", 0, "hex-billet", null, 0, 0, Timestamp, Timestamp, null, null, null, 1),
            new SimulationSessionDto("session-1", "job-1", "Running", Timestamp, null, false, "PICK", null, null, null, 0, 1, 1, Timestamp, "sim-1", "corr-1", 1),
            new AlarmDto("alarm-1", "A001", "Alarm", "Message", "Warning", "Simulator", null, null, Timestamp, false, null, null),
            new OperatorMessageDto("message-1", "Title", "Message", "Info", "Server", null, null, Timestamp, false, null),
            new MachineStateDto("machine-1", null, "Automatic", "Running", "Moving", "Idle", "PICK", null, null, null, 0, 0, true, false, Timestamp),
            new HealthDto("Healthy", Timestamp, "1.0.0"),
            new ApiErrorDto("not_found", "Not found", 404),
            new CreateJobRequest { Name = "Job", Description = "Description", MachineMode = "Automatic" },
            new CreateTaskRequest { Name = "Task", Description = "Description", PartType = "hex-billet", PalletId = "pallet-1" },
            new UpdateMachineStateRequest { MachineMode = "Automatic", SimulationStatus = "Running", RobotState = "Moving", SimulatorId = "sim-1" },
            new UpdateSimulationStateRequest { Status = "Running", CurrentPhase = "PICK", TotalCount = 1, SimulatorId = "sim-1", CorrelationId = "corr-1" },
            new ClaimJobRequest { SimulatorId = "sim-1", CorrelationId = "corr-1" },
            new UpdateTaskStatusRequest { Status = "Running", SimulationSessionId = "session-1", SimulatorId = "sim-1" },
            new HeartbeatRequest { SimulatorId = "sim-1" },
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
    public void SignalR_events_have_stable_camel_case_payloads()
    {
        var events = new object[]
        {
            new JobStateChangedEvent("job-1", "Created", "Running", Timestamp, "corr-1"),
            new SimulationStateChangedEvent("session-1", "job-1", "Running", "PICK", 0, 1, 1, Timestamp, "corr-1"),
            new TaskStateChangedEvent("task-1", "job-1", "Pending", "Running", Timestamp, "corr-1"),
            new AlarmRaisedEvent("alarm-1", "A001", "Alarm", "Message", "Warning", "Simulator", Timestamp),
            new AlarmAcknowledgedEvent("alarm-1", "operator", Timestamp),
            new OperatorMessageEvent("message-1", "Title", "Message", "Info", "Server", Timestamp),
            new MachineStateChangedEvent("machine-1", "Automatic", "Running", "Moving", "Idle", "PICK", true, false, Timestamp),
        };

        foreach (var @event in events)
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(@event, @event.GetType(), Json));
            Assert.True(document.RootElement.TryGetProperty("timestampUtc", out _));
        }
    }
}
