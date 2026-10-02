/**
 * Manual hardware GPU/scene benchmark schema (S62).
 *
 * This module is pure data logic: it describes the quality profiles a benchmark run may request,
 * the full metric set every run records and the honest evidence classification. It reuses the S56
 * acceleration classification and never upgrades a software or unknown renderer to GPU evidence.
 *
 * The actual measurement lives in `e2e/gpu-benchmark.spec.ts`, which is run manually (a headed
 * browser on real hardware) and never part of the mandatory visual gate.
 */

import type { SimulatorFrameSummary } from './frameMetrics'
import { classifyAcceleration, hasRendererIdentity, type AccelerationClass, type RendererIdentity } from './acceleration'

/** User-facing profile names mapped to the simulator's internal quality presets. */
export const BENCHMARK_PROFILE_MAP = {
  Performance: 'low',
  Balanced: 'medium',
  Quality: 'high',
} as const

export type BenchmarkProfileName = keyof typeof BENCHMARK_PROFILE_MAP
export type BenchmarkQuality = (typeof BENCHMARK_PROFILE_MAP)[BenchmarkProfileName]

export const BENCHMARK_PROFILE_NAMES = Object.keys(BENCHMARK_PROFILE_MAP) as BenchmarkProfileName[]

export interface ResolvedBenchmarkProfile {
  requested: string
  resolved: BenchmarkProfileName
  quality: BenchmarkQuality
  /** True when the requested profile was not recognised and a supported profile was measured instead. */
  fallback: boolean
}

/**
 * Resolves a requested profile to a measured supported profile. An unsupported profile falls back to
 * the supported `Balanced` profile and records the fallback rather than silently claiming to have
 * measured the request.
 */
export function resolveBenchmarkProfile(requested: string): ResolvedBenchmarkProfile {
  const match = BENCHMARK_PROFILE_NAMES.find((name) => name.toLowerCase() === requested.trim().toLowerCase())
  if (match) return { requested, resolved: match, quality: BENCHMARK_PROFILE_MAP[match], fallback: false }
  return { requested, resolved: 'Balanced', quality: BENCHMARK_PROFILE_MAP.Balanced, fallback: true }
}

/** The full metric set recorded for one scene/profile run. */
export interface BenchmarkMetrics {
  renderer: string
  resolution: string
  requestedProfile: string
  qualityProfile: BenchmarkQuality
  /** Total frames observed in the measurement window. */
  frameCount: number
  fps: number
  frameP50Ms: number
  frameP95Ms: number
  frameP99Ms: number
  drawCalls: number
  triangles: number
  textureCount: number
  /** Estimated GPU texture memory in bytes (documented estimate; WebGL exposes no total GPU memory). */
  textureBytes: number
  /** JS heap used by the page where the browser exposes it; 0 when unavailable. */
  heapUsedBytes: number
  /** Wall-clock time from navigation to the ready marker, in milliseconds. */
  loadDurationMs: number
  acceleration: AccelerationClass
}

export interface GpuBenchmarkRun {
  sceneId: string
  sceneLabel: string
  metrics: BenchmarkMetrics
}

export interface GpuBenchmarkReport {
  schemaVersion: '1.0'
  recordedAt: string
  runtime: string
  browser: string
  /** Documented reference machine class; never a personal hostname. */
  referenceHost: string
  runs: GpuBenchmarkRun[]
  /** True only when every run was measured on a hardware-accelerated renderer with a real identity. */
  gpuEvidence: boolean
  accelerationClasses: AccelerationClass[]
  nonClaims: string[]
}

export interface CreateBenchmarkMetricsInput {
  rendererIdentity: RendererIdentity | null | undefined
  renderer?: string
  resolution: string
  requestedProfile: string
  resolvedProfile: BenchmarkQuality
  summary: SimulatorFrameSummary
  loadDurationMs: number
}

function resolveRendererString(identity: RendererIdentity | null | undefined, override?: string): string {
  if (override && override.trim().length > 0) return override.trim()
  if (!identity) return ''
  return identity.unmaskedRenderer || identity.renderer || identity.unmaskedVendor || identity.vendor || ''
}

/** Builds one metric set from a measured frame summary and the observed renderer identity. */
export function createBenchmarkMetrics(input: CreateBenchmarkMetricsInput): BenchmarkMetrics {
  const identity = input.rendererIdentity ?? undefined
  return {
    renderer: resolveRendererString(identity, input.renderer),
    resolution: input.resolution,
    requestedProfile: input.requestedProfile,
    qualityProfile: input.resolvedProfile,
    frameCount: input.summary.sampleCount,
    fps: input.summary.estimatedFps,
    frameP50Ms: input.summary.p50FrameMs,
    frameP95Ms: input.summary.p95FrameMs,
    frameP99Ms: input.summary.p99FrameMs,
    drawCalls: input.summary.lastDrawCalls,
    triangles: input.summary.lastTriangles,
    textureCount: input.summary.textureCount,
    textureBytes: input.summary.textureBytes,
    heapUsedBytes: input.summary.heapUsedBytes,
    loadDurationMs: input.loadDurationMs,
    acceleration: classifyAcceleration(identity),
  }
}

