using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// End-to-end HTTP lifecycle for server-side training sessions and deterministic assessment (S44):
/// start → report evidence → idempotent retry → complete → assessment → report, plus the negative
/// authorization matrix (cross-learner, cross-tenant, public demo, forged identity, oversized batch).
/// </summary>
[Collection(AuthServerCollection.Name)]
public class TrainingHttpIntegrationTests
{
    private readonly AuthServerFixture _fx;

    public TrainingHttpIntegrationTests(AuthServerFixture fx) => _fx = fx;

    private static ReportedTrainingAction Action(
        string actionId,
        string type,
        long sequence,
        bool fault = false,
        bool recovery = false,
        string? faultId = null) => new()
    {
        ActionId = actionId,
        Role = "observed",
        Type = type,
        Sequence = sequence,
        IsFault = fault,
        IsRecovery = recovery,
        Recovery = recovery ? new ReportedRecoveryDto { FaultId = faultId, Successful = true } : null,
    };

    private static async Task<TrainingSessionDto> StartAsync(HttpClient client, params string[] expected)
    {
        var response = await client.PostAsJsonAsync("/api/training/sessions", new StartTrainingSessionRequest
        {
            ScenarioId = "pick-and-place",
            ExpectedActions = expected.ToList(),
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TrainingSessionDto>())!;
    }

    [Fact]
    public async Task Full_lifecycle_persists_evidence_and_computes_a_reproducible_score()
    {
        var subject = $"train-learner-{Guid.NewGuid():N}";
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, subject);

        var session = await StartAsync(learner, "PICK_PART", "COMPLETE");
        Assert.Equal(subject, session.LearnerSubject);
        Assert.Equal("running", session.Status);
        Assert.Equal("Pending", session.AssessmentStatus);
        Assert.Equal(0, session.Score);

        var batch = new ReportTrainingActionsRequest
        {
            Actions =
            [
                Action("a1", "PICK_PART", 1),
                Action("f1", "fault", 2, fault: true),
                Action("r1", "recovery", 3, recovery: true, faultId: "f1"),
                Action("a2", "COMPLETE", 4),
            ],
        };

        var ingested = await learner.PostAsJsonAsync($"/api/training/sessions/{session.Id}/actions", batch);
        Assert.Equal(HttpStatusCode.OK, ingested.StatusCode);
        var result = await ingested.Content.ReadFromJsonAsync<TrainingIngestionResultDto>();
        Assert.NotNull(result);
        Assert.Equal(4, result!.Inserted);
        Assert.Equal(0, result.Duplicates);

        // Reconnect-safe retry: the same batch is idempotent.
        var retry = await learner.PostAsJsonAsync($"/api/training/sessions/{session.Id}/actions", batch);
        var retried = await retry.Content.ReadFromJsonAsync<TrainingIngestionResultDto>();
        Assert.Equal(0, retried!.Inserted);
        Assert.Equal(4, retried.Duplicates);

        var fetched = await learner.GetFromJsonAsync<TrainingSessionDto>($"/api/training/sessions/{session.Id}");
        Assert.Equal(4, fetched!.ActionCount);
        Assert.Equal(1, fetched.FaultCount);
        Assert.Equal(1, fetched.RecoveryActionCount);

        var completed = await learner.PostAsJsonAsync(
            $"/api/training/sessions/{session.Id}/complete",
            new CompleteTrainingSessionRequest { Completed = true, CompletionPercent = 100 });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        var final = await completed.Content.ReadFromJsonAsync<TrainingSessionDto>();
        Assert.Equal("completed", final!.Status);
        Assert.True(final.Completed);
        Assert.Equal("Computed", final.AssessmentStatus);
        Assert.Equal(100, final.Score);
        Assert.Equal(100, final.PossibleScore);
        Assert.Equal(Fabrik3D.Domain.Training.TrainingSchema.ScoringRuleVersion, final.ScoringRuleVersion);

        var assessment = await learner.GetFromJsonAsync<TrainingAssessmentDto>(
            $"/api/training/sessions/{session.Id}/assessment");
        Assert.NotNull(assessment);
        Assert.Equal(100, assessment!.EffectiveScore);
        Assert.Equal(5, assessment.Criteria.Count);
        Assert.Contains("does not certify", assessment.Disclaimer, StringComparison.Ordinal);

        // The stored evidence is fetched back with its typed fault/recovery payloads.
        var actions = await learner.GetFromJsonAsync<List<TrainingActionDto>>(
            $"/api/training/sessions/{session.Id}/actions");
        Assert.Equal(4, actions!.Count);
        Assert.Contains(actions, a => a.IsFault && a.ActionId == "f1");
        Assert.Contains(actions, a => a.IsRecovery && a.Recovery?.FaultId == "f1");

        // The server report states its educational scope and server authority.
        var report = await learner.GetFromJsonAsync<TrainingReportDto>(
            $"/api/training/sessions/{session.Id}/report");
        Assert.NotNull(report);
        Assert.Equal("server", report!.AssessmentAuthority);
        Assert.Equal("educational", report.EducationalScope);
        Assert.Contains("does not certify", report.Disclaimer, StringComparison.Ordinal);
        Assert.Equal(1, report.Metrics.FaultsEncountered);
        Assert.Equal(1, report.Metrics.RecoveryActions);
    }

