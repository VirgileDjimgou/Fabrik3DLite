import { describe, expect, it } from 'vitest'
import en from './en'
import fr from './fr'
import de from './de'

/**
 * S70 i18n reference integrity.
 *
 * The completeness test proves EN/FR/DE parity and non-empty labels. This test proves the other
 * direction: every translation key the UI actually asks for exists in all three locales, so a label
 * can never silently fall back to its raw key path. It also guards the obsolete Robot Positions
 * placeholder keys removed by S70.
 *
 * Source is read through Vite's raw module glob so the test stays independent of Node built-ins and
 * works under the HMI's jsdom/vite type environment.
 */

type Dictionary = Record<string, unknown>

function leaves(value: Dictionary, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' ? leaves(child as Dictionary, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

const sourceModules = import.meta.glob('../**/*.{ts,vue}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const sourceText = Object.entries(sourceModules)
  .filter(([path]) => !path.endsWith('.test.ts'))
  .map(([, content]) => content)
  .join('\n')

/** Namespaces whose last segment is chosen at runtime, e.g. `t(`robotPositions.reason.${reason}`)`. */
const DYNAMIC_KEY_PREFIXES = ['robotPositions.reason.', 'instructor.']

const literalKeys = (() => {
  const keys = new Set<string>()
  const pattern = /\bt\(\s*(['"])([^'"]+)\1\s*\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(sourceText)) !== null) {
    if (!match[2].includes('$')) keys.add(match[2])
  }
  return [...keys].sort()
})()

function resolveKey(dictionary: Dictionary, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => (current as Dictionary | undefined)?.[segment], dictionary)
}

describe('i18n key reference integrity', () => {
  it('every literal key used by the UI resolves in English, French and German', () => {
    const missing: string[] = []
    for (const key of literalKeys) {
      for (const [locale, dictionary] of [
        ['en', en],
        ['fr', fr],
        ['de', de],
      ] as const) {
        const value = resolveKey(dictionary as Dictionary, key)
        if (typeof value !== 'string' || value.trim().length === 0) missing.push(`${locale}:${key}`)
      }
    }
    expect(missing, `missing or empty translation keys:\n${missing.join('\n')}`).toEqual([])
  })

  it('declares runtime namespaces whose leaves exist in every locale', () => {
    for (const prefix of DYNAMIC_KEY_PREFIXES) {
      for (const [locale, dictionary] of [
        ['en', en],
        ['fr', fr],
        ['de', de],
      ] as const) {
        const underPrefix = leaves(dictionary as Dictionary).filter((key) => key.startsWith(prefix))
        expect(underPrefix.length, `${locale} has no keys under dynamic prefix ${prefix}`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the obsolete Robot Positions placeholder keys removed', () => {
    const obsolete = ['placeholder', 'motion', 'joint', 'angleRad', 'angleDeg', 'limits', 'orientation']
    for (const key of obsolete) {
      expect(resolveKey(en as Dictionary, `robotPositions.${key}`), `en.robotPositions.${key}`).toBeUndefined()
      expect(resolveKey(fr as Dictionary, `robotPositions.${key}`), `fr.robotPositions.${key}`).toBeUndefined()
      expect(resolveKey(de as Dictionary, `robotPositions.${key}`), `de.robotPositions.${key}`).toBeUndefined()
    }
    expect(sourceText).not.toMatch(/will be available in a future update/i)
  })
})
