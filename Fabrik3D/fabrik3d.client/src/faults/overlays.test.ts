import { describe, expect, it } from 'vitest'
import {
  OVERLAY_DEFAULTS,
  OVERLAY_PRECEDENCE,
  applyOverlays,
  createSeededRandom,
  hashString,
  overlaySignalSeed,
  seededSample,
} from './overlays'
import { OVERLAY_FAULT_CATALOG, getOverlayFaultDefinition, isOverlayFaultType } from './overlayCatalog'
import { OVERLAY_FAULT_TYPES, type FaultOverlay, type OverlayFaultType } from './types'

const NOW = Date.parse('2026-01-01T08:00:00.000Z')

function overlay(type: OverlayFaultType, overrides: Partial<FaultOverlay> = {}): FaultOverlay {
  return {
    id: `overlay-${type}`,
    type,
    layer: getOverlayFaultDefinition(type).layer,
    severity: getOverlayFaultDefinition(type).severity,
    source: 'instructor',
    equipmentId: 'conveyor-1',
    signalIds: ['conveyor-1.PhotoeyeStation'],
    seed: 42,
    startedAt: '2026-01-01T08:00:00.000Z',
    sessionId: 's',
    correlationId: 'c',
    ...overrides,
  }
}

function context(signalId = 'conveyor-1.PhotoeyeStation', tick = 0, numeric = false) {
  return { signalId, tick, nowMs: NOW, safeValue: false as const, numeric }
}

describe('overlay catalog', () => {
  it('documents every overlay fault class with EN/FR/DE text', () => {
    expect(OVERLAY_FAULT_CATALOG).toHaveLength(OVERLAY_FAULT_TYPES.length)
    for (const definition of OVERLAY_FAULT_CATALOG) {
      for (const locale of ['en', 'fr', 'de'] as const) {
        expect(definition.title[locale].length).toBeGreaterThan(0)
        expect(definition.description[locale].length).toBeGreaterThan(0)
        expect(definition.recoveryInstructions[locale].length).toBeGreaterThan(0)
      }
    }
  })

  it('classifies signal and equipment layers', () => {
    expect(getOverlayFaultDefinition('forced-true').layer).toBe('signal')
    expect(getOverlayFaultDefinition('actuator-jam').layer).toBe('equipment')
    expect(getOverlayFaultDefinition('noisy-analog').numericOnly).toBe(true)
    expect(getOverlayFaultDefinition('intermittent').stochastic).toBe(true)
  })

  it('recognizes only known overlay types', () => {
    expect(isOverlayFaultType('forced-true')).toBe(true)
    expect(isOverlayFaultType('collision-risk')).toBe(false)
    expect(isOverlayFaultType(42)).toBe(false)
  })
})

describe('seeded determinism', () => {
  it('reproduces the same sequence for the same seed', () => {
    const first = createSeededRandom(1234)
    const second = createSeededRandom(1234)
    const a = [first(), first(), first(), first()]
    const b = [second(), second(), second(), second()]
    expect(a).toEqual(b)
  })

  it('produces different sequences for different seeds', () => {
    const first = createSeededRandom(1)
    const second = createSeededRandom(2)
    expect(first()).not.toBe(second())
  })

  it('derives a stable per-signal seed', () => {
    const subject = overlay('noisy-analog')
    expect(overlaySignalSeed(subject, 'a')).toBe(overlaySignalSeed(subject, 'a'))
    expect(overlaySignalSeed(subject, 'a')).not.toBe(overlaySignalSeed(subject, 'b'))
    expect(hashString('abc')).toBe(hashString('abc'))
  })

  it('samples the same value for the same seed and tick', () => {
    expect(seededSample(7, 3)).toBe(seededSample(7, 3))
    expect(seededSample(7, 3)).not.toBe(seededSample(7, 4))
  })
})

