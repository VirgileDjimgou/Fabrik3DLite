using Fabrik3D.Domain.Organizations;
using Fabrik3D.Domain.Training;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Infrastructure.IntegrationTests;

/// <summary>
/// Persistence-level proof for training sessions and idempotent action ingestion (S44): bounded
/// batches, duplicate-action skipping, tenant isolation and documented indexes.
/// </summary>
[Collection(MongoDbCollection.Name)]
public class TrainingRepositoryTests
{
    private readonly MongoDbFixture _fixture;

    public TrainingRepositoryTests(MongoDbFixture fixture) => _fixture = fixture;

    private static TrainingActionRecord Action(string actionId, long sequence) => new()
    {
        SessionId = string.Empty, // set by the test after the session exists
        ActionId = actionId,
        Role = TrainingActionRole.Observed,
        Type = actionId,
        Sequence = sequence,
    };

    [Fact]
    public async Task Action_ingestion_is_idempotent_by_action_id()
    {
        var ctx = _fixture.CreateContext();
        var tenant = new FixedTenantContext("org-training");
        var sessions = new TrainingSessionRepository(ctx, tenant);
        var actions = new TrainingActionRepository(ctx, tenant);
        await actions.EnsureIndexesAsync();

        var session = new TrainingSession { LearnerSubject = "learner-1", ScenarioId = "pick-and-place" };
        await sessions.CreateAsync(session);

        var first = new[] { Set(Action("a1", 1), session.Id), Set(Action("a2", 2), session.Id) };
        var insert = await actions.InsertBatchAsync(first);
        Assert.Equal(2, insert.Inserted);
        Assert.Equal(0, insert.Duplicates);

        // A reconnecting simulator retries the same batch: nothing is stored twice.
        var retry = await actions.InsertBatchAsync(first);
        Assert.Equal(0, retry.Inserted);
        Assert.Equal(2, retry.Duplicates);
        Assert.Equal(2, await actions.CountBySessionAsync(session.Id));
    }

    [Fact]
    public async Task Sessions_and_actions_are_isolated_between_organizations()
    {
        var ctx = _fixture.CreateContext();
        var orgA = new FixedTenantContext("org-a");
        var orgB = new FixedTenantContext("org-b");
        var sessionsA = new TrainingSessionRepository(ctx, orgA);
        var actionsA = new TrainingActionRepository(ctx, orgA);
        var sessionsB = new TrainingSessionRepository(ctx, orgB);
        var actionsB = new TrainingActionRepository(ctx, orgB);
        await actionsA.EnsureIndexesAsync();

        var session = new TrainingSession { LearnerSubject = "learner-a", ScenarioId = "pallet-processing" };
        await sessionsA.CreateAsync(session);
        await actionsA.InsertBatchAsync([Set(Action("a1", 1), session.Id)]);

        Assert.Null(await sessionsB.GetByIdAsync(session.Id));
        Assert.Empty(await actionsB.GetBySessionAsync(session.Id));

        // A cross-organization write cannot match its scoped optimistic-concurrency filter.
        session.CompletionPercent = 50;
        Assert.False(await sessionsB.UpdateAsync(session));
        Assert.Empty(await sessionsB.QueryAsync(new TrainingSessionQuery(), 50));

        // The owning organization still reads its own data.
        Assert.Single(await sessionsA.QueryAsync(new TrainingSessionQuery(), 50));
        Assert.Single(await actionsA.GetBySessionAsync(session.Id));
    }

    [Fact]
    public async Task Session_query_filters_by_learner_scenario_and_status()
    {
        var ctx = _fixture.CreateContext();
        var tenant = new FixedTenantContext("org-query");
        var sessions = new TrainingSessionRepository(ctx, tenant);

        await sessions.CreateAsync(new TrainingSession
        {
            LearnerSubject = "learner-1",
            ScenarioId = "palette",
            Status = TrainingSessionStatus.Completed,
            Completed = true,
        });
        await sessions.CreateAsync(new TrainingSession
        {
            LearnerSubject = "learner-2",
            ScenarioId = "pick-and-place",
            Status = TrainingSessionStatus.Running,
        });

        var learnerOne = await sessions.QueryAsync(new TrainingSessionQuery(LearnerSubject: "learner-1"), 50);
        Assert.Single(learnerOne);
        Assert.Equal("learner-1", learnerOne[0].LearnerSubject);

        var scenario = await sessions.QueryAsync(new TrainingSessionQuery(ScenarioId: "pick-and-place"), 50);
        Assert.Single(scenario);
        Assert.Equal("learner-2", scenario[0].LearnerSubject);

        var completed = await sessions.QueryAsync(
            new TrainingSessionQuery(Status: TrainingSessionStatus.Completed), 50);
        Assert.Single(completed);
        Assert.Equal("learner-1", completed[0].LearnerSubject);
    }

    [Fact]
    public async Task Training_indexes_are_created_and_idempotent()
    {
        var ctx = _fixture.CreateContext();
        var sessions = new TrainingSessionRepository(ctx);
        var actions = new TrainingActionRepository(ctx);

        await sessions.EnsureIndexesAsync();
        await actions.EnsureIndexesAsync();

        var sessionIndexes = await sessions.ListIndexNamesAsync();
        Assert.Contains("organization_class_learner", sessionIndexes);
        Assert.Contains("organization_scenario_started", sessionIndexes);
        Assert.Contains("organization_status_started", sessionIndexes);

        var actionIndexes = await actions.ListIndexNamesAsync();
        Assert.Contains("session_action_unique", actionIndexes);
        Assert.Contains("session_sequence", actionIndexes);

        // Re-running the initialization is safe and preserves the existing indexes.
        await sessions.EnsureIndexesAsync();
        await actions.EnsureIndexesAsync();
        Assert.Equal(
            sessionIndexes.OrderBy(x => x, StringComparer.Ordinal),
            (await sessions.ListIndexNamesAsync()).OrderBy(x => x, StringComparer.Ordinal));
    }

    private static TrainingActionRecord Set(TrainingActionRecord action, string sessionId)
    {
        action.SessionId = sessionId;
        return action;
    }

    private sealed class FixedTenantContext : ITenantContext
    {
        public FixedTenantContext(string organizationId)
            => Scope = TenantScope.ForOrganization(organizationId, platformAdmin: false);

        public TenantScope? Scope { get; }
    }
}
