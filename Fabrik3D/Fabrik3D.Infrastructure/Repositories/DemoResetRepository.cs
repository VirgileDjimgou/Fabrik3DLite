using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Domain.Training;
using Fabrik3D.Infrastructure.Persistence;
using Fabrik3D.Infrastructure.Tenancy;
using MongoDB.Driver;

namespace Fabrik3D.Infrastructure.Repositories;

/// <summary>Bounded counts returned by <see cref="DemoResetRepository.ResetAsync"/>.</summary>
public sealed record DemoResetCounts(
    long Jobs,
    long Tasks,
    long SimulationSessions,
    long Alarms,
    long OperatorMessages,
    long MachineStates,
    long TrainingSessions,
    long TrainingActions,
    long ControlAuthorities,
    long ControlAuthorityEvents);

/// <summary>
/// Persistence for the explicit, bounded public-demo reset (S63). Only simulated demo state is
/// removed. Tenant-scoped collections are always filtered through <see cref="TenantQuery"/>, so a
/// reset can never remove another organization's data. The deployment-wide simulation documents
/// (machine state and control authority) carry no organization id by design and are only reachable
/// because the caller is running in the explicitly enabled demo profile.
/// </summary>
public class DemoResetRepository
{
    private readonly MongoDbContext _ctx;

    public DemoResetRepository(MongoDbContext ctx) => _ctx = ctx;

    /// <summary>
    /// Deletes simulated demo state for the ambient tenant and returns the removed counts. The order
    /// is child-first (tasks before jobs, actions before sessions) so partial failure leaves a
    /// coherent, retryable state; the caller treats a thrown exception as "reset failed, state
    /// unchanged as far as it completed".
    /// </summary>
    public async Task<DemoResetCounts> ResetAsync(TenantScope? scope, CancellationToken ct = default)
    {
        var tasks = await DeleteScopedAsync(_ctx.Tasks, scope, t => t.OrganizationId, ct);
        var jobs = await DeleteScopedAsync(_ctx.Jobs, scope, j => j.OrganizationId, ct);
        var sessions = await DeleteScopedAsync(_ctx.SimulationSessions, scope, s => s.OrganizationId, ct);
        var alarms = await DeleteScopedAsync(_ctx.Alarms, scope, a => a.OrganizationId, ct);
        var messages = await DeleteScopedAsync(_ctx.OperatorMessages, scope, m => m.OrganizationId, ct);
        var trainingActions = await DeleteScopedAsync(_ctx.TrainingActions, scope, a => a.OrganizationId, ct);
        var trainingSessions = await DeleteScopedAsync(_ctx.TrainingSessions, scope, s => s.OrganizationId, ct);

        // Deployment-wide simulated state (no tenant field by design): only reachable in demo mode.
        var machineStates = await _ctx.MachineStates.DeleteManyAsync(FilterDefinition<MachineState>.Empty, ct);
        var authorities = await _ctx.ControlAuthorities.DeleteManyAsync(FilterDefinition<ControlAuthority>.Empty, ct);
        var authorityEvents = await _ctx.ControlAuthorityEvents.DeleteManyAsync(FilterDefinition<ControlAuthorityEvent>.Empty, ct);

        return new DemoResetCounts(
            jobs,
            tasks,
            sessions,
            alarms,
            messages,
            machineStates.DeletedCount,
            trainingSessions,
            trainingActions,
            authorities.DeletedCount,
            authorityEvents.DeletedCount);
    }

    private async Task<long> DeleteScopedAsync<T>(
        IMongoCollection<T> collection,
        TenantScope? scope,
        System.Linq.Expressions.Expression<Func<T, string?>> organizationId,
        CancellationToken ct)
    {
        var result = await collection.DeleteManyAsync(TenantQuery.For(scope, organizationId), ct);
        return result.DeletedCount;
    }
}
