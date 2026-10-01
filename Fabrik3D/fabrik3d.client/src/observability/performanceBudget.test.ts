import { describe, expect, it } from 'vitest'
import type { SimulatorFrameSummary } from './frameMetrics'
import { UNKNOWN_RENDERER_IDENTITY, type RendererIdentity } from './acceleration'
import {
  createPerformanceRunResult,
  describePerformanceRunResult,
  evaluateBudget,
  evaluateBudgets,
  validatePerformanceRunResult,
  type PerformanceBudget,
} from './performanceBudget'

function summary(overrides: Partial<SimulatorFrameSummary> = {}): SimulatorFrameSummary {
  return {
    sampleCount: 120,
    meanFrameMs: 16,
    p50FrameMs: 15,
    p95FrameMs: 28,
    p99FrameMs: 40,
    maxFrameMs: 55,
    estimatedFps: 62.5,
    lastDrawCalls: 37,
    lastTriangles: 1004,
    textureBytes: 85_160,
    textureCount: 3,
    heapUsedBytes: 12_000_000,
    acceleration: 'unknown',
    ...overrides,
  }
}

const HARDWARE_IDENTITY: RendererIdentity = {
  vendor: 'WebKit WebGL',
  renderer: 'WebKit WebGL',
  unmaskedVendor: 'NVIDIA',
  unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11)',
}

describe('performance budget evaluation', () => {
  it('passes a metric within its max bound', () => {
    const result = evaluateBudget(summary(), { id: 'p95', metric: 'p95FrameMs', max: 33 })
    expect(result.passed).toBe(true)
    expect(result.reason).toBe('within-budget')
  })

  it('fails a metric that exceeds its max bound', () => {
    const result = evaluateBudget(summary(), { id: 'p95', metric: 'p95FrameMs', max: 20 })
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('exceeds-max')
  })

  it('fails a metric that falls below its min bound', () => {
    const result = evaluateBudget(summary(), { id: 'fps', metric: 'estimatedFps', min: 60 })
    expect(result.passed).toBe(true)
    expect(evaluateBudget(summary({ estimatedFps: 10 }), { id: 'fps', metric: 'estimatedFps', min: 60 }).reason).toBe('below-min')
  })

  it('reports an overall failure list but keeps every individual result', () => {
    const budgets: PerformanceBudget[] = [
      { id: 'p95', metric: 'p95FrameMs', max: 33 },
      { id: 'drawcalls', metric: 'lastDrawCalls', max: 30 },
    ]
    const evaluation = evaluateBudgets(summary(), budgets)
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failed).toEqual(['drawcalls'])
    expect(evaluation.results).toHaveLength(2)
  })
})

describe('machine-readable run result', () => {
  it('classifies acceleration from the renderer identity and reports unknown without one', () => {
    const hardware = createPerformanceRunResult({
      runtime: 'node 24.18.0',
      browser: 'Playwright Chromium',
      rendererIdentity: HARDWARE_IDENTITY,
      resolution: '1920x1080',
      qualityProfile: 'high',
      hardwareClass: 'developer-reference',
      sceneId: 'hero-reference-cell',
      seed: 42,
      summary: summary({ acceleration: 'hardware' }),
      budgets: [{ id: 'p95', metric: 'p95FrameMs', max: 33 }],
    })
    expect(hardware.metadata.acceleration).toBe('hardware')
    expect(hardware.metadata.renderer).toContain('GeForce')
    expect(validatePerformanceRunResult(hardware)).toEqual([])
    expect(describePerformanceRunResult(hardware)).toContain('hardware-accelerated')

    const unknown = createPerformanceRunResult({
      runtime: 'node 24.18.0',
      browser: 'headless',
      rendererIdentity: UNKNOWN_RENDERER_IDENTITY,
      resolution: '2560x1440',
      qualityProfile: 'medium',
      sceneId: 'hero-reference-cell',
      seed: 1,
      summary: summary(),
      budgets: [],
    })
    expect(unknown.metadata.acceleration).toBe('unknown')
    expect(unknown.metadata.hardwareClass).toBe('unknown')
    expect(validatePerformanceRunResult(unknown)).not.toEqual([])
  })

  it('rejects a fabricated hardware claim without a renderer identity', () => {
    const forged = {
      schemaVersion: '1.0',
      metadata: {
        recordedAt: new Date().toISOString(),
        runtime: 'node',
        browser: 'browser',
        renderer: '',
        rendererIdentity: UNKNOWN_RENDERER_IDENTITY,
        acceleration: 'hardware',
        resolution: '1920x1080',
        qualityProfile: 'high',
        hardwareClass: 'developer-reference',
        sceneId: 'hero-reference-cell',
        seed: 1,
      },
      summary: summary(),
      budgets: { passed: true, results: [], failed: [] },
    }
    const problems = validatePerformanceRunResult(forged)
    expect(problems.some((problem) => problem.includes('renderer identity'))).toBe(true)
  })

  it('validates required schema fields', () => {
    expect(validatePerformanceRunResult(null)).toEqual(['result is not an object'])
    const problems = validatePerformanceRunResult({ schemaVersion: '0.9' })
    expect(problems.some((problem) => problem.includes('schemaVersion'))).toBe(true)
    expect(problems).toContain('metadata is missing')
  })
})
