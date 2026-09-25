import { describe, expect, it } from 'vitest'
import { applyOverlays } from './overlays'
import { OVERLAY_FAULT_CATALOG } from './overlayCatalog'
import { OVERLAY_FAULT_TYPES, type FaultOverlay } from './types'

/**
 * Recorded performance bound for overlay evaluation.
 *
 * The whole overlay catalog is active on one signal and evaluated for 10 000
 * ticks. The threshold is deliberately generous so this is a regression guard
 * rather than a brittle micro-benchmark; the measured per-tick overhead is
 * reported for evidence. Decision: overlay evaluation must stay under 50 µs per
 * signal per tick on the reference developer machine.
 */
describe('overlay evaluation performance budget', () => {
  function fullCatalogOverlays(signalId: string): FaultOverlay[] {
    return OVERLAY_FAULT_CATALOG.map((definition, index) => ({
      id: `overlay-${definition.type}`,
      type: definition.type,
      layer: definition.layer,
      severity: definition.severity,
      source: 'instructor',
      equipmentId: 'cnc-1',
      signalIds: [signalId],
      seed: index + 1,
      startedAt: '2026-01-01T08:00:00.000Z',
      sessionId: 's',
      correlationId: 'c',
    }))
  }

  it('evaluates the full overlay catalog per signal per tick within the recorded bound', () => {
    const signalId = 'cnc-1.SpindleSpeed'
    const overlays = fullCatalogOverlays(signalId)
    expect(new Set(overlays.map((overlay) => overlay.type)).size).toBe(OVERLAY_FAULT_TYPES.length)

    const iterations = 10_000
    const start = performance.now()
    for (let tick = 0; tick < iterations; tick++) {
      applyOverlays(overlays, 12_000, 'good', {
        signalId, tick, nowMs: 1_700_000_000_000 + tick, safeValue: 0, numeric: true,
      }, new Map())
    }
    const elapsedMs = performance.now() - start
    const perTickUs = (elapsedMs / iterations) * 1_000

    expect(perTickUs).toBeLessThan(50)
    // eslint-disable-next-line no-console
    console.info(`[faults] overlay evaluation ${perTickUs.toFixed(3)} µs/signal/tick over the full ${OVERLAY_FAULT_TYPES.length}-class catalog`)
  })
})
