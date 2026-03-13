using Fabrik3D.Server.DTOs;
using Fabrik3D.Server.Mapping;
using Fabrik3D.Server.Repositories;

namespace Fabrik3D.Server.Services;

public class SimulationSessionService
{
    private readonly SimulationSessionRepository _sessions;

    public SimulationSessionService(SimulationSessionRepository sessions)
        => _sessions = sessions;

    public async Task<SimulationSessionDto?> GetByIdAsync(string id)
    {
        var session = await _sessions.GetByIdAsync(id);
        return session?.ToDto();
    }

    public async Task<SimulationSessionDto?> GetByJobIdAsync(string jobId)
    {
        var session = await _sessions.GetByJobIdAsync(jobId);
        return session?.ToDto();
    }
}