export interface CreateGpuBenchmarkReportInput {
  runtime: string
  browser: string
  referenceHost?: string
  runs: GpuBenchmarkRun[]
  recordedAt?: string
}

/**
 * Packages measured runs as a versioned report. `gpuEvidence` is true only when every run is
 * hardware-classified and carries a renderer identity, so a software rasterizer can never be
 * presented as GPU proof.
 */
export function createGpuBenchmarkReport(input: CreateGpuBenchmarkReportInput): GpuBenchmarkReport {
  const accelerationClasses = [...new Set(input.runs.map((run) => run.metrics.acceleration))]
  const gpuEvidence =
    input.runs.length > 0 &&
    input.runs.every((run) => run.metrics.acceleration === 'hardware' && run.metrics.renderer.trim().length > 0)

  const nonClaims: string[] = []
  if (accelerationClasses.includes('software')) {
    nonClaims.push('At least one run used software rendering and is not a GPU result.')
  }
  if (accelerationClasses.includes('unknown')) {
    nonClaims.push('At least one run had an unverified renderer identity and is not a GPU result.')
  }
  if (!gpuEvidence) {
    nonClaims.push('This report does not constitute GPU-accelerated evidence.')
  }

  return {
    schemaVersion: '1.0',
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    runtime: input.runtime,
    browser: input.browser,
    referenceHost: input.referenceHost ?? 'documented-reference-machine',
    runs: input.runs,
    gpuEvidence,
    accelerationClasses,
    nonClaims,
  }
}

const REQUIRED_METRIC_FIELDS: Array<keyof BenchmarkMetrics> = [
  'renderer',
  'resolution',
  'requestedProfile',
  'qualityProfile',
  'fps',
  'frameP50Ms',
  'frameP95Ms',
  'frameP99Ms',
  'drawCalls',
  'triangles',
  'textureCount',
  'heapUsedBytes',
  'loadDurationMs',
  'acceleration',
]

const VALID_QUALITY: BenchmarkQuality[] = ['low', 'medium', 'high']
const VALID_ACCELERATION: AccelerationClass[] = ['hardware', 'software', 'unknown']

/** Validates a report without trusting it; rejects over-claimed GPU evidence. */
export function validateGpuBenchmarkReport(value: unknown): string[] {
  const problems: string[] = []
  if (!value || typeof value !== 'object') return ['report is not an object']
  const report = value as Partial<GpuBenchmarkReport>
  if (report.schemaVersion !== '1.0') problems.push(`schemaVersion must be "1.0", got ${String(report.schemaVersion)}`)
  if (!Array.isArray(report.runs) || report.runs.length === 0) {
    problems.push('runs must be a non-empty array')
    return problems
  }

  let allHardware = true
  let allIdentified = true
  for (const [index, run] of report.runs.entries()) {
    if (!run || typeof run !== 'object') {
      problems.push(`runs[${index}] is not an object`)
      allHardware = false
      continue
    }
    if (typeof run.sceneId !== 'string' || run.sceneId.length === 0) problems.push(`runs[${index}].sceneId is missing`)
    const metrics = run.metrics
    if (!metrics || typeof metrics !== 'object') {
      problems.push(`runs[${index}].metrics is missing`)
      allHardware = false
      continue
    }
    for (const field of REQUIRED_METRIC_FIELDS) {
      const fieldValue = metrics[field]
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
        problems.push(`runs[${index}].metrics.${field} is missing`)
      }
    }
    if (!VALID_QUALITY.includes(metrics.qualityProfile as BenchmarkQuality)) {
      problems.push(`runs[${index}].metrics.qualityProfile is invalid: ${String(metrics.qualityProfile)}`)
    }
    if (!VALID_ACCELERATION.includes(metrics.acceleration as AccelerationClass)) {
      problems.push(`runs[${index}].metrics.acceleration is invalid: ${String(metrics.acceleration)}`)
    }
    if (metrics.acceleration !== 'hardware') allHardware = false
    if (typeof metrics.renderer !== 'string' || metrics.renderer.trim().length === 0) allIdentified = false
  }

  if (report.gpuEvidence === true && (!allHardware || !allIdentified)) {
    problems.push('gpuEvidence is true but a run is not hardware-accelerated with a renderer identity')
  }
  return problems
}

/** One-line honest summary; never stronger than the classification. */
export function describeGpuBenchmarkReport(report: GpuBenchmarkReport): string {
  const software = report.accelerationClasses.includes('software')
  return (
    `[gpu-benchmark] ${report.runs.length} run(s) ` +
    `acceleration=${report.accelerationClasses.join(',')} ` +
    `gpuEvidence=${report.gpuEvidence}${software ? ' (software rendering present; not a GPU result)' : ''}`
  )
}

/** Re-export for the benchmark spec and tests. */
export { hasRendererIdentity }
