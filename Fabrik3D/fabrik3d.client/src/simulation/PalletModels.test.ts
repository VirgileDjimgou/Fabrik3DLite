import { describe, expect, it } from 'vitest'
import {
  createFullPallet,
  isPalletComplete,
  nextRawSlot,
  pickSlot,
  returnSlot,
} from './PalletModels'

describe('pallet slot states', () => {
  it('tracks a raw part through pick and return to its original slot', () => {
    const pallet = createFullPallet('hex-billet', 2, 2)

    expect(nextRawSlot(pallet)).toEqual([0, 0])
    expect(isPalletComplete(pallet)).toBe(false)

    pickSlot(pallet, 0, 0)
    expect(pallet.occupied[0]![0]).toBe(false)
    expect(pallet.slotStatus[0]![0]).toBe('in-process')

    returnSlot(pallet, 0, 0)
    expect(pallet.occupied[0]![0]).toBe(true)
    expect(pallet.slotStatus[0]![0]).toBe('machined')
    expect(nextRawSlot(pallet)).toEqual([0, 1])
  })

  it('marks a pallet complete only after all slots have returned', () => {
    const pallet = createFullPallet('round-billet', 1, 2)

    pickSlot(pallet, 0, 0)
    returnSlot(pallet, 0, 0)
    pickSlot(pallet, 0, 1)
    returnSlot(pallet, 0, 1)

    expect(isPalletComplete(pallet)).toBe(true)
    expect(nextRawSlot(pallet)).toBeNull()
  })
})
