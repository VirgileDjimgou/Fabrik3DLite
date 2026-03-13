using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Settings;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fabrik3D.Infrastructure;

public static class InfrastructureServiceRegistration
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<MongoDbSettings>(
            configuration.GetSection(MongoDbSettings.SectionName));

        services.AddSingleton<MongoDbContext>();

        services.AddSingleton<JobRepository>();
        services.AddSingleton<TaskRepository>();
        services.AddSingleton<SimulationSessionRepository>();
        services.AddSingleton<AlarmRepository>();
        services.AddSingleton<OperatorMessageRepository>();
        services.AddSingleton<MachineStateRepository>();

        return services;
    }
}
