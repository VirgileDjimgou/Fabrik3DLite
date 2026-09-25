import { describe, expect, it } from 'vitest'
import { SIGNAL_SOURCES } from './types'
import type { TwinSource } from '../twin/types'

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

const sourcesAligned: MutuallyAssignable<TwinSource, (typeof SIGNAL_SOURCES)[number]> = true

describe('signal and twin source alignment', () => {
  it('keeps the signal source model aligned with the normalized twin sources', () => {
    const twinSources: TwinSource[] = ['commanded', 'simulated', 'observed', 'replay']
    expect(sourcesAligned).toBe(true)
    expect([...SIGNAL_SOURCES].sort()).toEqual([...twinSources].sort())
  })
})
