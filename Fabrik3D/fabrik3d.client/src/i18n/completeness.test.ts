import { describe, expect, it } from 'vitest'
import { messages } from './simulator'

describe('simulator translations', () => {
  it('keeps English, French and German keys complete', () => {
    const englishKeys = Object.keys(messages.en).sort()
    expect(Object.keys(messages.fr).sort()).toEqual(englishKeys)
    expect(Object.keys(messages.de).sort()).toEqual(englishKeys)
  })

  it('does not ship empty labels', () => {
    for (const locale of ['en', 'fr', 'de'] as const) {
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value.trim().length, `${locale}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })
})
