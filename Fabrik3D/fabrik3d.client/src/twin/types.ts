export const TWIN_SCHEMA_VERSION = '1.0' as const
export type EquipmentCategory = 'robot' | 'cnc' | 'conveyor' | 'sensor' | 'tool'
export type TwinSource = 'commanded' | 'simulated' | 'observed' | 'replay'
export type Availability = 'available' | 'unavailable' | 'degraded'
export interface NormalizedEquipmentState {
  schemaVersion: typeof TWIN_SCHEMA_VERSION
  equipment: { id: string; category: EquipmentCategory; displayName: string }
  source: TwinSource
  availability: Availability
  operatingMode: string
  executionState: string
  measurements: Record<string, number | string | boolean>
  alarmCodes: string[]
  quality: 'good' | 'stale' | 'conflicting' | 'invalid'
  timestamp: string
}
