import { describe, expect, it } from 'vitest'
import { AlarmLog, createSimulationAlarm, SIMULATION_ALARM_CODES } from './alarms'

describe('simulation alarm contract', () => {
  it('produces structured records with all contract fields', () => {
    const alarm = createSimulationAlarm({
      code: SIMULATION_ALARM_CODES.COLLISION_RISK,
      severity: 'critical',
      message: 'Collision risk with cnc-1.',
      equipmentId: 'cnc-1',
      phase: 'MOVE_TO_CNC_INSERT',
      distanceMeters: 0.02,
    })

    expect(alarm).toMatchObject({
      code: 'COLLISION_RISK',
      severity: 'critical',
      message: expect.stringContaining('cnc-1'),
      equipmentId: 'cnc-1',
      phase: 'MOVE_TO_CNC_INSERT',
      distanceMeters: 0.02,
    })
    expect(alarm.id).toBeTruthy()
    expect(Number.isNaN(Date.parse(alarm.timestampUtc))).toBe(false)
  })

  it('distinguishes every alarm code and severity', () => {
    const codes = Object.values(SIMULATION_ALARM_CODES)
    expect(codes).toHaveLength(5)
    expect(codes).toEqual(expect.arrayContaining([
      'COLLISION_RISK', 'SELF_COLLISION', 'UNREACHABLE_TARGET', 'JOINT_LIMIT_VIOLATION', 'INVALID_TARGET',
    ]))
  })

  it('records alarms and notifies listeners in order', () => {
    const log = new AlarmLog()
    const seen: string[] = []
    log.onAlarm = (alarm) => seen.push(alarm.code)

    log.raise(createSimulationAlarm({ code: 'COLLISION_RISK', severity: 'warning', message: 'a', equipmentId: 'e', phase: 'p' }))
    log.raise(createSimulationAlarm({ code: 'UNREACHABLE_TARGET', severity: 'info', message: 'b', equipmentId: 'e', phase: 'p' }))

    expect(log.alarms).toHaveLength(2)
    expect(seen).toEqual(['COLLISION_RISK', 'UNREACHABLE_TARGET'])
    expect(log.last?.code).toBe('UNREACHABLE_TARGET')

    log.clear()
    expect(log.alarms).toHaveLength(0)
  })
})