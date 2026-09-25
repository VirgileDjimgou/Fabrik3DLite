import { describe, expect, it } from 'vitest'
import { reconstructCell } from './reconstruction'
import type { ReconstructionInput, ReconstructionRecord, TrajectorySample } from './types'
import { TIME_TRAVEL_SCHEMA_VERSION } from './types'

/**
 * Recorded reconstruction window performance (S41).
 *
 * Builds a documented finite window (5,000 records + 1,000 trajectory samples)
 * and reconstructs it at 200 target times. The regression bound is deliberately
 * loose; the measured value is printed for evidence and recorded in
 * `docs/architecture/TIME_TRAVEL.md`.
 */
const RECORD_COUNT = 5_000
const TRAJECTORY_COUNT = 1_000
const TARGET_COUNT = 200
const BOUND_MS = 4_000

function buildWindow(): ReconstructionInput {
  const base = Date.parse('2026-01-01T08:00:00.000Z')
  const records: ReconstructionRecord[] = Array.from({ length: RECORD_COUNT }, (_, index) => ({
    sequence: index + 1,
    timestamp: new Date(base + index * 10).toISOString(),
    kind: index % 5 === 0 ? 'state-transition' : 'telemetry',
    source: 'simulator',
    severity: 'info',
    sessionId: 'perf',
    equipmentId: index % 2 === 0 ? 'cnc-1' : 'robot-1',
    correlationId: `c-${index}`,
    payload: index % 5 === 0
      ? { domain: 'workflow', to: `PHASE_${index % 20}`, phase: `PHASE_${index % 20}`, progress: (index % 100) / 100 }
      : { signalId: `signal-${index % 50}`, value: index, quality: 'good' },
  }))
  const trajectory: TrajectorySample[] = Array.from({ length: TRAJECTORY_COUNT }, (_, index) => ({
    timestamp: new Date(base + index * 50).toISOString(),
    joints: [index * 0.001, index * 0.002, index * 0.003, 0, 0, 0],
  }))
  return { schemaVersion: TIME_TRAVEL_SCHEMA_VERSION, sessionId: 'perf', source: 'local-timeline', records, trajectory, authority: [] }
}

describe('time-travel reconstruction performance', () => {
  it(`reconstructs ${TARGET_COUNT} targets across a ${RECORD_COUNT}-record window under ${BOUND_MS} ms`, () => {
    const input = buildWindow()
    const base = Date.parse('2026-01-01T08:00:00.000Z')
    const span = RECORD_COUNT * 10

    const started = performance.now()
    for (let index = 0; index < TARGET_COUNT; index += 1) {
      const target = new Date(base + Math.floor((span * index) / TARGET_COUNT)).toISOString()
      reconstructCell(input, target)
    }
    const elapsed = performance.now() - started

    // Recorded measurement for the sprint evidence; not a hardware-independent guarantee.
    console.log(`[time-travel] ${TARGET_COUNT} reconstructions of a ${RECORD_COUNT}-record window in ${elapsed.toFixed(1)} ms (${(elapsed / TARGET_COUNT).toFixed(2)} ms/reconstruction)`)
    expect(elapsed).toBeLessThan(BOUND_MS)
  })
})
