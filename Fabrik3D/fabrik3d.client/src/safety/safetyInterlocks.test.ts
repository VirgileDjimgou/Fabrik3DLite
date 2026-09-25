import { describe, expect, it } from 'vitest'
import { SafetyInterlockModel } from './safetyInterlocks'

describe('SafetyInterlockModel', () => {
  it('starts healthy with a closed, locked gate and clear detection devices', () => {
    const model = new SafetyInterlockModel()
    expect(model.getState()).toEqual({
      emergencyStop: false,
      gateClosed: true,
      gateLocked: true,
      lightCurtainClear: true,
      scannerClear: true,
      safetyHealthy: true,
    })
  })

  it('latches the emergency stop and reports an unhealthy state', () => {
    const model = new SafetyInterlockModel()
    model.triggerEmergencyStop()
    const state = model.getState()
    expect(state.emergencyStop).toBe(true)
    expect(state.gateLocked).toBe(false)
    expect(state.safetyHealthy).toBe(false)
  })

  it('refuses a reset while a safety condition is not clear', () => {
    const model = new SafetyInterlockModel()
    model.triggerEmergencyStop()
    model.setLightCurtainClear(false)
    expect(model.reset()).toEqual({ accepted: false, reason: 'light-curtain-blocked' })
    model.setLightCurtainClear(true)
    model.setScannerClear(false)
    expect(model.reset()).toEqual({ accepted: false, reason: 'scanner-blocked' })
    model.setScannerClear(true)
    model.openGate()
    expect(model.reset()).toEqual({ accepted: false, reason: 'gate-open' })
  })

  it('resets only once the gate is closed and detection devices are clear', () => {
    const model = new SafetyInterlockModel()
    model.triggerEmergencyStop()
    model.openGate()
    model.setLightCurtainClear(false)
    expect(model.reset().accepted).toBe(false)
    model.setLightCurtainClear(true)
    model.closeGate()
    expect(model.reset()).toEqual({ accepted: true })
    expect(model.getState()).toEqual({
      emergencyStop: false,
      gateClosed: true,
      gateLocked: true,
      lightCurtainClear: true,
      scannerClear: true,
      safetyHealthy: true,
    })
  })

  it('never locks an open gate', () => {
    const model = new SafetyInterlockModel()
    model.openGate()
    expect(model.lockGate()).toBe(false)
    model.closeGate()
    expect(model.lockGate()).toBe(true)
  })
})
