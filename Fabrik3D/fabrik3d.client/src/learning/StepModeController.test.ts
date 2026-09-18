import { describe, expect, it } from 'vitest'
import { StepModeController } from './StepModeController'

describe('StepModeController', () => {
  it('pauses only at logical checkpoints and consumes each next command once', () => {
    const controller = new StepModeController()
    controller.enable()
    expect(controller.observe('MOVE_ABOVE_PALLET_SLOT')).toBe(true)
    expect(controller.next()).toBe(true)
    expect(controller.next()).toBe(false)
    expect(controller.observe('MOVE_ABOVE_PALLET_SLOT')).toBe(false)
    expect(controller.observe('DESCEND_TO_PICK')).toBe(true)
    expect(controller.previous?.id).toBe('MOVE_ABOVE_PALLET_SLOT')
  })

  it('resets deterministic history without attempting reverse physics', () => {
    const controller = new StepModeController()
    controller.enable(); controller.observe('MACHINING'); controller.restart()
    expect(controller.current).toBeNull()
    expect(controller.previous).toBeNull()
  })
})
