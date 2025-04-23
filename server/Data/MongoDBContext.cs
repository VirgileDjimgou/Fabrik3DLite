using Fabrik3D_Lite.Models;
using Fabrik3D_Lite.server.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;

namespace Fabrik3D_Lite.Data
{
    public class MongoDBContext
    {
        private readonly IMongoDatabase _database;

        public MongoDBContext(string connectionString, string databaseName)
        {
            var client = new MongoClient(connectionString);
            _database = client.GetDatabase(databaseName);
        }

        public IMongoDatabase Database => _database;

        public IMongoCollection<CNCModel> CNCModels => _database.GetCollection<CNCModel>("CNCModels");
        public IMongoCollection<RobotModel> RobotModels => _database.GetCollection<RobotModel>("RobotModels");
        public IMongoCollection<MQTTMessage> MQTTMessages => _database.GetCollection<MQTTMessage>("MQTTMessages");
    }
}