describe('signal fault classes', () => {
  it('forced-true overrides a boolean to true', () => {
    const result = applyOverlays([overlay('forced-true')], false, 'good', context())
    expect(result.value).toBe(true)
    expect(result.modified).toBe(true)
  })

  it('forced-false overrides a boolean to false', () => {
    const result = applyOverlays([overlay('forced-false')], true, 'good', context())
    expect(result.value).toBe(false)
  })

  it('frozen-value latches the first observed value', () => {
    const latched = new Map()
    const first = applyOverlays([overlay('frozen-value')], true, 'good', context(), latched)
    const second = applyOverlays([overlay('frozen-value')], false, 'good', context(), latched)
    expect(first.value).toBe(true)
    expect(second.value).toBe(true)
  })

  it('disconnected reports the safe value with bad quality', () => {
    const result = applyOverlays([overlay('disconnected')], true, 'good', context())
    expect(result.value).toBe(false)
    expect(result.quality).toBe('bad')
  })

  it('degraded-quality downgrades good quality to uncertain without changing the value', () => {
    const result = applyOverlays([overlay('degraded-quality')], true, 'good', context())
    expect(result.value).toBe(true)
    expect(result.quality).toBe('uncertain')
  })

  it('inverted flips a boolean and leaves non-booleans untouched', () => {
    expect(applyOverlays([overlay('inverted')], true, 'good', context()).value).toBe(false)
    const numeric = applyOverlays([overlay('inverted')], 5, 'good', context('cnc-1.SpindleSpeed', 0, true))
    expect(numeric.value).toBe(5)
    expect(numeric.modified).toBe(false)
  })

  it('intermittent drops to the safe value for part of the seeded period', () => {
    const subject = overlay('intermittent', { periodMs: 1_000 })
    const dropped = applyOverlays([subject], true, 'good', { ...context(), nowMs: NOW })
    const held = applyOverlays([subject], true, 'good', { ...context(), nowMs: NOW + 900 })
    expect(dropped.value).toBe(false)
    expect(held.value).toBe(true)
  })

  it('noisy-analog adds bounded seeded noise to numeric signals only', () => {
    const subject = overlay('noisy-analog', { magnitude: 0.1 })
    const noisy = applyOverlays([subject], 1, 'good', context('cnc-1.SpindleSpeed', 0, true))
    expect(typeof noisy.value).toBe('number')
    expect(Math.abs((noisy.value as number) - 1)).toBeLessThanOrEqual(0.1)
    const boolean = applyOverlays([subject], true, 'good', context())
    expect(boolean.modified).toBe(false)
  })

  it('drift grows monotonically with the tick index', () => {
    const subject = overlay('drift', { magnitude: 0.5, signalIds: ['cnc-1.SpindleSpeed'] })
    const atZero = applyOverlays([subject], 10, 'good', context('cnc-1.SpindleSpeed', 0, true)).value as number
    const atFour = applyOverlays([subject], 10, 'good', context('cnc-1.SpindleSpeed', 4, true)).value as number
    expect(atZero).toBe(10)
    expect(atFour).toBe(12)
  })
  it('delayed is a pass-through at the transform layer (the buffer owns the shift)', () => {
    const result = applyOverlays([overlay('delayed')], true, 'good', context())
    expect(result.value).toBe(true)
    expect(result.modified).toBe(true)
  })
})

describe('composition and precedence', () => {
  it('documents a total precedence order over every overlay class', () => {
    expect(new Set(OVERLAY_PRECEDENCE).size).toBe(OVERLAY_FAULT_TYPES.length)
    expect(OVERLAY_PRECEDENCE[0]).toBe('disconnected')
    expect(OVERLAY_PRECEDENCE).toContain('degraded-quality')
    expect(OVERLAY_PRECEDENCE.indexOf('forced-true')).toBeLessThan(OVERLAY_PRECEDENCE.indexOf('inverted'))
  })

  it('lets a higher-precedence overlay win over a lower one', () => {
    const overlays = [overlay('inverted'), overlay('forced-true')]
    const result = applyOverlays(overlays, false, 'good', context())
    // forced-true outranks inverted, so the result is true, not the inverted false.
    expect(result.value).toBe(true)
  })

  it('surfaces a warning when two overlays of the same class affect one signal', () => {
    const overlays = [
      overlay('forced-true', { id: 'overlay-a', startedAt: '2026-01-01T08:00:00.000Z' }),
      overlay('forced-true', { id: 'overlay-b', startedAt: '2026-01-01T08:01:00.000Z' }),
    ]
    const result = applyOverlays(overlays, false, 'good', context())
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'overlay-conflict')).toBe(true)
    expect(result.appliedOverlayIds).toEqual(['overlay-b'])
  })

  it('ignores overlays that do not target the signal', () => {
    const result = applyOverlays([overlay('forced-true', { signalIds: ['other.Signal'] })], false, 'good', context())
    expect(result.modified).toBe(false)
    expect(result.value).toBe(false)
  })

  it('never mutates the input overlay list', () => {
    const overlays = [overlay('forced-true')]
    const snapshot = JSON.stringify(overlays)
    applyOverlays(overlays, false, 'good', context())
    expect(JSON.stringify(overlays)).toBe(snapshot)
  })
})

describe('documented defaults', () => {
  it('exposes bounded defaults for stochastic classes', () => {
    expect(OVERLAY_DEFAULTS.noiseMagnitude).toBeGreaterThan(0)
    expect(OVERLAY_DEFAULTS.driftMagnitude).toBeGreaterThan(0)
    expect(OVERLAY_DEFAULTS.intermittentPeriodMs).toBeGreaterThan(0)
    expect(OVERLAY_DEFAULTS.slowResponseFactor).toBeGreaterThan(1)
  })
})
