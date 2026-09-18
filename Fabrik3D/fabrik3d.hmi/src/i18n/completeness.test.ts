import { describe, expect, it } from 'vitest'
import en from './en'
import fr from './fr'
import de from './de'
function keys(value: Record<string, unknown>, prefix = ''): string[] { return Object.entries(value).flatMap(([key, child]) => child && typeof child === 'object' ? keys(child as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]) }
describe('industrial HMI translations', () => {
  it('keeps English, French and German terminology complete and touch-readable', () => {
    const englishKeys = keys(en)
    expect(keys(fr)).toEqual(englishKeys)
    expect(keys(de)).toEqual(englishKeys)
    for (const dictionary of [en, fr, de]) for (const key of keys(dictionary)) {
      const value = key.split('.').reduce<unknown>((current, segment) => (current as Record<string, unknown>)[segment], dictionary) as string
      if (!key.endsWith('placeholder') && !key.endsWith('selectFromList')) expect(value.length, `${key} should not overflow standard control labels`).toBeLessThan(64)
    }
  })
})
