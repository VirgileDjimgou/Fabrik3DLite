import { describe, expect, it } from 'vitest'
import {
  BENCHMARK_PROFILE_MAP,
  BENCHMARK_PROFILE_NAMES,
  createBenchmarkMetrics,
  createGpuBenchmarkReport,
  describeGpuBenchmarkReport,
  resolveBenchmarkProfile,
  validateGpuBenchmarkReport,
  type GpuBenchmarkRun,
} from './gpuBenchmark'
import type { SimulatorFrameSummary } from './frameMetrics'
import type { RendererIdentity } from './acceleration'

function summary(overrides: Partial<SimulatorFrameSummary> = {}): SimulatorFrameSummary {
  return {
    sampleCount: 120,
    meanFrameMs: 16.7,
    p50FrameMs: 16.2,
    p95FrameMs: 20.5,
    p99FrameMs: 24.1,
    maxFrameMs: 30,
    estimatedFps: 59.9,
    lastDrawCalls: 384,
    lastTriangles: 4640,
    textureBytes: 0,
    textureCount: 0,
    heapUsedBytes: 123_456_789,
    acceleration: 'hardware',
    ...overrides,
  }
}

function identity(overrides: Partial<RendererIdentity> = {}): RendererIdentity {
  return {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)',
    unmaskedVendor: 'NVIDIA',
    unmaskedRenderer: 'NVIDIA GeForce RTX 4070',
    ...overrides,
  }
}

function run(acceleration: 'hardware' | 'software' | 'unknown', renderer = 'NVIDIA GeForce RTX 4070'): GpuBenchmarkRun {
  return {
    sceneId: 'cnc-machine-tending',
    sceneLabel: 'CNC machine tending',
    metrics: {
      renderer,
      resolution: '1920x1080',
      requestedProfile: 'Quality',
      qualityProfile: 'high',
      frameCount: 180,
      fps: 59.9,
      frameP50Ms: 16.2,
      frameP95Ms: 20.5,
      frameP99Ms: 24.1,
      drawCalls: 384,
      triangles: 4640,
      textureCount: 0,
      textureBytes: 0,
      heapUsedBytes: 123_456_789,
      loadDurationMs: 812,
      acceleration,
    },
  }
}

describe('resolveBenchmarkProfile', () => {
  it('maps the three documented profile names to the simulator quality presets', () => {
    expect(BENCHMARK_PROFILE_NAMES).toEqual(['Performance', 'Balanced', 'Quality'])
    expect(resolveBenchmarkProfile('Performance')).toEqual({ requested: 'Performance', resolved: 'Performance', quality: BENCHMARK_PROFILE_MAP.Performance, fallback: false })
    expect(resolveBenchmarkProfile('balanced').quality).toBe('medium')
    expect(resolveBenchmarkProfile('QUALITY').quality).toBe('high')
  })

  it('falls back to a supported measured profile and records the fallback for an unsupported request', () => {
    const resolved = resolveBenchmarkProfile('Ultra')
    expect(resolved.resolved).toBe('Balanced')
    expect(resolved.quality).toBe('medium')
    expect(resolved.fallback).toBe(true)
  })
})

describe('createBenchmarkMetrics', () => {
  it('records the full metric set and classifies hardware from the observed renderer', () => {
    const metrics = createBenchmarkMetrics({
      rendererIdentity: identity(),
      resolution: '1920x1080',
      requestedProfile: 'Quality',
      resolvedProfile: 'high',
      summary: summary(),
      loadDurationMs: 812,
    })
    expect(metrics.renderer).toBe('NVIDIA GeForce RTX 4070')
    expect(metrics.qualityProfile).toBe('high')
    expect(metrics.frameP50Ms).toBe(16.2)
    expect(metrics.frameP95Ms).toBe(20.5)
    expect(metrics.frameP99Ms).toBe(24.1)
    expect(metrics.drawCalls).toBe(384)
    expect(metrics.triangles).toBe(4640)
    expect(metrics.textureCount).toBe(0)
    expect(metrics.heapUsedBytes).toBe(123_456_789)
    expect(metrics.loadDurationMs).toBe(812)
    expect(metrics.acceleration).toBe('hardware')
  })

  it('classifies SwiftShader as software, never hardware', () => {
    const metrics = createBenchmarkMetrics({
      rendererIdentity: identity({ unmaskedVendor: 'Google Inc.', unmaskedRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' }),
      resolution: '1280x800',
      requestedProfile: 'Balanced',
      resolvedProfile: 'medium',
      summary: summary(),
      loadDurationMs: 1500,
    })
    expect(metrics.acceleration).toBe('software')
  })
})

describe('createGpuBenchmarkReport', () => {
  it('marks hardware runs as GPU evidence', () => {
    const report = createGpuBenchmarkReport({ runtime: 'test', browser: 'Chromium', runs: [run('hardware')] })
    expect(report.gpuEvidence).toBe(true)
    expect(report.nonClaims).toEqual([])
    expect(validateGpuBenchmarkReport(report)).toEqual([])
  })

  it('never marks a software run as GPU evidence and records the non-claim', () => {
    const report = createGpuBenchmarkReport({ runtime: 'test', browser: 'Chromium (headless)', runs: [run('software', 'ANGLE SwiftShader')] })
    expect(report.gpuEvidence).toBe(false)
    expect(report.nonClaims.join(' ')).toMatch(/software rendering/i)
    expect(describeGpuBenchmarkReport(report)).toMatch(/not a GPU result/)
  })

  it('rejects a forged report that claims GPU evidence for a software run', () => {
    const forged = {
      schemaVersion: '1.0',
      recordedAt: '2026-10-02T00:00:00Z',
      runtime: 'test',
      browser: 'Chromium',
      referenceHost: 'documented-reference-machine',
      runs: [run('software', 'ANGLE SwiftShader')],
      gpuEvidence: true,
      accelerationClasses: ['software'],
      nonClaims: [],
    }
    expect(validateGpuBenchmarkReport(forged).join(' ')).toMatch(/gpuEvidence is true/)
  })

  it('rejects a report with a missing metric or an invalid quality profile', () => {
    const invalid = JSON.parse(JSON.stringify(createGpuBenchmarkReport({ runtime: 'test', browser: 'Chromium', runs: [run('hardware')] })))
    delete invalid.runs[0].metrics.frameP99Ms
    invalid.runs[0].metrics.qualityProfile = 'ultra'
    const problems = validateGpuBenchmarkReport(invalid)
    expect(problems).toContain('runs[0].metrics.frameP99Ms is missing')
    expect(problems.some((problem) => problem.includes('qualityProfile is invalid'))).toBe(true)
  })
})
