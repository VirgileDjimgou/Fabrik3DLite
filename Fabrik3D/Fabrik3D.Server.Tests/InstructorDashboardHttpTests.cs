using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Domain.Training;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// HTTP coverage for the S45 instructor dashboard: server-side aggregates over tenant-scoped training
/// evidence, the authorization matrix, and the audited non-destructive restart flow.
/// </summary>
[Collection(AuthServerCollection.Name)]
public class InstructorDashboardHttpTests
{
    private readonly AuthServerFixture _fx;

    public InstructorDashboardHttpTests(AuthServerFixture fx) => _fx = fx;

    private static ReportedTrainingAction Action(
        string actionId,
        string type,
        long sequence,
        bool fault = false,
        bool hint = false,
        bool recovery = false,
        bool safety = false,
        string correctness = "unknown") => new()
    {
        ActionId = actionId,
        Role = "observed",
        Type = type,
        Sequence = sequence,
        IsFault = fault,
        IsHint = hint,
        IsRecovery = recovery,
        IsSafetyViolation = safety,
        Correctness = correctness,
        Hint = hint ? new ReportedHintDto { HintId = $"hint-{actionId}", Level = 1 } : null,
        Recovery = recovery ? new ReportedRecoveryDto { FaultId = $"fault-{actionId}", Successful = true } : null,
        SafetyViolation = safety
            ? new ReportedSafetyViolationDto { RuleId = "guard-door-open", Description = "Simulated guard." }
            : null,
    };

