using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Settings;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Signals;

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
        services.AddSingleton<CellTemplateRepository>();
        services.AddSingleton<ControlAuthorityRepository>();
        services.Configure<HistorianOptions>(configuration.GetSection(HistorianOptions.SectionName));
        services.AddSingleton<HistorianRepository>();
        // ── Tenancy (S43) ──────────────────────────────────────────────
        services.AddSingleton<OrganizationRepository>();
        services.AddSingleton<MembershipRepository>();
        services.AddSingleton<TrainingClassRepository>();
        services.AddSingleton<TrainingResourceRepository>();
        // Training sessions and deterministic assessment (S44)
        services.AddSingleton<TrainingSessionRepository>();
        services.AddSingleton<TrainingActionRepository>();
        services.AddSingleton<Tenancy.TenantMigrationService>();
        services.AddSingleton<Tenancy.TenantIndexInitializer>();
        services.Configure<OpcUaOptions>(configuration.GetSection(OpcUaOptions.SectionName));
        services.AddSingleton<SignalMirrorStore>();
        services.AddSingleton<OpcUaConnector>();
        services.Configure<MqttOptions>(configuration.GetSection(MqttOptions.SectionName));
        services.AddSingleton<MqttConnector>();
        services.AddSingleton<TimeProvider>(TimeProvider.System);
        services.Configure<ModbusOptions>(configuration.GetSection(ModbusOptions.SectionName));
        services.AddSingleton<ModbusConnector>();

        return services;
    }
}
