import { describe, expect, it, vi } from 'vitest'
import {
  GuardedProtocolWriter,
  REPLAY_READ_ONLY_CODE,
  ReplayIsolationGate,
  TimeTravelModeGate,
  type ProtocolWriteRequest,
  type ReplayProtocol,
} from './isolation'

describe('replay read-only isolation', () => {
  it('blocks OPC UA, MQTT and Modbus writes before the writer runs', async () => {
    const gate = new ReplayIsolationGate(() => '2026-01-01T00:00:00.000Z')
    const spies = {
      opcua: vi.fn(async () => true),
      mqtt: vi.fn(async () => true),
      modbus: vi.fn(async () => true),
    }
    const writers: Record<ReplayProtocol, GuardedProtocolWriter> = {
      opcua: new GuardedProtocolWriter(gate, spies.opcua),
      mqtt: new GuardedProtocolWriter(gate, spies.mqtt),
      modbus: new GuardedProtocolWriter(gate, spies.modbus),
    }

    const request = (protocol: ReplayProtocol): ProtocolWriteRequest => ({ protocol, target: `${protocol}:target`, payload: { value: 1 } })

    gate.enterReplay()
    for (const protocol of Object.keys(writers) as ReplayProtocol[]) {
      await expect(writers[protocol].write(request(protocol))).resolves.toBe(false)
    }
    expect(spies.opcua).not.toHaveBeenCalled()
    expect(spies.mqtt).not.toHaveBeenCalled()
    expect(spies.modbus).not.toHaveBeenCalled()
    expect(gate.blockedCount).toBe(3)
    expect(gate.attempts.map((attempt) => attempt.protocol)).toEqual(['opcua', 'mqtt', 'modbus'])
    expect(gate.attempts.every((attempt) => attempt.code === REPLAY_READ_ONLY_CODE)).toBe(true)

    gate.exitReplay()
    await expect(writers.modbus.write(request('modbus'))).resolves.toBe(true)
    expect(spies.modbus).toHaveBeenCalledTimes(1)
  })

  it('blocks authority acquisition while replaying and permits it after exit', () => {
    const gate = new ReplayIsolationGate(() => '2026-01-01T00:00:00.000Z')
    const acquire = vi.fn(() => ({ ownerId: 'sim-1' }))
    gate.enterReplay()
    const blocked = gate.guardAuthorityAcquire('cell-1', acquire)
    expect(blocked.blocked).toBe(true)
    expect(blocked.code).toBe(REPLAY_READ_ONLY_CODE)
    expect(acquire).not.toHaveBeenCalled()

    gate.exitReplay()
    const allowed = gate.guardAuthorityAcquire('cell-1', acquire)
    expect(allowed.blocked).toBe(false)
    expect(acquire).toHaveBeenCalledTimes(1)
  })

  it('resets the replay barrier and restores the previous mode on exit', () => {
    const gate = new ReplayIsolationGate()
    const mode = new TimeTravelModeGate(gate, 'live')
    expect(mode.mode).toBe('live')
    mode.enterReplay()
    expect(mode.mode).toBe('replay')
    expect(gate.isActive).toBe(true)
    expect(mode.exitReplay()).toBe('live')
    expect(mode.mode).toBe('live')
    expect(gate.isActive).toBe(false)

    mode.setMode('simulation')
    mode.enterReplay()
    expect(mode.exitReplay('simulation')).toBe('simulation')
    expect(mode.mode).toBe('simulation')
  })
})
