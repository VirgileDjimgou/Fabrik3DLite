import { describe, expect, it } from 'vitest'
import { safetyVisualState } from './safetyVisualState'

describe('safety visual state mapping', () => {
  it.each([['IDLE', 'safe'], ['MACHINING', 'running'], ['LOADING', 'warning'], ['UNLOADING', 'warning']] as const)('maps CNC %s to semantic %s', (cnc, expected) => {
    expect(safetyVisualState(cnc)).toBe(expected)
  })
  it('keeps offline distinct from a fault or a guard state', () => expect(safetyVisualState('IDLE', false)).toBe('offline'))
})
