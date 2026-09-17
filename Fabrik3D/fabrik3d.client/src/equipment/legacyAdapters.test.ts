import { describe, expect, it } from 'vitest'
import { LegacyCncAdapter, LegacyPalletStationAdapter, LegacyRobotAdapter, type LegacyRobotControllerApi } from './legacyAdapters'
import { createFullPallet } from '../simulation/PalletModels'

describe('legacy equipment adapters', () => {
  it('adapts robot controller operations to the generic motion runtime', () => {
    const calls: string[] = []
    const controller: LegacyRobotControllerApi = {
      isMoving: false,
      state: 'IDLE',
      moveJoints: () => calls.push('move'),
      enqueueCommand: () => calls.push('enqueue'),
      clearCommands: () => calls.push('clear'),
    }
    const adapter = new LegacyRobotAdapter('robot-1', controller)
    adapter.moveJoints([0, 0, 0, 0, 0, 0])
    adapter.enqueueMove([0, 0, 0, 0, 0, 0])
    adapter.clearCommands()
    expect(calls).toEqual(['move', 'enqueue', 'clear'])
  })

  it('adapts CNC and pallet station operations without Vue component imports', () => {
    const calls: string[] = []
    const pallet = createFullPallet('hex-billet', 1, 1)
    const cnc = new LegacyCncAdapter('cnc-1', {
      state: 'IDLE', loadPart: () => calls.push('load'), startMachining: () => calls.push('machine'), unloadComplete: () => calls.push('unload'),
    })
    const station = new LegacyPalletStationAdapter('pallet-station-1', {
      getFirstStoppedPallet: () => pallet,
      getPalletComponent: () => ({ setSlotVisible: () => calls.push('slot') }),
    })
    cnc.openForLoad(); cnc.startMachining(); cnc.completeUnload()
    station.setSlotVisible(pallet.id, 0, 0, false)
    expect(station.getFirstStoppedPallet()?.id).toBe(pallet.id)
    expect(calls).toEqual(['load', 'machine', 'unload', 'slot'])
  })
})
