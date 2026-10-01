/**
 * Performance budgets and machine-readable run results (S56).
 *
 * This module turns a measured frame summary into a pass/fail evaluation against recorded regression
 * budgets and packages it as a versioned, machine-readable result that carries the full environment
 * metadata (runtime, renderer identity, acceleration class, resolution, quality profile, hardware
 * class and seed). It is pure logic: it measures nothing itself and it never upgrades an unknown
 * renderer to `hardware`.
 */

import type { SimulatorFrameSummary } from './frameMetrics'
import {
  classifyAcceleration,
  describeAcceleration,
  hasRendererIdentity,
  type AccelerationClass,
  type RendererIdentity,
} from './acceleration'

export interface PerformanceBudget {
  id: string
  metric: NumericFrameMetric
  /** Maximum accepted value (inclusive). */
  max?: number
  /** Minimum accepted value (inclusive). */
  min?: number
  unit?: string
}

export type NumericFrameMetric =
  | 'meanFrameMs'
  | 'p50FrameMs'
  | 'p95FrameMs'
  | 'p99FrameMs'
  | 'maxFrameMs'
  | 'estimatedFps'
  | 'lastDrawCalls'
  | 'lastTriangles'
  | 'textureBytes'
  | 'textureCount'
  | 'heapUsedBytes'

export interface BudgetResult {
  id: string
  metric: NumericFrameMetric
  actual: number
  max?: number
  min?: number
  passed: boolean
  reason: 'within-budget' | 'exceeds-max' | 'below-min' | 'missing-metric'
}

export interface BudgetEvaluation {
  passed: boolean
  results: BudgetResult[]
  failed: string[]
}

/** Evaluates one budget against a numeric metric value. */
export function evaluateBudget(summary: SimulatorFrameSummary, budget: PerformanceBudget): BudgetResult {
  const actual = summary[budget.metric]
  if (typeof actual !== 'number' || !Number.isFinite(actual)) {
    return { id: budget.id, metric: budget.metric, actual: 0, max: budget.max, min: budget.min, passed: false, reason: 'missing-metric' }
  }
  if (budget.max !== undefined && actual > budget.max) {
    return { id: budget.id, metric: budget.metric, actual, max: budget.max, min: budget.min, passed: false, reason: 'exceeds-max' }
  }
  if (budget.min !== undefined && actual < budget.min) {
    return { id: budget.id, metric: budget.metric, actual, max: budget.max, min: budget.min, passed: false, reason: 'below-min' }
  }
  return { id: budget.id, metric: budget.metric, actual, max: budget.max, min: budget.min, passed: true, reason: 'within-budget' }
}

/** Evaluates every budget and reports an overall verdict plus the failed budget ids. */
export function evaluateBudgets(
  summary: SimulatorFrameSummary,
  budgets: readonly PerformanceBudget[],
): BudgetEvaluation {
  const results = budgets.map((budget) => evaluateBudget(summary, budget))
  const failed = results.filter((result) => !result.passed).map((result) => result.id)
  return { passed: failed.length === 0, results, failed }
}

/** Target hardware classes. Only classes with recorded measurements may be cited as validated. */
export const HARDWARE_CLASSES = ['developer-reference', 'mid-range-laptop', 'ci-software', 'unknown'] as const
export type HardwareClass = (typeof HARDWARE_CLASSES)[number]

export interface PerformanceRunMetadata {
  /** ISO-8601 timestamp of the run. */
  recordedAt: string
  /** Extended runtime identification, e.g. "node 24.18.0 / vitest 4.0.18". */
  runtime: string
  /** Browser or host identification, e.g. "Playwright Chromium 1.55 (headless)". */
  browser: string
  /** Renderer string actually observed. */
  renderer: string
  rendererIdentity: RendererIdentity
  acceleration: AccelerationClass
  /** Resolution string, e.g. "1920x1080". */
  resolution: string
  qualityProfile: 'low' | 'medium' | 'high'
  hardwareClass: HardwareClass
  sceneId: string
  /** Deterministic seed for reproducible workloads. */
  seed: number
}

export interface PerformanceRunResult {
  schemaVersion: '1.0'
  metadata: PerformanceRunMetadata
  summary: SimulatorFrameSummary
  budgets: BudgetEvaluation
}

export interface CreatePerformanceRunResultInput {
  runtime: string
  browser: string
  rendererIdentity?: RendererIdentity
  /** Optional explicit renderer override; defaults to the first non-empty identity string. */
  renderer?: string
  resolution: string
  qualityProfile: 'low' | 'medium' | 'high'
  hardwareClass?: HardwareClass
  sceneId: string
  seed: number
  summary: SimulatorFrameSummary
  budgets: readonly PerformanceBudget[]
  recordedAt?: string
}

