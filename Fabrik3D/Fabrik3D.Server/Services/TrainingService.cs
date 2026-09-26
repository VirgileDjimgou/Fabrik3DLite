using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Domain.Training;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Exceptions;
using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Training-session authority (S44): persists sessions and typed evidence, enforces learner
/// ownership and tenant boundaries server-side, and computes the authoritative deterministic
/// assessment. The client may report evidence but can never inject a score.
/// </summary>
public class TrainingService
{
    private readonly TrainingSessionRepository _sessions;
    private readonly TrainingActionRepository _actions;
    private readonly TrainingClassRepository _classes;
    private readonly ITenantContext _tenant;
    private readonly ICurrentIdentity _identity;
    private readonly TrainingOptions _options;
    private readonly ILogger<TrainingService> _log;

    public TrainingService(
        TrainingSessionRepository sessions,
        TrainingActionRepository actions,
        TrainingClassRepository classes,
        ITenantContext tenant,
        ICurrentIdentity identity,
        IOptions<TrainingOptions> options,
        ILogger<TrainingService> log)
    {
        _sessions = sessions;
        _actions = actions;
        _classes = classes;
        _tenant = tenant;
        _identity = identity;
        _options = options.Value;
        _log = log;
    }

    // ── Lifecycle ───────────────────────────────────────────────────

    public async Task<TrainingSessionDto> StartSessionAsync(
        StartTrainingSessionRequest request, CancellationToken ct = default)
    {
        EnsureEnabled();
        var subject = EnsureAuthenticated();

        var scenarioId = RequireText(request.ScenarioId, "scenarioId");
        var classId = string.IsNullOrWhiteSpace(request.ClassId) ? null : request.ClassId.Trim();

        if (classId is not null)
        {
            var trainingClass = await _classes.GetByIdAsync(classId);
            if (trainingClass is null)
            {
                // Cross-organization or unknown class: rejected without revealing which.
                throw new KeyNotFoundException($"Class '{classId}' does not exist.");
            }

            if (!IsInstructorOrAdmin()
                && trainingClass.LearnerSubjects.Count > 0
                && !trainingClass.LearnerSubjects.Contains(subject, StringComparer.Ordinal))
            {
                throw new UnauthorizedAccessException(
                    "The current identity is not enrolled in the requested class.");
            }
        }

        var session = new TrainingSession
        {
            OrganizationId = _tenant.OrganizationId,
            ClassId = classId,
            LearnerSubject = subject,
            Alias = SanitizeAlias(request.Alias),
            ScenarioId = scenarioId,
            ScenarioVersion = string.IsNullOrWhiteSpace(request.ScenarioVersion)
                ? TrainingSchema.Version
                : RequireText(request.ScenarioVersion!, "scenarioVersion"),
            SimulationSessionId = string.IsNullOrWhiteSpace(request.SimulationSessionId)
                ? null
                : request.SimulationSessionId!.Trim(),
            SimulatorId = string.IsNullOrWhiteSpace(request.SimulatorId)
                ? null
                : request.SimulatorId!.Trim(),
            ExpectedActions = NormalizeExpectedActions(request.ExpectedActions),
            StartedAtUtc = DateTime.UtcNow,
            Status = TrainingSessionStatus.Running,
            AssessmentStatus = TrainingAssessmentStatus.Pending,
            ScoringRuleVersion = TrainingSchema.ScoringRuleVersion,
            SoftwareVersion = TrainingSchema.SoftwareVersion,
        };
        session.AssessmentDiagnostic = _options.ServerAssessmentEnabled
            ? null
            : "server_assessment_disabled";
        session.Audit.Add(new TrainingAuditEntry
        {
            Action = "started",
            Subject = _identity.AuditId,
            Detail = $"scenario={session.ScenarioId}",
        });

        await _sessions.CreateAsync(session, ct);
        _log.LogInformation(
            "[Server][Training] Started session id={SessionId} learner={Learner} scenario={Scenario} organization={OrganizationId}",
            session.Id, session.LearnerSubject, session.ScenarioId, session.OrganizationId);

        return ToDto(session);
    }

