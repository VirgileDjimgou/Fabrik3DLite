using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Server.Services;

public class MachineStateService
{
    private readonly MachineStateRepository _states;
    private readonly HubNotificationService _hub;
    private readonly ILogger<MachineStateService> _log;

    public MachineStateService(MachineStateRepository states, HubNotificationService hub, ILogger<MachineStateService> log)
    {
        _states = states;
        _hub = hub;
        _log = log;
    }

    public async Task<MachineStateDto?> GetCurrentAsync()
    {
        var state = await _states.GetCurrentAsync();
        return state?.ToDto();
    }

    /// <summary>
    /// Simulator pushes the current machine state snapshot.
    /// Persists to MongoDB and broadcasts via SignalR.
    /// </summary>
    public async Task<MachineStateDto> UpdateCurrentAsync(UpdateMachineStateRequest request)
    {
        if (!Enum.TryParse<MachineMode>(request.MachineMode, true, out var mode))
            mode = MachineMode.Automatic;
        if (!Enum.TryParse<SimulationStatus>(request.SimulationStatus, true, out var simStatus))
            simStatus = SimulationStatus.Idle;

        var state = new MachineState
        {
            SimulationSessionId = request.SimulationSessionId,
            MachineMode = mode,
            SimulationStatus = simStatus,
            RobotState = request.RobotState,
            CncState = request.CncState,
            CurrentPhase = request.CurrentPhase,
            CurrentPalletId = request.CurrentPalletId,
            CurrentTaskId = request.CurrentTaskId,
            CurrentPartId = request.CurrentPartId,
            CurrentSlotRow = request.CurrentSlotRow,
            CurrentSlotColumn = request.CurrentSlotColumn,
            IsRunning = request.IsRunning,
            IsPaused = request.IsPaused,
            LastUpdatedAtUtc = DateTime.UtcNow,
        };

        await _states.UpsertCurrentAsync(state);

        _log.LogInformation(
            "[Server][MachineState] UpdateCurrent → mode={Mode} sim={SimStatus} robot={Robot} cnc={Cnc} phase={Phase} slot=R{Row}C{Col}",
            state.MachineMode, state.SimulationStatus, state.RobotState, state.CncState,
            state.CurrentPhase, state.CurrentSlotRow, state.CurrentSlotColumn);

        await _hub.MachineStateChangedAsync(new MachineStateChangedEvent(
            state.Id, state.MachineMode.ToString(), state.SimulationStatus.ToString(),
            state.RobotState, state.CncState, state.CurrentPhase,
            state.IsRunning, state.IsPaused, DateTime.UtcNow));

        return state.ToDto();
    }
}
