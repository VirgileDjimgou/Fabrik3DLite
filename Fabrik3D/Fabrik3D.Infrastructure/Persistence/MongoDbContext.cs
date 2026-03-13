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
}