    public async Task<TrainingIngestionResultDto> ReportActionsAsync(
        string sessionId,
        ReportTrainingActionsRequest request,
        CancellationToken ct = default)
    {
        EnsureEnabled();
        var session = await LoadOwnedAsync(sessionId, ct);

        if (session.Status != TrainingSessionStatus.Running)
        {
            throw new InvalidOperationException(
                "Evidence can only be reported while the training session is running.");
        }

        if (request.Actions.Count == 0)
        {
            throw new InvalidOperationException("A report batch must contain at least one action.");
        }

        if (request.Actions.Count > _options.MaxBatchSize)
        {
            throw new InvalidOperationException(
                $"A report batch may contain at most {_options.MaxBatchSize} actions.");
        }

        var reported = new List<TrainingActionRecord>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in request.Actions)
        {
            var actionId = RequireText(item.ActionId, "actionId");
            if (!seen.Add(actionId)) continue; // duplicate inside one batch: first wins
            reported.Add(MapAction(session.Id, actionId, item));
        }

        var existing = await _actions.CountBySessionAsync(session.Id, ct);
        if (existing + reported.Count > _options.MaxActionsPerSession)
        {
            throw new InvalidOperationException(
                $"The session action limit ({_options.MaxActionsPerSession}) would be exceeded.");
        }

        var result = await _actions.InsertBatchAsync(reported, ct);

        await RecomputeAndSaveAsync(session, ct);
        _log.LogInformation(
            "[Server][Training] Ingested session id={SessionId} inserted={Inserted} duplicates={Duplicates}",
            session.Id, result.Inserted, result.Duplicates);

