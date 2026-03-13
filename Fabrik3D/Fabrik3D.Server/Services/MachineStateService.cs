using Fabrik3D.Server.DTOs;
using Fabrik3D.Server.Mapping;
using Fabrik3D.Server.Models.Entities;
using Fabrik3D.Server.Repositories;

namespace Fabrik3D.Server.Services;

public class MachineStateService
{
    private readonly MachineStateRepository _states;

    public MachineStateService(MachineStateRepository states) => _states = states;

    public async Task<MachineStateDto?> GetCurrentAsync()
    {
        var state = await _states.GetCurrentAsync();
        return state?.ToDto();
    }

    public async Task<MachineStateDto> UpsertAsync(MachineState state)
    {
        state.LastUpdatedAtUtc = DateTime.UtcNow;
        await _states.UpsertAsync(state);
        return state.ToDto();
    }
}
