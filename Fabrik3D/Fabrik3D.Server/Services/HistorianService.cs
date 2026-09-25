using System.Collections.Concurrent;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Infrastructure.Repositories;
using Fabrik3D.Infrastructure.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>Result of one retention/prune pass.</summary>
public sealed record HistorianPruneResult(long Deleted, string? Error);

/// <summary>
/// Bounded, maintainable telemetry and event historian (S40). Ingestion is validated, sampled,
/// rate-limited and batched; queries are read-only and deterministic; retention is delegated to the
/// pruner. Historian failure is always contained: it never throws into live orchestration.
/// </summary>
public sealed class HistorianService
{
    private const int MaxDiagnostics = 20;

    private readonly HistorianRepository _repository;
    private readonly HistorianOptions _options;
    private readonly ILogger<HistorianService> _log;
    private readonly TimeProvider _time;
    private readonly HistorianRateLimiter _rateLimiter = new();
    private readonly ConcurrentDictionary<string, SamplingState> _sampling = new(StringComparer.Ordinal);
    private readonly SamplingPolicy _defaultPolicy;
    private readonly Dictionary<string, SamplingPolicy> _signalPolicies;

    private long _acceptedSamples;
    private long _droppedSamples;
    private long _rejectedSamples;
    private long _acceptedEvents;
    private long _rejectedEvents;
    private long _lastPruneDeleted;
    private DateTime? _lastPrunedAtUtc;

    public HistorianService(
        HistorianRepository repository,
        IOptions<HistorianOptions> options,
        ILogger<HistorianService> log,
        TimeProvider time)
    {
        _repository = repository;
        _options = options.Value;
        _log = log;
        _time = time;

        var defaultMode = SamplingVocabulary.TryParseMode(_options.DefaultSamplingMode, out var parsed)
            ? parsed
            : SamplingMode.OnChange;
        _defaultPolicy = new SamplingPolicy(
            defaultMode,
            _options.DefaultSamplingIntervalMilliseconds,
            _options.DefaultDeadband).Normalized();

        _signalPolicies = new Dictionary<string, SamplingPolicy>(StringComparer.Ordinal);
        foreach (var configured in _options.SignalPolicies)
        {
            var mode = SamplingVocabulary.TryParseMode(configured.Mode, out var parsedMode)
                ? parsedMode
                : SamplingMode.OnChange;
            _signalPolicies[PolicyKey(configured.EquipmentId, configured.SignalId)] =
                new SamplingPolicy(mode, configured.IntervalMilliseconds, configured.Deadband).Normalized();
        }
    }

    public bool Enabled => _options.Enabled;

    public SamplingPolicy ResolvePolicy(string equipmentId, string signalId) =>
        _signalPolicies.TryGetValue(PolicyKey(equipmentId, signalId), out var policy)
            ? policy
            : _defaultPolicy;