    private static async Task<TrainingSessionDto> StartAsync(
        HttpClient client, string? classId = null, params string[] expected)
    {
        var response = await client.PostAsJsonAsync("/api/training/sessions", new StartTrainingSessionRequest
        {
            ScenarioId = "pick-and-place",
            ClassId = classId,
            ExpectedActions = expected.ToList(),
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TrainingSessionDto>())!;
    }

    private static async Task CompleteRichSessionAsync(HttpClient learner, string sessionId)
    {
        var batch = new ReportTrainingActionsRequest
        {
            Actions =
            [
                Action("a1", "PICK_PART", 1, correctness: "correct"),
                Action("w1", "WRONG_GRIP", 2, correctness: "incorrect"),
                Action("f1", "fault", 3, fault: true),
                Action("r1", "recovery", 4, recovery: true),
                Action("h1", "hint", 5, hint: true),
                Action("v1", "safety.violation", 6, safety: true),
            ],
        };
        Assert.Equal(HttpStatusCode.OK,
            (await learner.PostAsJsonAsync($"/api/training/sessions/{sessionId}/actions", batch)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await learner.PostAsJsonAsync(
                $"/api/training/sessions/{sessionId}/complete",
                new CompleteTrainingSessionRequest { Completed = true, CompletionPercent = 100 })).StatusCode);
    }

    [Fact]
    public async Task Metrics_aggregate_the_seeded_class_window_for_an_instructor()
    {
        var suffix = Guid.NewGuid().ToString("N");
        var learnerSubject = $"metrics-learner-{suffix}";
        var instructor = await _fx.CreateClientAsync(Fabrik3DRoles.Instructor, $"metrics-instructor-{suffix}");
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, learnerSubject);

        var created = await instructor.PostAsJsonAsync("/api/organizations/classes", new UpsertTrainingClassRequest
        {
            Name = $"Metrics cohort {suffix}",
            LearnerSubjects = [learnerSubject],
            InstructorSubjects = [$"metrics-instructor-{suffix}"],
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var trainingClass = (await created.Content.ReadFromJsonAsync<TrainingClassDto>())!;

        var session = await StartAsync(learner, trainingClass.Id, "PICK_PART", "COMPLETE");
        await CompleteRichSessionAsync(learner, session.Id);

        var metrics = await instructor.GetFromJsonAsync<InstructorMetricsDto>(
            $"/api/training/metrics?classId={trainingClass.Id}&scenarioId=pick-and-place");

        Assert.NotNull(metrics);
        Assert.Equal(1, metrics!.SessionCount);
        Assert.Equal(1, metrics.CompletedCount);
        Assert.Equal(0, metrics.RunningCount);
        Assert.Equal(1, metrics.CompletionRate);
        Assert.Equal(1, metrics.FaultCount);
        Assert.Equal(1, metrics.RecoveryActionCount);
        Assert.Equal(1, metrics.HintCount);
        Assert.Equal(1, metrics.SessionsWithHints);
        Assert.Equal(1, metrics.SafetyViolationCount);
        Assert.Equal(1, metrics.IncorrectActionCount);
        Assert.Contains(metrics.CommonIncorrectActions, c => c.Key == "WRONG_GRIP" && c.Count == 1);
        Assert.Contains(metrics.RepeatedFaultTypes, c => c.Key == "fault");
        Assert.Contains(metrics.SafetyMistakeRules, c => c.Key == "guard-door-open");
        Assert.Equal(TrainingMetricsCalculator.DefinitionsVersion, metrics.DefinitionsVersion);
        Assert.Contains("not a professional", metrics.EducationalNote, StringComparison.Ordinal);
        Assert.False(metrics.Truncated);
    }

    [Fact]
    public async Task Metrics_are_refused_for_non_instructor_roles()
    {
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, $"metrics-nope-{Guid.NewGuid():N}");
        Assert.Equal(HttpStatusCode.Forbidden, (await learner.GetAsync("/api/training/metrics")).StatusCode);

        var @operator = await _fx.CreateClientAsync(Fabrik3DRoles.Operator, $"metrics-op-{Guid.NewGuid():N}");
        Assert.Equal(HttpStatusCode.Forbidden, (await @operator.GetAsync("/api/training/metrics")).StatusCode);
    }

    [Fact]
    public async Task Restart_creates_a_new_running_session_and_audits_both_sides()
    {
        var suffix = Guid.NewGuid().ToString("N");
        var learnerSubject = $"restart-learner-{suffix}";
        var instructor = await _fx.CreateClientAsync(Fabrik3DRoles.Instructor, $"restart-instructor-{suffix}");
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, learnerSubject);

        var source = await StartAsync(learner, null, "PICK_PART");
        await learner.PostAsJsonAsync($"/api/training/sessions/{source.Id}/actions",
            new ReportTrainingActionsRequest { Actions = [Action("a1", "PICK_PART", 1, correctness: "correct")] });
        await learner.PostAsJsonAsync($"/api/training/sessions/{source.Id}/complete",
            new CompleteTrainingSessionRequest { Completed = true, CompletionPercent = 100 });

        var restarted = await instructor.PostAsJsonAsync(
            $"/api/training/sessions/{source.Id}/restart",
            new RestartTrainingSessionRequest { Reason = "Second attempt after coaching" });
        Assert.Equal(HttpStatusCode.OK, restarted.StatusCode);

        var result = (await restarted.Content.ReadFromJsonAsync<RestartTrainingSessionResultDto>())!;
        Assert.Equal(source.Id, result.RestartedFromSessionId);
        Assert.Equal("Second attempt after coaching", result.Reason);
        Assert.Equal("running", result.Session.Status);
        Assert.NotEqual(source.Id, result.Session.Id);
        Assert.Equal(learnerSubject, result.Session.LearnerSubject);
        Assert.Equal("pick-and-place", result.Session.ScenarioId);
        Assert.Equal(source.ExpectedActions, result.Session.ExpectedActions);

        // The original session keeps its evidence and records the restart with the acting subject.
        var original = await instructor.GetFromJsonAsync<TrainingSessionDto>($"/api/training/sessions/{source.Id}");
        Assert.NotNull(original);
        var audit = Assert.Single(original!.Audit, entry => entry.Action == "restarted");
        Assert.Contains(result.Session.Id, audit.Detail, StringComparison.Ordinal);
        Assert.Contains("Second attempt after coaching", audit.Detail, StringComparison.Ordinal);

        // The new attempt is audited back to the source.
        var newAudit = Assert.Single(result.Session.Audit, entry => entry.Action == "restarted-from");
        Assert.Contains(source.Id, newAudit.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Restart_refuses_a_running_session_with_a_clear_reason()
    {
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, $"restart-run-{Guid.NewGuid():N}");
        var instructor = await _fx.CreateClientAsync(Fabrik3DRoles.Instructor, $"restart-run-i-{Guid.NewGuid():N}");
        var session = await StartAsync(learner);

        var response = await instructor.PostAsJsonAsync(
            $"/api/training/sessions/{session.Id}/restart", new RestartTrainingSessionRequest());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorDto>())!;
        Assert.Equal("training_session_running", error.Code);
    }

