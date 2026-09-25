import type { ReconstructionSnapshot } from '../timeTravel/types'
import type { NormalizedEquipmentState } from './types'
import { TWIN_SCHEMA_VERSION } from './types'

/** Replay only emits state records; it deliberately has no command interface. */
export class TelemetryReplay {
  private index = 0
  constructor(private readonly records: readonly NormalizedEquipmentState[]) {}
  reset(): void { this.index = 0 }
  advance(until: string): NormalizedEquipmentState[] { const output: NormalizedEquipmentState[] = []; while (this.index < this.records.length && this.records[this.index]!.timestamp <= until) output.push(this.records[this.index++]!); return output }
}
export function importTelemetry(json: string): NormalizedEquipmentState[] { const parsed: unknown = JSON.parse(json); if (!Array.isArray(parsed)) throw new Error('Telemetry import must be a JSON array.'); return parsed as NormalizedEquipmentState[] }

/**
 * S41: expresses a time-travel reconstruction through the existing normalized
 * twin model so replay drives the same visualization layer as live telemetry.
 *
 * Every emitted state carries `source: 'replay'` and never carries a command.
 * Exactness maps to quality: an exact sample is `good`, interpolated/held samples
 * are `stale` (they are honest approximations) and missing evidence is `invalid`.
 */
export function reconstructTwinStates(snapshot: ReconstructionSnapshot): NormalizedEquipmentState[] {
  const timestamp = snapshot.targetTime
  const alarmCodes = [...snapshot.alarms.map((alarm) => alarm.alarmId), ...snapshot.faults.filter((fault) => fault.active).map((fault) => fault.faultId)].sort()
  const states: NormalizedEquipmentState[] = [
    {
      schemaVersion: TWIN_SCHEMA_VERSION,
      equipment: { id: snapshot.robot.equipmentId, category: 'robot', displayName: 'Robot' },
      source: 'replay',
      availability: snapshot.robot.exactness === 'gap' ? 'unavailable' : 'available',
      operatingMode: 'Replay',
      executionState: snapshot.job.phase ?? 'Unknown',
      measurements: {
        joints: snapshot.robot.joints ? snapshot.robot.joints.join(',') : '',
        poseX: snapshot.robot.pose?.x ?? 0,
        poseY: snapshot.robot.pose?.y ?? 0,
        poseZ: snapshot.robot.pose?.z ?? 0,
      },
      alarmCodes,
      quality: qualityForExactness(snapshot.robot.exactness),
      timestamp,
    },
  ]

  if (snapshot.cnc) {
    states.push({
      schemaVersion: TWIN_SCHEMA_VERSION,
      equipment: { id: snapshot.cnc.equipmentId, category: 'cnc', displayName: 'CNC' },
      source: 'replay',
      availability: snapshot.cnc.state ? 'available' : 'degraded',
      operatingMode: 'Replay',
      executionState: snapshot.cnc.state ?? 'Unknown',
      measurements: {
        doorState: snapshot.cnc.doorState ?? 'unknown',
        fixtureClamped: snapshot.cnc.fixtureClamped ?? false,
        spindleRunning: snapshot.cnc.spindleRunning ?? false,
        partPresent: snapshot.cnc.partPresent ?? false,
      },
      alarmCodes,
      quality: snapshot.cnc.state ? 'good' : 'invalid',
      timestamp,
    })
  }

  for (const equipment of snapshot.equipment) {
    states.push({
      schemaVersion: TWIN_SCHEMA_VERSION,
      equipment: { id: equipment.equipmentId, category: 'tool', displayName: equipment.equipmentId },
      source: 'replay',
      availability: equipment.executionState ? 'available' : 'degraded',
      operatingMode: equipment.operatingMode ?? 'Replay',
      executionState: equipment.executionState ?? 'Unknown',
      measurements: { ...equipment.measurements },
      alarmCodes,
      quality: equipment.executionState ? 'good' : 'invalid',
      timestamp,
    })
  }

  return states
}

function qualityForExactness(exactness: ReconstructionSnapshot['robot']['exactness']): NormalizedEquipmentState['quality'] {
  if (exactness === 'exact') return 'good'
  if (exactness === 'gap') return 'invalid'
  return 'stale'
}
