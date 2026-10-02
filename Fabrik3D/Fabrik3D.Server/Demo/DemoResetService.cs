using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Observability;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Demo;

/// <summary>
/// Explicit, bounded, audited public-demo reset (S63). It removes only simulated demo state through
/// <see cref="DemoResetRepository"/> and records the authenticated actor, the tenant scope and the
/// removed counts. It never logs a token, code or secret.
/// </summary>
public sealed class DemoResetService
{
    private readonly DemoResetRepository _repository;
    private readonly ICurrentIdentity _identity;
    private readonly ITenantContext _tenant;
    private readonly ObservabilityMetrics _metrics;
    private readonly ILogger<DemoResetService> _log;

    public DemoResetService(
        DemoResetRepository repository,
        ICurrentIdentity identity,
        ITenantContext tenant,
        ObservabilityMetrics metrics,
        ILogger<DemoResetService> log)
    {
        _repository = repository;
        _identity = identity;
        _tenant = tenant;
        _metrics = metrics;
        _log = log;
    }

    public async Task<DemoResetResultDto> ResetAsync(CancellationToken ct = default)
    {
        var actor = _identity.AuditId;
        var organization = _tenant.OrganizationId;
        try
        {
            var counts = await _repository.ResetAsync(_tenant.Scope, ct);
            _metrics.RecordDemoReset("success");
            // Auditable structured event: identity/tenant and bounded counts only, never token material.
            _log.LogInformation(
                "[Server][Demo] Reset performed actor={Actor} organization={Organization} " +
                "jobs={Jobs} tasks={Tasks} sessions={Sessions} alarms={Alarms} messages={Messages} " +
                "machineStates={MachineStates} trainingSessions={TrainingSessions} trainingActions={TrainingActions} " +
                "authorities={Authorities} authorityEvents={AuthorityEvents}",
                actor, organization, counts.Jobs, counts.Tasks, counts.SimulationSessions, counts.Alarms,
                counts.OperatorMessages, counts.MachineStates, counts.TrainingSessions, counts.TrainingActions,
                counts.ControlAuthorities, counts.ControlAuthorityEvents);

            return new DemoResetResultDto(
                DateTime.UtcNow,
                actor,
                organization,
                new DemoResetCountsDto(
                    (int)counts.Jobs,
                    (int)counts.Tasks,
                    (int)counts.SimulationSessions,
                    (int)counts.Alarms,
                    (int)counts.OperatorMessages,
                    (int)counts.MachineStates,
                    (int)counts.TrainingSessions,
                    (int)counts.TrainingActions,
                    (int)counts.ControlAuthorities,
                    (int)counts.ControlAuthorityEvents));
        }
        catch (Exception ex)
        {
            // Never report success on failure; the HTTP layer turns this into an explicit error.
            _metrics.RecordDemoReset("failure");
            _log.LogError(ex,
                "[Server][Demo] Reset failed actor={Actor} organization={Organization}; the operation is retryable.",
                actor, organization);
            throw;
        }
    }
}
