import { describe, expect, it } from 'vitest'
import {
  AUTHORITY_CODES,
  AuthorityStore,
  evaluateCommand,
  implicitLocalSimulation,
  normalizeAuthority,
  type AuthoritySnapshot,
} from './authority'

const held = (overrides: Partial<AuthoritySnapshot> = {}): AuthoritySnapshot => ({
  scope: 'cell-1',
  mode: 'external-controller',
  state: 'held',
  ownerId: 'modbus',
  ownerKind: 'connector',
  degradedReason: null,
  leaseExpiresAtUtc: '2026-09-25T10:00:00Z',
  version: 1,
  isPersisted: true,
  diagnostic: null,
  ...overrides,
})

describe('control authority model', () => {
  it('allows implicit local simulation when nothing is held', () => {
    const decision = evaluateCommand(implicitLocalSimulation('cell-1'), 'local-simulation', 'sim-1')
    expect(decision.allowed).toBe(true)
  })

  it('denies external control before it acquires authority', () => {
    const decision = evaluateCommand(null, 'external-controller', 'modbus')
    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe(AUTHORITY_CODES.notAcquired)
  })

  it('denies local simulation while an external controller holds the scope', () => {
    const decision = evaluateCommand(held(), 'local-simulation', 'sim-1')
    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe(AUTHORITY_CODES.conflict)
  })

  it('allows the holder to command and denies a foreign owner', () => {
    expect(evaluateCommand(held(), 'external-controller', 'modbus').allowed).toBe(true)
    expect(evaluateCommand(held(), 'external-controller', 'opcua').allowed).toBe(false)
  })

  it('always fails closed when degraded', () => {
    const degraded = held({ state: 'degraded', degradedReason: 'controller-heartbeat-lost' })
    const owner = evaluateCommand(degraded, 'external-controller', 'modbus')
    const local = evaluateCommand(degraded, 'local-simulation', 'sim-1')
    expect(owner.allowed).toBe(false)
    expect(owner.code).toBe(AUTHORITY_CODES.lost)
    expect(local.allowed).toBe(false)
    expect(local.code).toBe(AUTHORITY_CODES.lost)
  })

  it('never lets replay command', () => {
    const decision = evaluateCommand(held(), 'replay', 'replay-1')
    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe(AUTHORITY_CODES.replayReadOnly)
  })

  it('normalizes unknown payloads defensively', () => {
    const snapshot = normalizeAuthority({ mode: 'nonsense', state: 7 }, 'cell-9')
    expect(snapshot.scope).toBe('cell-9')
    expect(snapshot.mode).toBe('local-simulation')
    expect(snapshot.state).toBe('available')
    expect(snapshot.isPersisted).toBe(false)
  })

  it('ignores out-of-order authority snapshots in the store', () => {
    const store = new AuthorityStore('cell-1')
    expect(store.apply(held({ version: 5 }))).toBe(true)
    expect(store.apply(held({ version: 4, mode: 'local-simulation', state: 'available', ownerId: null }))).toBe(false)
    expect(store.snapshot().version).toBe(5)
    expect(store.canCommand('sim-1')).toBe(false)
  })

  it('lets the simulator drive after the external owner releases', () => {
    const store = new AuthorityStore('cell-1')
    store.apply(held({ version: 3 }))
    expect(store.canCommand('sim-1')).toBe(false)

    store.apply({
      ...implicitLocalSimulation('cell-1'),
      version: 4,
      isPersisted: true,
    })
    expect(store.canCommand('sim-1')).toBe(true)
    expect(store.gate('sim-1')()).toBe(true)
  })
})