        return new TrainingIngestionResultDto(
            result.Inserted,
            result.Duplicates,
            session.ActionCount,
            session.FaultCount,
            session.HintCount,
            session.SafetyViolationCount,
            session.RecoveryActionCount,
            session.Assessment is null ? null : ToDto(session.Assessment));
    }

    public async Task<TrainingSessionDto> CompleteSessionAsync(
        string sessionId, CompleteTrainingSessionRequest request, CancellationToken ct = default)
    {
        EnsureEnabled();
        var session = await LoadOwnedAsync(sessionId, ct);

        if (session.Status != TrainingSessionStatus.Running)
        {
            throw new OrchestrationConflictException(
                "session_already_complete", "This training session has already been completed.");
        }

        session.Completed = request.Completed;
        session.Status = request.Completed ? TrainingSessionStatus.Completed : TrainingSessionStatus.Failed;
        session.CompletionPercent = request.Completed
            ? Math.Clamp(request.CompletionPercent ?? 100, 0, 100)
            : Math.Clamp(request.CompletionPercent ?? 0, 0, 100);
        session.EndedAtUtc = request.EndedAtUtc ?? DateTime.UtcNow;
        session.Audit.Add(new TrainingAuditEntry
        {
            Action = request.Completed ? "completed" : "failed",
            Subject = _identity.AuditId,
        });

        await RecomputeAndSaveAsync(session, ct);
        _log.LogInformation(
            "[Server][Training] Completed session id={SessionId} status={Status} score={Score}",
            session.Id, session.Status, session.Score);
        return ToDto(session);
    }

    // ── Reads ───────────────────────────────────────────────────────

    public async Task<TrainingSessionDto?> GetSessionAsync(string sessionId, CancellationToken ct = default)
    {
        EnsureEnabled();
        var session = await _sessions.GetByIdAsync(sessionId, ct);
        if (session is null) return null;
        EnsureCanRead(session);
        return ToDto(session);
    }

    public async Task<List<TrainingActionDto>> GetActionsAsync(string sessionId, CancellationToken ct = default)
    {
        EnsureEnabled();
        var session = await _sessions.GetByIdAsync(sessionId, ct);
        if (session is null) throw new KeyNotFoundException($"Training session '{sessionId}' does not exist.");
        EnsureCanRead(session);
        var actions = await _actions.GetBySessionAsync(sessionId, ct);
        return actions.Select(ToDto).ToList();
    }

    public async Task<TrainingAssessmentDto?> GetAssessmentAsync(string sessionId, CancellationToken ct = default)
    {
        EnsureEnabled();
        var session = await _sessions.GetByIdAsync(sessionId, ct);
        if (session is null) throw new KeyNotFoundException($"Training session '{sessionId}' does not exist.");
        EnsureCanRead(session);
        return session.Assessment is null ? null : ToDto(session.Assessment);
    }

    public async Task<List<TrainingSessionDto>> ListSessionsAsync(
        TrainingSessionQuery query, CancellationToken ct = default)
    {
        EnsureEnabled();
        EnsureAuthenticated();

        // A non-instructor can only ever enumerate their own sessions; the filter is forced
        // server-side and never trusted from the client.
        var effectiveQuery = IsInstructorOrAdmin()
            ? query
            : query with { LearnerSubject = _identity.Subject };

        var sessions = await _sessions.QueryAsync(effectiveQuery, _options.MaxPageSize, ct);
        return sessions.Select(ToDto).ToList();
    }

    public async Task<TrainingReportDto> GetReportAsync(string sessionId, CancellationToken ct = default)
    {
        EnsureEnabled();
        var session = await _sessions.GetByIdAsync(sessionId, ct);
        if (session is null) throw new KeyNotFoundException($"Training session '{sessionId}' does not exist.");
        EnsureCanRead(session);

        var actions = await _actions.GetBySessionAsync(sessionId, ct);
        return BuildReport(session, actions, DateTime.UtcNow);
    }

    // ── Instructor dashboard (S45) ──────────────────────────────────

    /// <summary>
    /// Computes the documented instructor aggregates over the tenant-scoped session window (S45).
    /// Instructor/Admin only; the aggregation is server-side and never trusts a client-supplied
    /// organization id. The query is bounded by <see cref="TrainingOptions.MaxMetricsSessions"/> and
    /// reports when that bound was reached instead of silently truncating.
    /// </summary>
    public async Task<InstructorMetricsDto> GetInstructorMetricsAsync(
        TrainingMetricsScope scope, CancellationToken ct = default)
    {
        EnsureEnabled();
        if (!IsInstructorOrAdmin())
        {
            throw new UnauthorizedAccessException(
                "Viewing instructor aggregates requires an instructor role.");
        }

        var maxSessions = Math.Clamp(
            scope.MaxSessions <= 0 ? _options.MaxMetricsSessions : scope.MaxSessions,
            1,
            Math.Max(1, _options.MaxMetricsSessions));

        var query = new TrainingSessionQuery(
            ClassId: string.IsNullOrWhiteSpace(scope.ClassId) ? null : scope.ClassId.Trim(),
            LearnerSubject: null,
            ScenarioId: string.IsNullOrWhiteSpace(scope.ScenarioId) ? null : scope.ScenarioId.Trim(),
            Status: null,
            FromUtc: scope.FromUtc,
            ToUtc: scope.ToUtc,
            Skip: 0,
            Limit: maxSessions);

        var sessions = await _sessions.QueryAsync(query, maxSessions, ct);
        var truncated = sessions.Count >= maxSessions;
        var actions = await _actions.GetBySessionIdsAsync(sessions.Select(s => s.Id).ToList(), ct);

        var result = TrainingMetricsCalculator.Compute(scope, sessions, actions, truncated, DateTime.UtcNow);
        _log.LogInformation(
            "[Server][Training] Metrics organization={OrganizationId} class={ClassId} scenario={ScenarioId} sessions={Sessions} truncated={Truncated}",
            _tenant.OrganizationId, scope.ClassId, scope.ScenarioId, result.SessionCount, result.Truncated);
        return ToDto(result);
    }

    /// <summary>
    /// Restarts a completed/failed simulated training session (S45). Non-destructive: the original
    /// session and its evidence are preserved; a new running session for the same learner, class and
    /// scenario is created and both sides are audited with the authenticated subject. Instructor/Admin
    /// only, tenant-scoped, and a running session is refused with a clear reason.
    /// </summary>
    public async Task<RestartTrainingSessionResultDto> RestartSessionAsync(
        string sessionId, RestartTrainingSessionRequest request, CancellationToken ct = default)
    {
        EnsureEnabled();
        if (!IsInstructorOrAdmin())
        {
            throw new UnauthorizedAccessException(
                "Restarting a training session requires an instructor role.");
        }

        var source = await _sessions.GetByIdAsync(sessionId, ct)
            ?? throw new KeyNotFoundException($"Training session '{sessionId}' does not exist.");

        if (source.Status == TrainingSessionStatus.Running)
        {
            throw new OrchestrationConflictException(
                "training_session_running",
                "A running training session cannot be restarted; complete, fail or abandon it first.");
        }

        var reason = string.IsNullOrWhiteSpace(request.Reason)
            ? null
            : RequireText(request.Reason, "reason");

        var restarted = new TrainingSession
        {
            OrganizationId = source.OrganizationId,
            ClassId = source.ClassId,
            LearnerSubject = source.LearnerSubject,
            Alias = source.Alias,
            ScenarioId = source.ScenarioId,
            ScenarioVersion = source.ScenarioVersion,
            SimulationSessionId = null,
            SimulatorId = null,
            StartedAtUtc = DateTime.UtcNow,
            Status = TrainingSessionStatus.Running,
            AssessmentStatus = TrainingAssessmentStatus.Pending,
            ExpectedActions = [.. source.ExpectedActions],
            ScoringRuleVersion = TrainingSchema.ScoringRuleVersion,
            SoftwareVersion = TrainingSchema.SoftwareVersion,
        };
        restarted.Audit.Add(new TrainingAuditEntry
        {
            Action = "restarted-from",
            Subject = _identity.AuditId,
            Detail = $"source={source.Id}",
        });

        await _sessions.CreateAsync(restarted, ct);

        // The original session keeps its evidence and gains an audit entry naming the new attempt.
        source.Audit.Add(new TrainingAuditEntry
        {
            Action = "restarted",
            Subject = _identity.AuditId,
            Detail = $"new={restarted.Id}" + (reason is null ? string.Empty : $"; reason={reason}"),
        });
        source.UpdatedAtUtc = DateTime.UtcNow;
        if (!await _sessions.UpdateAsync(source, ct))
        {
            throw new OrchestrationConflictException(
                "training_session_conflict",
                "The training session was modified concurrently; reload and retry.");
        }

        _log.LogInformation(
            "[Server][Training] Restarted session source={SourceId} new={NewId} learner={Learner} organization={OrganizationId}",
            source.Id, restarted.Id, restarted.LearnerSubject, restarted.OrganizationId);

        return new RestartTrainingSessionResultDto(ToDto(restarted), source.Id, reason);
    }

    // ── Corrections ─────────────────────────────────────────────────

    public async Task<TrainingAssessmentDto> CorrectAssessmentAsync(
        string sessionId, CorrectAssessmentRequest request, CancellationToken ct = default)
    {
        EnsureEnabled();
        if (!IsInstructorOrAdmin())
        {
            throw new UnauthorizedAccessException("Correcting an assessment requires an instructor role.");
        }

        var session = await _sessions.GetByIdAsync(sessionId, ct);
        if (session is null) throw new KeyNotFoundException($"Training session '{sessionId}' does not exist.");
        if (session.Assessment is null)
        {
            throw new InvalidOperationException("No computed assessment exists for this session.");
        }

        var record = session.Assessment;
        var fromVersion = record.AssessmentVersion;
        var previousScore = record.EffectiveScore;

        // The computed criteria are immutable; only the effective score changes and every change is
        // recorded as an audited correction version.
        record.Corrections.Add(new TrainingCorrectionEntry
        {
            FromVersion = fromVersion,
            ToVersion = fromVersion + 1,
            PreviousEffectiveScore = previousScore,
            NewEffectiveScore = request.AdjustedScore,
            Reason = RequireText(request.Reason, "reason"),
            CorrectedBySubject = _identity.AuditId,
            CorrectedAtUtc = DateTime.UtcNow,
        });
        record.AssessmentVersion = fromVersion + 1;
        record.EffectiveScore = request.AdjustedScore;
        session.Score = request.AdjustedScore;
        session.Audit.Add(new TrainingAuditEntry
        {
            Action = "assessment-corrected",
            Subject = _identity.AuditId,
            Detail = $"{previousScore}->{request.AdjustedScore}: {record.Corrections[^1].Reason}",
        });

        if (!await _sessions.UpdateAsync(session, ct))
        {
            throw new OrchestrationConflictException(
                "training_session_conflict",
                "The training session was modified concurrently; reload and retry.");
        }

        _log.LogInformation(
            "[Server][Training] Corrected assessment session id={SessionId} version={Version} reason={Reason}",
            session.Id, record.AssessmentVersion, record.Corrections[^1].Reason);
        return ToDto(record);
    }

    // ── Local-report import (best effort) ───────────────────────────

    public async Task<TrainingSessionDto> ImportLocalReportAsync(
        ImportLocalTrainingReportRequest request, CancellationToken ct = default)
    {
        EnsureEnabled();
        var subject = EnsureAuthenticated();

        var session = new TrainingSession
        {
            OrganizationId = _tenant.OrganizationId,
            LearnerSubject = subject,
            Alias = SanitizeAlias(request.SessionAlias),
            ScenarioId = RequireText(request.ScenarioId, "scenarioId"),
            ScenarioVersion = string.IsNullOrWhiteSpace(request.SchemaVersion) ? TrainingSchema.Version : request.SchemaVersion!.Trim(),
            StartedAtUtc = request.GeneratedAt ?? DateTime.UtcNow,
            EndedAtUtc = request.GeneratedAt ?? DateTime.UtcNow,
            Completed = request.Metrics.ScenarioCompleted,
            Status = request.Metrics.ScenarioCompleted ? TrainingSessionStatus.Completed : TrainingSessionStatus.Failed,
            CompletionPercent = request.Metrics.ScenarioCompleted ? 100 : 0,
            ExpectedActions = NormalizeExpectedActions(request.ExpectedActions),
            Audit =
            {
                new TrainingAuditEntry
                {
                    Action = "imported-local-report",
                    Subject = _identity.AuditId,
                    Detail = "Local score ignored; server recomputed the assessment.",
                },
            },
        };

        await _sessions.CreateAsync(session, ct);

        // Deterministically derive observed actions from the imported local report so the server can
        // recompute an authoritative score from evidence instead of trusting the local score.
        var imported = new List<TrainingActionRecord>();
        var sequence = 0L;
        void Add(string type, bool fault, bool hint, bool recovery, bool violation)
        {
            imported.Add(new TrainingActionRecord
            {
                SessionId = session.Id,
                ActionId = $"import-{sequence}",
                Role = TrainingActionRole.Observed,
                Type = type,
                Sequence = sequence,
                TimestampUtc = session.StartedAtUtc,
                IsFault = fault,
                IsHint = hint,
                IsRecovery = recovery,
                IsSafetyViolation = violation,
                Hint = hint ? new HintUsage { HintId = $"import-hint-{sequence}", RevealedAtUtc = session.StartedAtUtc } : null,
                SafetyViolation = violation ? new SafetyViolation { RuleId = $"import-violation-{sequence}" } : null,
                Recovery = recovery ? new RecoveryAction { FaultId = $"import-fault-{sequence}", Successful = true } : null,
            });
            sequence++;
        }

        foreach (var _ in Enumerable.Range(0, Math.Max(0, request.Metrics.FaultsEncountered)))
        {
            Add("import.fault", fault: true, hint: false, recovery: false, violation: false);
        }
        foreach (var _ in Enumerable.Range(0, Math.Max(0, request.Metrics.HintsUsed)))
        {
            Add("import.hint", fault: false, hint: true, recovery: false, violation: false);
        }
        foreach (var _ in Enumerable.Range(0, Math.Max(0, request.Metrics.RecoveryActions)))
        {
            Add("import.recovery", fault: false, hint: false, recovery: true, violation: false);
        }
        foreach (var step in request.ObservedActions.Where(value => !string.IsNullOrWhiteSpace(value)).Distinct(StringComparer.Ordinal))
        {
            Add(step.Trim(), fault: false, hint: false, recovery: false, violation: false);
        }
        if (session.Completed)
        {
            Add("complete", fault: false, hint: false, recovery: false, violation: false);
        }

        if (imported.Count > 0)
        {
            await _actions.InsertBatchAsync(imported, ct);
        }

        await RecomputeAndSaveAsync(session, ct);
        return ToDto(session);
    }

    // ── Assessment ──────────────────────────────────────────────────

    private async Task RecomputeAndSaveAsync(TrainingSession session, CancellationToken ct)
    {
        var actions = await _actions.GetBySessionAsync(session.Id, ct);
        session.ActionCount = actions.Count;
        session.FaultCount = actions.Count(a => a.IsFault);
        session.HintCount = actions.Count(a => a.IsHint || a.Hint is not null);
        session.SafetyViolationCount = actions.Count(a => a.IsSafetyViolation || a.SafetyViolation is not null);
        session.RecoveryActionCount = actions.Count(a => a.IsRecovery || a.Recovery is not null);

        if (_options.ServerAssessmentEnabled)
        {
            try
            {
                var evidence = new TrainingEvidence(session, actions);
                var result = TrainingAssessmentEngine.Assess(evidence);
                var record = TrainingAssessmentEngine.ToRecord(result, DateTime.UtcNow);
                session.Assessment = record;
                session.AssessmentStatus = TrainingAssessmentStatus.Computed;
                session.AssessmentDiagnostic = null;
                session.Score = record.EffectiveScore;
                session.PossibleScore = record.EffectivePossibleScore;
                session.ScoringRuleVersion = record.ScoringRuleVersion;
                session.AssessmentSchemaVersion = record.AssessmentSchemaVersion;
            }
            catch (Exception ex)
            {
                // No fabricated score: the session is stored with a diagnostic instead.
                session.Assessment = null;
                session.AssessmentStatus = TrainingAssessmentStatus.Failed;
                session.AssessmentDiagnostic = $"assessment_failed: {ex.Message}";
                session.Score = 0;
                session.PossibleScore = 0;
                _log.LogError(ex, "[Server][Training] Assessment failed for session {SessionId}.", session.Id);
            }
        }
        else
        {
            session.Assessment = null;
            session.AssessmentStatus = TrainingAssessmentStatus.Pending;
            session.AssessmentDiagnostic = "server_assessment_disabled";
            session.Score = 0;
            session.PossibleScore = 0;
        }

        if (!await _sessions.UpdateAsync(session, ct))
        {
            throw new OrchestrationConflictException(
                "training_session_conflict",
                "The training session was modified concurrently; reload and retry.");
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────

    private void EnsureEnabled()
    {
        if (!_options.Enabled)
        {
            throw new InvalidOperationException("Server-side training persistence is disabled.");
        }
    }

    private string EnsureAuthenticated()
    {
        if (!_identity.IsAuthenticated || string.Equals(_identity.Subject, "anonymous", StringComparison.Ordinal))
        {
            throw new UnauthorizedAccessException("An authenticated learner identity is required.");
        }
        return _identity.Subject;
    }

    private bool IsInstructorOrAdmin() =>
        _identity.Roles.Contains(Fabrik3DRoles.Instructor, StringComparer.Ordinal)
        || _identity.Roles.Contains(Fabrik3DRoles.Administrator, StringComparer.Ordinal);

    private async Task<TrainingSession> LoadOwnedAsync(string sessionId, CancellationToken ct)
    {
        var session = await _sessions.GetByIdAsync(sessionId, ct)
            ?? throw new KeyNotFoundException($"Training session '{sessionId}' does not exist.");
        if (!string.Equals(session.LearnerSubject, _identity.Subject, StringComparison.Ordinal))
        {
            throw new UnauthorizedAccessException(
                "Only the owning learner may report evidence for this training session.");
        }
        return session;
    }

    private void EnsureCanRead(TrainingSession session)
    {
        if (string.Equals(session.LearnerSubject, _identity.Subject, StringComparison.Ordinal)) return;
        if (IsInstructorOrAdmin()) return;
        throw new UnauthorizedAccessException(
            "Reading another learner's training session requires an instructor role.");
    }

    private TrainingActionRecord MapAction(string sessionId, string actionId, ReportedTrainingAction item)
    {
        TrainingVocabulary.TryParseRole(item.Role, out var role);
        TrainingVocabulary.TryParseCorrectness(item.Correctness, out var correctness);
        var severity = TrainingActionSeverity.Info;
        if (item.Severity is not null)
        {
            TrainingVocabulary.TryParseSeverity(item.Severity, out severity);
        }

        var isHint = item.IsHint || item.Hint is not null;
        var isSafety = item.IsSafetyViolation || item.SafetyViolation is not null;
        var isRecovery = item.IsRecovery || item.Recovery is not null;

        if (item.SafetyViolation is { } violation)
        {
            TrainingVocabulary.TryParseSeverity(violation.Severity, out severity);
        }

        return new TrainingActionRecord
        {
            OrganizationId = _tenant.OrganizationId,
            SessionId = sessionId,
            ActionId = actionId,
            CorrelationId = Truncate(item.CorrelationId),
            Role = role,
            Type = RequireText(item.Type, "type"),
            Target = Truncate(item.Target),
            ExpectedActionId = Truncate(item.ExpectedActionId),
            Correctness = correctness,
            Severity = severity,
            TimestampUtc = item.TimestampUtc,
            Sequence = item.Sequence,
            IsFault = item.IsFault,
            IsHint = isHint,
            IsRecovery = isRecovery,
            IsSafetyViolation = isSafety,
            Hint = item.Hint is null
                ? null
                : new HintUsage
                {
                    HintId = Truncate(item.Hint.HintId) ?? string.Empty,
                    Level = item.Hint.Level,
                    RevealedAtUtc = item.Hint.RevealedAtUtc,
                },
            SafetyViolation = item.SafetyViolation is null
                ? null
                : new SafetyViolation
                {
                    RuleId = Truncate(item.SafetyViolation.RuleId) ?? string.Empty,
                    Description = Truncate(item.SafetyViolation.Description) ?? string.Empty,
                    Severity = ParseViolationSeverity(item.SafetyViolation.Severity),
                },
            Recovery = item.Recovery is null
                ? null
                : new RecoveryAction
                {
                    FaultId = Truncate(item.Recovery.FaultId),
                    RecoveredActionId = Truncate(item.Recovery.RecoveredActionId),
                    Successful = item.Recovery.Successful,
                    Target = Truncate(item.Recovery.Target),
                },
        };
    }

    private static TrainingActionSeverity ParseViolationSeverity(string? value)
    {
        var severity = TrainingActionSeverity.Error;
        if (value is not null) TrainingVocabulary.TryParseSeverity(value, out severity);
        return severity;
    }

    private static string RequireText(string? value, string field)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new InvalidOperationException($"'{field}' is required.");
        }
        return trimmed.Length <= TrainingSchema.MaxTextLength
            ? trimmed
            : trimmed[..TrainingSchema.MaxTextLength];
    }

    private static string? Truncate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= TrainingSchema.MaxTextLength ? trimmed : trimmed[..TrainingSchema.MaxTextLength];
    }

    private static string? SanitizeAlias(string? alias)
    {
        if (string.IsNullOrWhiteSpace(alias)) return null;
        var sanitized = new string(alias.Trim()
            .Where(c => char.IsLetterOrDigit(c) || c is ' ' or '_' or '-')
            .ToArray())
            .Trim();
        if (sanitized.Length == 0) return null;
        return sanitized.Length <= 40 ? sanitized : sanitized[..40];
    }

    private static List<string> NormalizeExpectedActions(IEnumerable<string>? expected)
    {
        if (expected is null) return [];
        return expected
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Where(value => value.Length <= 200)
            .Distinct(StringComparer.Ordinal)
            .Take(200)
            .ToList();
    }

    // ── DTO mapping ─────────────────────────────────────────────────

    private static TrainingReportDto BuildReport(
        TrainingSession session, IReadOnlyList<TrainingActionRecord> actions, DateTime generatedAtUtc)
    {
        var observed = actions.Where(a => a.Role == TrainingActionRole.Observed).ToList();
        var metrics = new TrainingReportMetricsDto(
            session.Completed,
            observed.Count(a => string.Equals(a.Type, "step-next", StringComparison.Ordinal)),
            observed.Count(a => a.IsFault),
            observed.Count(a => a.IsHint || a.Hint is not null),
            observed.Count(a => a.IsRecovery || a.Recovery is not null),
            observed.Count(a => a.IsSafetyViolation || a.SafetyViolation is not null),
            observed.Count(a => a.Correctness == TrainingActionCorrectness.Incorrect));

        return new TrainingReportDto(
            TrainingSchema.Version,
            "server-training-report",
            generatedAtUtc,
            "server",
            "educational",
            session.Assessment?.Disclaimer ?? TrainingSchema.EducationalScopeDisclaimer,
            ToDto(session),
            session.Assessment is null ? null : ToDto(session.Assessment),
            actions.Select(ToDto).ToList(),
            metrics);
    }

    private static InstructorMetricsDto ToDto(InstructorMetricsResult result) => new(
        result.AssessmentSchemaVersion,
        result.DefinitionsVersion,
        result.ScoringRuleVersion,
        result.GeneratedAtUtc,
        result.ClassId,
        result.ScenarioId,
        result.FromUtc,
        result.ToUtc,
        result.SessionCount,
        result.CompletedCount,
        result.FailedCount,
        result.RunningCount,
        result.TerminalCount,
        result.CompletionRate,
        result.MeanSessionSeconds,
        result.MeanDiagnosisSeconds,
        result.TotalActions,
        result.IncorrectActionCount,
        result.HintCount,
        result.SessionsWithHints,
        result.MeanHintsPerSession,
        result.FaultCount,
        result.RecoveryActionCount,
        result.SafetyViolationCount,
        result.SessionsWithSafetyViolations,
        result.CommonIncorrectActions.Select(c => new TrainingMetricCountDto(c.Key, c.Count)).ToList(),
        result.RepeatedFaultTypes.Select(c => new TrainingMetricCountDto(c.Key, c.Count)).ToList(),
        result.SafetyMistakeRules.Select(c => new TrainingMetricCountDto(c.Key, c.Count)).ToList(),
        result.Truncated,
        result.EducationalNote);

    private static TrainingSessionDto ToDto(TrainingSession session) => new(
        session.Id,
        session.OrganizationId,
        session.ClassId,
        session.LearnerSubject,
        session.Alias,
        session.ScenarioId,
        session.ScenarioVersion,
        session.SimulationSessionId,
        session.SimulatorId,
        session.StartedAtUtc,
        session.EndedAtUtc,
        TrainingVocabulary.ToWire(session.Status),
        session.Completed,
        session.CompletionPercent,
        session.ExpectedActions,
        session.ActionCount,
        session.FaultCount,
        session.HintCount,
        session.SafetyViolationCount,
        session.RecoveryActionCount,
        session.Score,
        session.PossibleScore,
        session.AssessmentSchemaVersion,
        session.ScoringRuleVersion,
        session.SoftwareVersion,
        session.AssessmentStatus.ToString(),
        session.AssessmentDiagnostic,
        session.Assessment is null ? null : ToDto(session.Assessment),
        session.Audit.Select(a => new TrainingAuditEntryDto(a.Action, a.Subject, a.Detail, a.AtUtc)).ToList(),
        session.Version);

    private static TrainingAssessmentDto ToDto(TrainingAssessmentRecord record) => new(
        record.ScoringRuleVersion,
        record.AssessmentSchemaVersion,
        record.SoftwareVersion,
        record.ComputedScore,
        record.ComputedPossibleScore,
        record.EffectiveScore,
        record.EffectivePossibleScore,
        record.Complete,
        record.Status.ToString(),
        record.Diagnostic,
        record.Disclaimer,
        "educational",
        record.Criteria.Select(c => new TrainingCriterionDto(
            c.Id, c.Label, c.Explanation, c.Points, c.Earned, c.Passed, c.Evidence)).ToList(),
        record.AssessmentVersion,
        record.Corrections.Select(c => new TrainingCorrectionDto(
            c.FromVersion, c.ToVersion, c.PreviousEffectiveScore, c.NewEffectiveScore,
            c.Reason, c.CorrectedBySubject, c.CorrectedAtUtc)).ToList(),
        record.ComputedAtUtc);

    private static TrainingActionDto ToDto(TrainingActionRecord action) => new(
        action.Id,
        action.ActionId,
        action.CorrelationId,
        TrainingVocabulary.ToWire(action.Role),
        action.Type,
        action.Target,
        action.ExpectedActionId,
        TrainingVocabulary.ToWire(action.Correctness),
        TrainingVocabulary.ToWire(action.Severity),
        action.TimestampUtc,
        action.Sequence,
        action.IsFault,
        action.IsHint,
        action.IsRecovery,
        action.IsSafetyViolation,
        action.Hint is null ? null : new ReportedHintDto
        {
            HintId = action.Hint.HintId,
            Level = action.Hint.Level,
            RevealedAtUtc = action.Hint.RevealedAtUtc,
        },
        action.SafetyViolation is null ? null : new ReportedSafetyViolationDto
        {
            RuleId = action.SafetyViolation.RuleId,
            Description = action.SafetyViolation.Description,
            Severity = TrainingVocabulary.ToWire(action.SafetyViolation.Severity),
        },
        action.Recovery is null ? null : new ReportedRecoveryDto
        {
            FaultId = action.Recovery.FaultId,
            RecoveredActionId = action.Recovery.RecoveredActionId,
            Successful = action.Recovery.Successful,
            Target = action.Recovery.Target,
        },
        action.SchemaVersion,
        action.RecordedAtUtc);
}