    [Fact]
    public async Task Restart_is_refused_for_a_learner_and_for_an_unknown_session()
    {
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, $"restart-deny-{Guid.NewGuid():N}");
        var instructor = await _fx.CreateClientAsync(Fabrik3DRoles.Instructor, $"restart-deny-i-{Guid.NewGuid():N}");
        var session = await StartAsync(learner);
        await learner.PostAsJsonAsync($"/api/training/sessions/{session.Id}/complete",
            new CompleteTrainingSessionRequest { Completed = true, CompletionPercent = 100 });

        Assert.Equal(HttpStatusCode.Forbidden,
            (await learner.PostAsJsonAsync(
                $"/api/training/sessions/{session.Id}/restart", new RestartTrainingSessionRequest())).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound,
            (await instructor.PostAsJsonAsync(
                "/api/training/sessions/not-a-valid-object-id/restart", new RestartTrainingSessionRequest())).StatusCode);
    }

    [Fact]
    public async Task Metrics_are_tenant_scoped_and_never_leak_across_organizations()
    {
        using var factory = _fx.CreateMultiOrganizationFactory();
        var memberships = factory.Services.GetRequiredService<MembershipRepository>();

        var owner = $"metrics-tenant-owner-{Guid.NewGuid():N}";
        var otherInstructor = $"metrics-tenant-other-{Guid.NewGuid():N}";
        await memberships.UpsertAsync("org-metrics-a", owner, Fabrik3DRoles.Learner, MembershipStatus.Active);
        await memberships.UpsertAsync("org-metrics-b", otherInstructor, Fabrik3DRoles.Instructor, MembershipStatus.Active);

        var ownerClient = await CreateScopedClientAsync(factory, Fabrik3DRoles.Learner, owner, "org-metrics-a");
        var start = await ownerClient.PostAsJsonAsync("/api/training/sessions", new StartTrainingSessionRequest
        {
            ScenarioId = "pick-and-place",
        });
        Assert.Equal(HttpStatusCode.Created, start.StatusCode);
        var session = (await start.Content.ReadFromJsonAsync<TrainingSessionDto>())!;
        await CompleteRichSessionAsync(ownerClient, session.Id);

        // The instructor in organization B sees an empty, tenant-scoped window.
        var otherClient = await CreateScopedClientAsync(
            factory, Fabrik3DRoles.Instructor, otherInstructor, "org-metrics-b");
        var isolated = await otherClient.GetFromJsonAsync<InstructorMetricsDto>(
            "/api/training/metrics?scenarioId=pick-and-place");
        Assert.NotNull(isolated);
        Assert.Equal(0, isolated!.SessionCount);
        Assert.Empty(isolated.RepeatedFaultTypes);
    }

    private static async Task<HttpClient> CreateScopedClientAsync(
        WebApplicationFactory<Program> factory, string role, string subject, string organizationId)
    {
        var client = factory.CreateClient();
        var token = await AuthServerFixture.RequestTokenAsync(client, role, subject);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        client.DefaultRequestHeaders.Add(TenantSchema.OrganizationHeader, organizationId);
        return client;
    }
}