function resolveRendererString(identity: RendererIdentity | undefined, override?: string): string {
  if (override && override.trim().length > 0) return override.trim()
  if (!identity) return ''
  return identity.unmaskedRenderer || identity.renderer || identity.unmaskedVendor || identity.vendor || ''
}

/**
 * Builds a versioned run result. When no renderer identity is available the acceleration is
 * `unknown` and the hardware class defaults to `unknown` rather than being assumed.
 */
export function createPerformanceRunResult(input: CreatePerformanceRunResultInput): PerformanceRunResult {
  const identity = input.rendererIdentity ?? {
    vendor: '',
    renderer: '',
    unmaskedVendor: '',
    unmaskedRenderer: '',
  }
  const acceleration = classifyAcceleration(identity)
  const hardwareClass =
    input.hardwareClass ??
    (acceleration === 'software' ? 'ci-software' : acceleration === 'hardware' ? 'unknown' : 'unknown')

  return {
    schemaVersion: '1.0',
    metadata: {
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      runtime: input.runtime,
      browser: input.browser,
      renderer: resolveRendererString(identity, input.renderer),
      rendererIdentity: identity,
      acceleration,
      resolution: input.resolution,
      qualityProfile: input.qualityProfile,
      hardwareClass,
      sceneId: input.sceneId,
      seed: input.seed,
    },
    summary: input.summary,
    budgets: evaluateBudgets(input.summary, input.budgets),
  }
}

const REQUIRED_METADATA_FIELDS: Array<keyof PerformanceRunMetadata> = [
  'recordedAt',
  'runtime',
  'browser',
  'rendererIdentity',
  'acceleration',
  'resolution',
  'qualityProfile',
  'hardwareClass',
  'sceneId',
  'seed',
]

/**
 * Validates a run result shape without trusting it. Returns a list of human-readable problems and
 * fails when acceleration is `hardware` but no renderer string is present (unverifiable claim).
 */
export function validatePerformanceRunResult(value: unknown): string[] {
  const problems: string[] = []
  if (!value || typeof value !== 'object') return ['result is not an object']
  const result = value as Partial<PerformanceRunResult>
  if (result.schemaVersion !== '1.0') problems.push(`schemaVersion must be "1.0", got ${String(result.schemaVersion)}`)

  const metadata = result.metadata
  if (!metadata || typeof metadata !== 'object') {
    problems.push('metadata is missing')
    return problems
  }
  for (const field of REQUIRED_METADATA_FIELDS) {
    const fieldValue = metadata[field]
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      problems.push(`metadata.${field} is missing`)
    }
  }
  if (!hasRendererIdentity(metadata.rendererIdentity)) {
    problems.push('metadata.rendererIdentity is empty; acceleration cannot be classified')
  }
  if (metadata.acceleration === 'hardware' && !hasRendererIdentity(metadata.rendererIdentity)) {
    problems.push('acceleration is "hardware" without a renderer identity')
  }
  if (!['hardware', 'software', 'unknown'].includes(metadata.acceleration as string)) {
    problems.push(`metadata.acceleration is not a known class: ${String(metadata.acceleration)}`)
  }
  if (!['low', 'medium', 'high'].includes(metadata.qualityProfile as string)) {
    problems.push(`metadata.qualityProfile is invalid: ${String(metadata.qualityProfile)}`)
  }
  if (!HARDWARE_CLASSES.includes(metadata.hardwareClass as HardwareClass)) {
    problems.push(`metadata.hardwareClass is invalid: ${String(metadata.hardwareClass)}`)
  }
  if (!result.summary || typeof result.summary !== 'object') problems.push('summary is missing')
  if (!result.budgets || typeof result.budgets !== 'object') problems.push('budgets are missing')
  return problems
}

/** One-line human summary, honest about acceleration. */
export function describePerformanceRunResult(result: PerformanceRunResult): string {
  const { metadata, summary, budgets } = result
  return (
    `[perf] ${metadata.qualityProfile} ${metadata.resolution} ${describeAcceleration(metadata.acceleration)} ` +
    `mean=${summary.meanFrameMs.toFixed(2)}ms p95=${summary.p95FrameMs.toFixed(2)}ms p99=${summary.p99FrameMs.toFixed(2)}ms ` +
    `budgets=${budgets.passed ? 'pass' : `fail(${budgets.failed.join(',')})`}`
  )
}
