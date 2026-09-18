import { describe, expect, it } from 'vitest'
import { SCENARIO_CATALOG, getScenario } from './catalog'
import { validateScenario } from './validation'
import type { ScenarioDefinition } from './types'
import { SCENARIO_SCHEMA_VERSION } from './types'

const L = { en: 'T', fr: 'T', de: 'T' }

function scenario(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'test-scenario',
    title: L,
    level: 'beginner',
    learningObjectives: [L],
    prerequisites: [],
    activities: [{ id: 'a1', title: L, instruction: L, expectedEvent: { type: 'workflow.phase', match: { phase: 'PICK_PART' } } }],
    successCriteria: [L],
    instructorNotes: L,
    explanation: L,
    ...overrides,
  }
}

describe('scenario validation', () => {
  it('accepts a valid scenario', () => {
    expect(validateScenario(scenario())).toEqual([])
  })

  it('rejects scenarios without activities or with an invalid level', () => {
    expect(validateScenario(scenario({ activities: [] })).some((d) => d.code === 'missing_activities')).toBe(true)
    expect(validateScenario(scenario({ level: 'expert' as never })).some((d) => d.code === 'invalid_level')).toBe(true)
  })

  it('rejects duplicate activity ids and missing event types', () => {
    const dup = scenario({ activities: [
      { id: 'a', title: L, instruction: L, expectedEvent: { type: 'x' } },
      { id: 'a', title: L, instruction: L, expectedEvent: { type: 'y' } },
    ] })
    expect(validateScenario(dup).some((d) => d.code === 'duplicate_activity_id')).toBe(true)

    const noEvent = scenario({ activities: [{ id: 'a', title: L, instruction: L, expectedEvent: { type: '' } }] })
    expect(validateScenario(noEvent).some((d) => d.code === 'missing_event_type')).toBe(true)
  })

  it('warns when a locale is missing', () => {
    const missing = scenario({ title: { en: 'T', fr: 'T', de: '' } })
    const warnings = validateScenario(missing)
    expect(warnings.some((d) => d.code === 'missing_locale' && d.severity === 'warning')).toBe(true)
  })

  it('rejects an unsupported schema version', () => {
    expect(validateScenario(scenario({ schemaVersion: '9.9' as never })).some((d) => d.code === 'unsupported_version')).toBe(true)
  })
})

describe('scenario catalog integrity', () => {
  it('contains the five reference scenarios', () => {
    const ids = SCENARIO_CATALOG.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['robot-axes', 'coordinate-frames', 'pick-and-place', 'cnc-loading', 'pallet-processing']))
  })

  it('catalog scenarios validate cleanly', () => {
    for (const scenario of SCENARIO_CATALOG) {
      expect(validateScenario(scenario), `scenario ${scenario.id}`).toEqual([])
    }
  })

  it('exposes a lookup and rejects unknown ids', () => {
    expect(getScenario('robot-axes').id).toBe('robot-axes')
    expect(() => getScenario('nope')).toThrowError("not in the catalog")
  })
})