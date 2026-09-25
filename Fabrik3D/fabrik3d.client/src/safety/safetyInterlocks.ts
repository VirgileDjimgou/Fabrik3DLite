/**
 * Deterministic simulated safety interlock state for training and diagnostics.
 *
 * This model never claims certified safety behaviour and never replaces a safety
 * PLC or risk assessment. It provides a truthful source for the reference-cell
 * safety signals so handlers can observe and reset simulated conditions.
 */

export interface SafetyInterlockState {
  emergencyStop: boolean
  gateClosed: boolean
  gateLocked: boolean
  lightCurtainClear: boolean
  scannerClear: boolean
  safetyHealthy: boolean
}

export interface SafetyResetResult {
  accepted: boolean
  reason?: 'light-curtain-blocked' | 'scanner-blocked' | 'gate-open'
}

export class SafetyInterlockModel {
  private emergencyStop = false
  private gateClosed = true
  private gateLocked = true
  private lightCurtainClear = true
  private scannerClear = true

  getState(): SafetyInterlockState {
    return {
      emergencyStop: this.emergencyStop,
      gateClosed: this.gateClosed,
      gateLocked: this.gateLocked,
      lightCurtainClear: this.lightCurtainClear,
      scannerClear: this.scannerClear,
      safetyHealthy: this.isHealthy(),
    }
  }

  isHealthy(): boolean {
    return this.emergencyStop === false
      && this.gateClosed
      && this.gateLocked
      && this.lightCurtainClear
      && this.scannerClear
  }

  /** Latches the simulated emergency stop and unlocks the gate chain. */
  triggerEmergencyStop(): void {
    this.emergencyStop = true
    this.gateLocked = false
  }

  clearEmergencyStop(): void {
    this.emergencyStop = false
  }

  openGate(): void {
    this.gateClosed = false
    this.gateLocked = false
  }

  closeGate(): void {
    this.gateClosed = true
  }

  lockGate(): boolean {
    if (!this.gateClosed) return false
    this.gateLocked = true
    return true
  }

  setLightCurtainClear(clear: boolean): void {
    this.lightCurtainClear = clear
  }

  setScannerClear(clear: boolean): void {
    this.scannerClear = clear
  }

  /**
   * Clears the latched emergency stop only when every physical condition is safe.
   * Otherwise the request is refused with an explicit reason.
   */
  reset(): SafetyResetResult {
    if (!this.lightCurtainClear) return { accepted: false, reason: 'light-curtain-blocked' }
    if (!this.scannerClear) return { accepted: false, reason: 'scanner-blocked' }
    if (!this.gateClosed) return { accepted: false, reason: 'gate-open' }
    this.emergencyStop = false
    this.gateLocked = true
    return { accepted: true }
  }
}
