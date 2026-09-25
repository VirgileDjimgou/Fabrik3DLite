/** Engineering fault-lab targets: reference-cell equipment and their signals. */

export interface FaultLabTarget {
  equipmentId: string
  label: string
  signals: string[]
}

/**
 * Deterministic reference-cell targets used by the fault-lab harness and the
 * engineering panel. Signal ids are the canonical S32 ids; they are never
 * translated.
 */
export const REFERENCE_CELL_FAULT_TARGETS: readonly FaultLabTarget[] = [
  {
    equipmentId: 'robot-1',
    label: 'Robot 1',
    signals: ['robot-1.Start', 'robot-1.Stop', 'robot-1.Reset', 'robot-1.PayloadDetected', 'robot-1.ProgramRunning', 'robot-1.Ready'],
  },
  {
    equipmentId: 'cnc-1',
    label: 'CNC 1',
    signals: ['cnc-1.SpindleSpeed', 'cnc-1.FeedRate', 'cnc-1.CycleStart', 'cnc-1.CycleRunning', 'cnc-1.DoorOpen', 'cnc-1.Ready'],
  },
  {
    equipmentId: 'conveyor-1',
    label: 'Conveyor 1',
    signals: ['conveyor-1.RunCommand', 'conveyor-1.SpeedReference', 'conveyor-1.ActualSpeed', 'conveyor-1.PhotoeyeIn', 'conveyor-1.PhotoeyeStation', 'conveyor-1.MotorFault'],
  },
  {
    equipmentId: 'safety-zone-1',
    label: 'Safety zone',
    signals: ['safety-zone-1.EmergencyStop', 'safety-zone-1.GateClosed', 'safety-zone-1.LightCurtainClear', 'safety-zone-1.SafetyHealthy'],
  },
]
