import { describe, expect, it } from 'vitest'
import { SCENARIO_CATALOG, getScenario } from './catalog'

const LOCALES = ['en', 'fr', 'de'] as const

function hasAllLocales(text: { en: string; fr: string; de: string } | undefined): boolean {
  return !!text && LOCALES.every((locale) => text[locale]?.trim())
}

describe('scenario translation completeness', () => {
  it.each(SCENARIO_CATALOG.map((s) => s.id))('scenario %s is fully translated in en/fr/de', (id) => {
    const scenario = getScenario(id)

    expect(hasAllLocales(scenario.title)).toBe(true)
    expect(hasAllLocales(scenario.explanation)).toBe(true)
    expect(hasAllLocales(scenario.instructorNotes)).toBe(true)

    expect(scenario.learningObjectives.length).toBeGreaterThan(0)
    for (const objective of scenario.learningObjectives) {
      expect(hasAllLocales(objective)).toBe(true)
    }

    expect(scenario.successCriteria.length).toBeGreaterThan(0)
    for (const criterion of scenario.successCriteria) {
      expect(hasAllLocales(criterion)).toBe(true)
    }

    expect(scenario.activities.length).toBeGreaterThan(0)
    for (const activity of scenario.activities) {
      expect(hasAllLocales(activity.title)).toBe(true)
      expect(hasAllLocales(activity.instruction)).toBe(true)
    }
  })
})