import type { InstructorMetricsDto, TrainingActionDto } from '@fabrik3d/contracts'

/**
 * Framework-free presentation helpers for the instructor dashboard (S45).
 *
 * Keeping the comparison, formatting and tone decisions here makes them deterministic and unit
 * testable without mounting components. No assessment logic is re-implemented: the score and its
 * criteria always come from the server; these helpers only compare reported evidence and format it.
 */

export type StatusTone = 'normal' | 'pending' | 'success' | 'warning' | 'fault' | 'offline'

/** Semantic status tone for a stored session status. Colour communicates status, not decoration. */
export function sessionStatusTone(status: string): StatusTone {
  switch (status.toLowerCase()) {
    case 'completed': return 'success'
    case 'failed': return 'fault'
    case 'abandoned': return 'warning'
    case 'running': return 'pending'
    default: return 'normal'
  }
}

/** Compact, locale-independent duration: 45s, 3m 05s, 1h 02m. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0s'
  const seconds = Math.round(totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(remainder).padStart(2, '0')}s`
  return `${remainder}s`
}

/** Elapsed seconds of a session, using the end time when the session has finished. */
export function elapsedSeconds(startedAtUtc: string, endedAtUtc: string | null | undefined, now = Date.now()): number {
  const start = Date.parse(startedAtUtc)
  if (Number.isNaN(start)) return 0
  const end = endedAtUtc ? Date.parse(endedAtUtc) : now
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 1000))
}

/** Completion rate (0..1) rendered as a whole-percent teaching metric. */
export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return '0%'
  return `${Math.round(rate * 100)}%`
}

/** Short deterministic date/time label; falls back to the raw value when unparsable. */
export function formatDateTime(value: string | null | undefined, locale = 'en-GB'): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export type ComparisonStatus = 'satisfied' | 'incorrect' | 'missing'

export interface ActionComparison {
  index: number
  expected: string
  matchedActionId: string | null
  status: ComparisonStatus
}

/**
 * Compares the expected action vocabulary declared at session start with the reported observed
 * actions. Matching is ordinal and order-independent; each observed action can satisfy at most one
 * expectation. An observed action already marked incorrect for an expectation yields 'incorrect'
 * rather than a false 'satisfied'.
 */
export function compareExpectedVsObserved(
  expected: readonly string[],
  actions: readonly TrainingActionDto[],
): ActionComparison[] {
  const observed = actions.filter((action) => action.role === 'observed')
  const used = new Set<string>()

  return expected.map((token, index) => {
    const hit = observed.find((action) =>
      !used.has(action.id)
      && (action.expectedActionId === token || action.type === token))
    if (!hit) {
      return { index, expected: token, matchedActionId: null, status: 'missing' as ComparisonStatus }
    }
    used.add(hit.id)
    return {
      index,
      expected: token,
      matchedActionId: hit.id,
      status: (hit.correctness === 'incorrect' ? 'incorrect' : 'satisfied') as ComparisonStatus,
    }
  })
}

/** Observed actions that no expectation accounted for (extra/recovery/safety evidence). */
export function unexpectedObservedActions(
  expected: readonly string[],
  actions: readonly TrainingActionDto[],
): TrainingActionDto[] {
  const matched = new Set(
    compareExpectedVsObserved(expected, actions)
      .map((entry) => entry.matchedActionId)
      .filter((id): id is string => id !== null),
  )
  return actions.filter((action) => action.role === 'observed' && !matched.has(action.id))
}

export interface MetricCard {
  key: string
  value: string
  tone: StatusTone
}

/** The documented teaching metrics as display cards. Definitions live in INSTRUCTOR_DASHBOARD.md. */
export function metricCards(metrics: InstructorMetricsDto): MetricCard[] {
  return [
    { key: 'sessions', value: String(metrics.sessionCount), tone: 'normal' },
    { key: 'completionRate', value: formatPercent(metrics.completionRate), tone: metrics.completionRate >= 0.8 ? 'success' : 'warning' },
    { key: 'meanSession', value: formatDuration(metrics.meanSessionSeconds), tone: 'normal' },
    { key: 'meanDiagnosis', value: formatDuration(metrics.meanDiagnosisSeconds), tone: 'normal' },
    { key: 'incorrectActions', value: String(metrics.incorrectActionCount), tone: metrics.incorrectActionCount > 0 ? 'warning' : 'success' },
    { key: 'hints', value: String(metrics.hintCount), tone: metrics.hintCount > 0 ? 'warning' : 'success' },
    { key: 'faults', value: String(metrics.faultCount), tone: metrics.faultCount > 0 ? 'warning' : 'success' },
    { key: 'recoveries', value: String(metrics.recoveryActionCount), tone: 'normal' },
    { key: 'safetyViolations', value: String(metrics.safetyViolationCount), tone: metrics.safetyViolationCount > 0 ? 'fault' : 'success' },
  ]
}

export interface RankingRow {
  key: string
  count: number
  /** Share of the largest bucket, used to render a restrained bar. */
  ratio: number
}

/**
 * Converts a ranked metric list into display rows with a relative ratio in [0, 1]. The generated
 * OpenAPI element type marks its fields optional; a missing key/count is normalized rather than
 * rendered as "undefined".
 */
export function rankingRows(counts: readonly { key?: string; count?: number }[]): RankingRow[] {
  const normalized = counts.map((entry) => ({ key: entry.key ?? '', count: entry.count ?? 0 }))
  const max = normalized.reduce((current, entry) => Math.max(current, entry.count), 0)
  return normalized.map((entry) => ({
    key: entry.key,
    count: entry.count,
    ratio: max === 0 ? 0 : entry.count / max,
  }))
}

/** Sessions that the server allows to be restarted (anything not currently running). */
export function isRestartable(status: string): boolean {
  return status.toLowerCase() !== 'running'
}