    [Fact]
    public async Task Forged_learner_field_is_ignored_and_identity_binds_to_the_token()
    {
        var subject = $"train-forge-{Guid.NewGuid():N}";
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, subject);

        var response = await learner.PostAsJsonAsync("/api/training/sessions", new
        {
            scenarioId = "pick-and-place",
            learnerSubject = "someone-else",
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var session = await response.Content.ReadFromJsonAsync<TrainingSessionDto>();
        Assert.Equal(subject, session!.LearnerSubject);
    }

    [Fact]
    public async Task Another_learner_cannot_read_report_or_report_evidence()
    {
        var owner = $"train-owner-{Guid.NewGuid():N}";
        var other = $"train-other-{Guid.NewGuid():N}";
        var ownerClient = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, owner);
        var otherClient = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, other);

        var session = await StartAsync(ownerClient, "PICK_PART");

        foreach (var path in new[]
        {
            $"/api/training/sessions/{session.Id}",
            $"/api/training/sessions/{session.Id}/actions",
            $"/api/training/sessions/{session.Id}/assessment",
            $"/api/training/sessions/{session.Id}/report",
        })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await otherClient.GetAsync(path)).StatusCode);
        }

        var report = await otherClient.PostAsJsonAsync(
            $"/api/training/sessions/{session.Id}/actions",
            new ReportTrainingActionsRequest { Actions = [Action("x1", "PICK_PART", 1)] });
        Assert.Equal(HttpStatusCode.Forbidden, report.StatusCode);
    }

    [Fact]
    public async Task Instructor_reads_learner_sessions_within_the_organization()
    {
        var subject = $"train-instructor-read-{Guid.NewGuid():N}";
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, subject);
        var instructor = await _fx.CreateClientAsync(Fabrik3DRoles.Instructor, $"instructor-{Guid.NewGuid():N}");

        var session = await StartAsync(learner, "PICK_PART");

        Assert.Equal(HttpStatusCode.OK, (await instructor.GetAsync($"/api/training/sessions/{session.Id}")).StatusCode);

        var listed = await instructor.GetFromJsonAsync<List<TrainingSessionDto>>(
            $"/api/training/sessions?learnerSubject={subject}");
        Assert.Contains(listed!, s => s.Id == session.Id);
    }

    [Fact]
    public async Task Instructor_correction_preserves_the_computed_score_and_versions_the_assessment()
    {
        var subject = $"train-correction-{Guid.NewGuid():N}";
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, subject);
        var instructor = await _fx.CreateClientAsync(Fabrik3DRoles.Instructor, $"instructor-{Guid.NewGuid():N}");

        var session = await StartAsync(learner, "PICK_PART");
        await learner.PostAsJsonAsync($"/api/training/sessions/{session.Id}/actions",
            new ReportTrainingActionsRequest { Actions = [Action("a1", "PICK_PART", 1)] });
        await learner.PostAsJsonAsync($"/api/training/sessions/{session.Id}/complete",
            new CompleteTrainingSessionRequest { Completed = true, CompletionPercent = 100 });

        var corrected = await instructor.PostAsJsonAsync(
            $"/api/training/sessions/{session.Id}/assessment/corrections",
            new CorrectAssessmentRequest { Reason = "Partial credit for approach", AdjustedScore = 80 });
        Assert.Equal(HttpStatusCode.OK, corrected.StatusCode);

        var assessment = await corrected.Content.ReadFromJsonAsync<TrainingAssessmentDto>();
        Assert.NotNull(assessment);
        Assert.Equal(100, assessment!.ComputedScore);
        Assert.Equal(80, assessment.EffectiveScore);
        Assert.Equal(2, assessment.AssessmentVersion);
        Assert.Single(assessment.Corrections);
        Assert.Equal("Partial credit for approach", assessment.Corrections[0].Reason);
    }

    [Fact]
    public async Task Oversized_batch_is_rejected()
    {
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, $"train-oversize-{Guid.NewGuid():N}");
        var session = await StartAsync(learner);

        var actions = Enumerable.Range(0, 501)
            .Select(index => Action($"x{index}", "step", index))
            .ToList();

        var response = await learner.PostAsJsonAsync(
            $"/api/training/sessions/{session.Id}/actions",
            new ReportTrainingActionsRequest { Actions = actions });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Public_demo_identity_can_only_read()
    {
        var demo = await _fx.CreateClientAsync(Fabrik3DRoles.PublicDemo, $"demo-{Guid.NewGuid():N}");

        var response = await demo.PostAsJsonAsync("/api/training/sessions", new StartTrainingSessionRequest
        {
            ScenarioId = "pick-and-place",
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_session_id_returns_not_found()
    {
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, $"train-unknown-{Guid.NewGuid():N}");

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await learner.GetAsync("/api/training/sessions/not-a-valid-object-id")).StatusCode);
    }

    [Fact]
    public async Task Typed_hint_and_safety_violation_records_persist_and_affect_the_assessment()
    {
        var subject = $"train-typed-{Guid.NewGuid():N}";
        var learner = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, subject);

        var session = await StartAsync(learner, "PICK_PART");

        var batch = new ReportTrainingActionsRequest
        {
            Actions =
            [
                Action("a1", "PICK_PART", 1),
                new ReportedTrainingAction
                {
                    ActionId = "h1",
                    Role = "observed",
                    Type = "hint",
                    Sequence = 2,
                    IsHint = true,
                    Hint = new ReportedHintDto { HintId = "hint-turn-1", Level = 1 },
                },
                new ReportedTrainingAction
                {
                    ActionId = "v1",
                    Role = "observed",
                    Type = "safety.violation",
                    Sequence = 3,
                    IsSafetyViolation = true,
                    SafetyViolation = new ReportedSafetyViolationDto
                    {
                        RuleId = "guard-door-open",
                        Description = "Simulated guard door opened during the cycle.",
                        Severity = "critical",
                    },
                },
            ],
        };

        var ingested = await learner.PostAsJsonAsync($"/api/training/sessions/{session.Id}/actions", batch);
        Assert.Equal(HttpStatusCode.OK, ingested.StatusCode);

        var fetched = await learner.GetFromJsonAsync<TrainingSessionDto>($"/api/training/sessions/{session.Id}");
        Assert.Equal(1, fetched!.HintCount);
        Assert.Equal(1, fetched.SafetyViolationCount);

        // The typed records survive the round trip; they are not flattened to free text.
        var actions = await learner.GetFromJsonAsync<List<TrainingActionDto>>(
            $"/api/training/sessions/{session.Id}/actions");
        Assert.Contains(actions!, a => a.IsHint && a.Hint?.HintId == "hint-turn-1");
        var violation = actions!.Single(a => a.IsSafetyViolation);
        Assert.Equal("guard-door-open", violation.SafetyViolation?.RuleId);
        Assert.Equal("critical", violation.Severity);

        var completed = await learner.PostAsJsonAsync(
            $"/api/training/sessions/{session.Id}/complete",
            new CompleteTrainingSessionRequest { Completed = true, CompletionPercent = 100 });
        var final = await completed.Content.ReadFromJsonAsync<TrainingSessionDto>();

        // completion 40 + expected 25 + fault-recovery 15 + safety 0 + hint 10 = 90.
        Assert.Equal(90, final!.Score);
        Assert.Equal(0, final.Assessment!.Criteria.Single(c => c.Id == "safety-compliance").Earned);
        Assert.Equal(10, final.Assessment.Criteria.Single(c => c.Id == "hint-discipline").Earned);
    }

    [Fact]
    public async Task Learner_cannot_start_a_class_session_for_a_class_they_are_not_enrolled_in()
    {
        var suffix = Guid.NewGuid().ToString("N");
        var enrolled = $"train-enrolled-{suffix}";
        var outsider = $"train-outsider-{suffix}";
        var instructor = await _fx.CreateClientAsync(Fabrik3DRoles.Instructor, $"train-class-instructor-{suffix}");

        var created = await instructor.PostAsJsonAsync("/api/organizations/classes", new UpsertTrainingClassRequest
        {
            Name = $"Training cohort {suffix}",
            LearnerSubjects = [enrolled],
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var trainingClass = await created.Content.ReadFromJsonAsync<TrainingClassDto>();

        var enrolledClient = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, enrolled);
        var enrolledStart = await enrolledClient.PostAsJsonAsync("/api/training/sessions", new StartTrainingSessionRequest
        {
            ScenarioId = "pick-and-place",
            ClassId = trainingClass!.Id,
        });
        Assert.Equal(HttpStatusCode.Created, enrolledStart.StatusCode);

        // Cross-class reporting: a learner outside the cohort is rejected server-side.
        var outsiderClient = await _fx.CreateClientAsync(Fabrik3DRoles.Learner, outsider);
        var outsiderStart = await outsiderClient.PostAsJsonAsync("/api/training/sessions", new StartTrainingSessionRequest
        {
            ScenarioId = "pick-and-place",
            ClassId = trainingClass.Id,
        });
        Assert.Equal(HttpStatusCode.Forbidden, outsiderStart.StatusCode);
    }

    [Fact]
    public async Task Cross_tenant_training_sessions_are_not_visible()
    {
        using var factory = _fx.CreateMultiOrganizationFactory();
        var memberships = factory.Services.GetRequiredService<MembershipRepository>();

        var owner = $"cross-tenant-owner-{Guid.NewGuid():N}";
        var outsider = $"cross-tenant-outsider-{Guid.NewGuid():N}";
        await memberships.UpsertAsync("org-train-a", owner, Fabrik3DRoles.Learner, MembershipStatus.Active);
        await memberships.UpsertAsync("org-train-b", outsider, Fabrik3DRoles.Learner, MembershipStatus.Active);

        var ownerClient = await CreateScopedClientAsync(factory, Fabrik3DRoles.Learner, owner, "org-train-a");
        var start = await ownerClient.PostAsJsonAsync("/api/training/sessions", new StartTrainingSessionRequest
        {
            ScenarioId = "pick-and-place",
        });
        Assert.Equal(HttpStatusCode.Created, start.StatusCode);
        var session = await start.Content.ReadFromJsonAsync<TrainingSessionDto>();

        var outsiderClient = await CreateScopedClientAsync(factory, Fabrik3DRoles.Learner, outsider, "org-train-b");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await outsiderClient.GetAsync($"/api/training/sessions/{session!.Id}")).StatusCode);
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
