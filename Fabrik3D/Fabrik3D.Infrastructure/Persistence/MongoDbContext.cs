using Fabrik3D.Domain.Entities;
using Fabrik3D.Infrastructure.Settings;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Persistence;

public class MongoDbContext
{
    private readonly IMongoDatabase _database;

    public MongoDbContext(IOptions<MongoDbSettings> settings)
    {
        var client = new MongoClient(settings.Value.ConnectionString);
        _database = client.GetDatabase(settings.Value.DatabaseName);
    }

    public IMongoCollection<Job> Jobs => _database.GetCollection<Job>("jobs");
    public IMongoCollection<MachiningTask> Tasks => _database.GetCollection<MachiningTask>("tasks");
    public IMongoCollection<SimulationSession> SimulationSessions => _database.GetCollection<SimulationSession>("simulationSessions");
    public IMongoCollection<Alarm> Alarms => _database.GetCollection<Alarm>("alarms");
    public IMongoCollection<OperatorMessage> OperatorMessages => _database.GetCollection<OperatorMessage>("operatorMessages");
    public IMongoCollection<MachineState> MachineStates => _database.GetCollection<MachineState>("machineStates");
    public IMongoCollection<CellTemplate> CellTemplates => _database.GetCollection<CellTemplate>("cellTemplates");

    /// <summary>One authority document per equipment/actuator scope (S36).</summary>
    public IMongoCollection<ControlAuthority> ControlAuthorities => _database.GetCollection<ControlAuthority>("controlAuthorities");

    /// <summary>Append-only control-authority audit trail.</summary>
    public IMongoCollection<ControlAuthorityEvent> ControlAuthorityEvents => _database.GetCollection<ControlAuthorityEvent>("controlAuthorityEvents");

    /// <summary>Bounded telemetry history (S40).</summary>
    public IMongoCollection<TelemetrySample> TelemetrySamples =>
        _database.GetCollection<TelemetrySample>(Fabrik3D.Domain.Historian.HistorianSchema.TelemetrySampleCollection);

    /// <summary>Bounded event/command/alarm history (S40).</summary>
    public IMongoCollection<HistorizedEvent> HistorizedEvents =>
        _database.GetCollection<HistorizedEvent>(Fabrik3D.Domain.Historian.HistorianSchema.HistorizedEventCollection);
}