    public IReadOnlyList<HistorianSignalPolicyDto> DescribePolicies()
    {
        var list = new List<HistorianSignalPolicyDto>
        {
            new("*", "*", SamplingVocabulary.ToWire(_defaultPolicy.Mode),
                _defaultPolicy.IntervalMilliseconds, _defaultPolicy.Deadband),
        };
        list.AddRange(_signalPolicies.Select(pair =>
        {
            var (equipmentId, signalId) = SplitKey(pair.Key);
            return new HistorianSignalPolicyDto(
                equipmentId, signalId, SamplingVocabulary.ToWire(pair.Value.Mode),
                pair.Value.IntervalMilliseconds, pair.Value.Deadband);
        }));
        return list;
    }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled) return;
        await _repository.EnsureIndexesAsync(cancellationToken);
    }

    // ── Ingestion ───────────────────────────────────────────────────

    public async Task<HistorianIngestResultDto> IngestTelemetryAsync(
        IngestTelemetryBatchRequest request,
        string? headerSourceId,
        string? headerCorrelationId = null,
        CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled) return Disabled("telemetry");

        var samples = request.Samples;
        if (samples is null || samples.Count == 0)
            return RejectAll("telemetry", 0, "samples must contain at least one item");

        if (samples.Count > _options.MaxBatchSize)
            return RejectAll("telemetry", samples.Count, $"batch of {samples.Count} exceeds the {_options.MaxBatchSize} sample limit");

        var now = _time.GetUtcNow().UtcDateTime;
        var sourceId = string.IsNullOrWhiteSpace(request.SourceId) ? headerSourceId : request.SourceId;
        var rate = _rateLimiter.TryConsume(
            sourceId ?? "anonymous",
            samples.Count,
            _options.MaxBatchesPerMinutePerSource,
            _options.MaxSamplesPerMinutePerSource,
            now);
        if (!rate.Allowed)
        {
            return new HistorianIngestResultDto(0, 0, 0, samples.Count, true, false, "rate-limited", [rate.Reason ?? "rate limit exceeded"]);
        }

        var diagnostics = new List<string>();
        var accepted = new List<TelemetrySample>();
        var rejected = 0;
        var sampled = 0;
        var dropped = 0;

        foreach (var requestSample in samples)
        {
            if (!HistorianDocumentMapper.TryMapSample(requestSample, now, out var document, out var error))
            {
                rejected++;
                AddDiagnostic(diagnostics, error);
                continue;
            }

            document!.CorrelationId ??= string.IsNullOrWhiteSpace(headerCorrelationId) ? null : headerCorrelationId;
            var policy = ResolvePolicy(document.EquipmentId, document.SignalId);
            var key = PolicyKey(document.EquipmentId, document.SignalId);
            var state = _sampling.GetOrAdd(key, SamplingState.Empty);
            var value = document.ValueType == Fabrik3D.Domain.Signals.SignalDataType.String
                ? (object?)document.TextValue
                : document.NumericValue;
            var decision = SamplingDecisionEngine.Evaluate(policy, state, value, document.Quality, document.TimestampUtc);

            if (!decision.Emit)
            {
                dropped++;
                continue;
            }

            _sampling[key] = decision.NextState;
            sampled++;
            accepted.Add(document);
        }

        Interlocked.Add(ref _rejectedSamples, rejected);

        if (accepted.Count == 0)
        {
            return new HistorianIngestResultDto(0, sampled, dropped, rejected, true, false, "accepted", diagnostics);
        }

        var stored = await TryInsertWithRetryAsync(
            () => _repository.InsertSamplesAsync(accepted, cancellationToken),
            accepted.Count,
            "telemetry",
            cancellationToken);

        if (!stored)
        {
            Interlocked.Add(ref _droppedSamples, accepted.Count);
            diagnostics.Add($"storage unavailable; {accepted.Count} sampled documents were dropped");
            return new HistorianIngestResultDto(0, sampled, dropped + accepted.Count, rejected, true, true, "degraded", diagnostics);
        }

        Interlocked.Add(ref _acceptedSamples, accepted.Count);
        return new HistorianIngestResultDto(accepted.Count, sampled, dropped, rejected, true, false, "accepted", diagnostics);
    }

    public async Task<HistorianIngestResultDto> IngestEventsAsync(
        IngestHistorizedEventBatchRequest request,
        string? headerSourceId,
        string? headerCorrelationId = null,
        CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled) return Disabled("event");

        var events = request.Events;
        if (events is null || events.Count == 0)
            return RejectAll("event", 0, "events must contain at least one item");

        if (events.Count > _options.MaxEventBatchSize)
            return RejectAll("event", events.Count, $"batch of {events.Count} exceeds the {_options.MaxEventBatchSize} event limit");

        var now = _time.GetUtcNow().UtcDateTime;
        var sourceId = string.IsNullOrWhiteSpace(request.SourceId) ? headerSourceId : request.SourceId;
        var rate = _rateLimiter.TryConsume(
            sourceId ?? "anonymous",
            events.Count,
            _options.MaxBatchesPerMinutePerSource,
            _options.MaxSamplesPerMinutePerSource,
            now);
        if (!rate.Allowed)
        {
            return new HistorianIngestResultDto(0, 0, 0, events.Count, true, false, "rate-limited", [rate.Reason ?? "rate limit exceeded"]);
        }

        var diagnostics = new List<string>();
        var accepted = new List<HistorizedEvent>();
        var rejected = 0;

        foreach (var requestEvent in events)
        {
            if (!HistorianDocumentMapper.TryMapEvent(requestEvent, _options.MaxPayloadLength, now, out var document, out var error))
            {
                rejected++;
                AddDiagnostic(diagnostics, error);
                continue;
            }
            document!.CorrelationId ??= string.IsNullOrWhiteSpace(headerCorrelationId) ? null : headerCorrelationId;
            accepted.Add(document);
        }

        Interlocked.Add(ref _rejectedEvents, rejected);

        if (accepted.Count == 0)
        {
            return new HistorianIngestResultDto(0, 0, 0, rejected, true, false, "accepted", diagnostics);
        }

        var stored = await TryInsertWithRetryAsync(
            () => _repository.InsertEventsAsync(accepted, cancellationToken),
            accepted.Count,
            "event",
            cancellationToken);

        if (!stored)
        {
            diagnostics.Add($"storage unavailable; {accepted.Count} accepted documents were dropped");
            return new HistorianIngestResultDto(0, 0, 0, rejected, true, true, "degraded", diagnostics);
        }

        Interlocked.Add(ref _acceptedEvents, accepted.Count);
        return new HistorianIngestResultDto(accepted.Count, 0, 0, rejected, true, false, "accepted", diagnostics);
    }

    // ── Queries ─────────────────────────────────────────────────────

    public async Task<HistorianPageDto<TelemetrySampleDto>> QuerySamplesAsync(
        TelemetrySampleQuery query,
        CancellationToken cancellationToken = default)
    {
        var (skip, limit) = HistorianQueryBuilder.NormalizePage(query.Skip, query.Limit, _options.MaxQueryPageSize);
        if (!_options.Enabled)
            return new HistorianPageDto<TelemetrySampleDto>([], 0, skip, limit);

        try
        {
            var normalized = query with { Skip = skip, Limit = limit };
            var items = await _repository.QuerySamplesAsync(normalized, _options.MaxQueryPageSize);
            var total = await _repository.CountSamplesAsync(normalized);
            return new HistorianPageDto<TelemetrySampleDto>(
                items.Select(HistorianDocumentMapper.ToDto).ToList(), total, skip, limit);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogWarning(ex, "[Historian] telemetry query degraded");
            return new HistorianPageDto<TelemetrySampleDto>([], 0, skip, limit);
        }
    }

    public async Task<HistorianPageDto<HistorizedEventDto>> QueryEventsAsync(
        HistorizedEventQuery query,
        CancellationToken cancellationToken = default)
    {
        var (skip, limit) = HistorianQueryBuilder.NormalizePage(query.Skip, query.Limit, _options.MaxQueryPageSize);
        if (!_options.Enabled)
            return new HistorianPageDto<HistorizedEventDto>([], 0, skip, limit);

        try
        {
            var normalized = query with { Skip = skip, Limit = limit };
            var items = await _repository.QueryEventsAsync(normalized, _options.MaxQueryPageSize);
            var total = await _repository.CountEventsAsync(normalized);
            return new HistorianPageDto<HistorizedEventDto>(
                items.Select(HistorianDocumentMapper.ToDto).ToList(), total, skip, limit);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogWarning(ex, "[Historian] event query degraded");
            return new HistorianPageDto<HistorizedEventDto>([], 0, skip, limit);
        }
    }

    public async Task<HistorianStatusDto> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        long samples = 0, events = 0, storage = 0;
        if (_options.Enabled)
        {
            try
            {
                samples = await _repository.CountSamplesAsync(new TelemetrySampleQuery());
                events = await _repository.CountEventsAsync(new HistorizedEventQuery());
                storage = await _repository.EstimateStorageBytesAsync(cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogWarning(ex, "[Historian] status partially degraded");
            }
        }

        return new HistorianStatusDto(
            _options.Enabled,
            _options.Enabled && _options.RetentionEnabled,
            HistorianSchema.Version,
            samples,
            events,
            storage,
            _sampling.Count,
            _options.RetentionMaxAgeDays,
            _options.RetentionMaxSamplesPerSignal,
            _options.RetentionMaxEventDocuments,
            _lastPrunedAtUtc,
            Interlocked.Read(ref _lastPruneDeleted),
            DescribePolicies().ToList());
    }

    // ── Pruning ─────────────────────────────────────────────────────

    public async Task<HistorianPruneResult> PruneAsync(DateTime nowUtc, CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled || !_options.RetentionEnabled) return new HistorianPruneResult(0, null);

        try
        {
            var deleted = 0L;
            var cutoff = RetentionMath.ComputeCutoffUtc(nowUtc, _options.RetentionMaxAgeDays);
            deleted += await _repository.PruneSamplesByAgeAsync(cutoff, cancellationToken);
            deleted += await _repository.PruneEventsByAgeAsync(cutoff, cancellationToken);
            deleted += await _repository.PruneSamplesToPerSignalCapAsync(_options.RetentionMaxSamplesPerSignal, cancellationToken);
            deleted += await _repository.PruneEventsToCapAsync(_options.RetentionMaxEventDocuments, cancellationToken);

            _lastPrunedAtUtc = nowUtc;
            Interlocked.Exchange(ref _lastPruneDeleted, deleted);
            _rateLimiter.EvictExpired(nowUtc);

            if (deleted > 0) _log.LogInformation("[Historian] pruned {Deleted} documents", deleted);
            return new HistorianPruneResult(deleted, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogError(ex, "[Historian] prune failed; policy bounds were not exceeded");
            return new HistorianPruneResult(0, ex.Message);
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────

    private async Task<bool> TryInsertWithRetryAsync(Func<Task> insert, int count, string kind, CancellationToken ct)
    {
        try
        {
            await insert();
            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "[Historian] {Kind} insert of {Count} documents failed; retrying once", kind, count);
        }

        try
        {
            await insert();
            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "[Historian] {Kind} insert of {Count} documents failed after retry; dropping", kind, count);
            return false;
        }
    }

    private static HistorianIngestResultDto Disabled(string kind) =>
        new(0, 0, 0, 0, false, false, "disabled", [$"historian is disabled; {kind} was not stored"]);

    private static HistorianIngestResultDto RejectAll(string kind, int rejected, string diagnostic) =>
        new(0, 0, 0, rejected, true, false, "rejected", [diagnostic]);

    private static void AddDiagnostic(List<string> diagnostics, string? message)
    {
        if (diagnostics.Count >= MaxDiagnostics || message is null) return;
        diagnostics.Add(message);
    }

    private static string PolicyKey(string equipmentId, string signalId) =>
        $"{equipmentId}\u001f{signalId}";

    private static (string EquipmentId, string SignalId) SplitKey(string key)
    {
        var index = key.IndexOf('\u001f');
        return index < 0 ? (key, string.Empty) : (key[..index], key[(index + 1)..]);
    }
}
