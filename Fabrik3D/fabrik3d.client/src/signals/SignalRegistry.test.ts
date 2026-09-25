import { describe, expect, it } from 'vitest'
import { SignalRegistry } from './SignalRegistry'
import { SignalRegistryError, type SignalDefinition, type SignalValue } from './types'

const FIXED_NOW = Date.parse('2026-01-01T00:00:00.000Z')
const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:00:01.000Z'
const T2 = '2026-01-01T00:00:02.000Z'

function definition(overrides: Partial<SignalDefinition> = {}): SignalDefinition {
  return {
    id: 'robot-1.ServoOn',
    equipmentId: 'robot-1',
    name: 'ServoOn',
    displayName: 'Servo on',
    direction: 'output-from-controller',
    dataType: 'bool',
    writable: true,
    defaultValue: false,
    ...overrides,
  }
}

function registry(options: { defaultStaleAfterMs?: number } = {}): SignalRegistry {
  return new SignalRegistry({ now: () => FIXED_NOW, ...options })
}

function update(reg: SignalRegistry, overrides: Partial<Parameters<SignalRegistry['update']>[0]> = {}) {
  return reg.update({ signalId: 'robot-1.ServoOn', value: true, source: 'simulated', origin: 'simulation', timestamp: T1, ...overrides })
}

describe('SignalRegistry registration', () => {
  it('registers signals and discovers them by equipment with stable sorted ids', () => {
    const reg = registry()
    reg.register(definition())
    reg.register(definition({ id: 'cnc-1.Ready', equipmentId: 'cnc-1', name: 'Ready', displayName: 'Ready' }))
    reg.register(definition({ id: 'robot-1.AtHome', name: 'AtHome', displayName: 'At home', direction: 'input-to-controller', writable: false }))

    expect(reg.size).toBe(3)
    expect(reg.getDefinitionsByEquipment('robot-1').map((item) => item.id)).toEqual(['robot-1.AtHome', 'robot-1.ServoOn'])
    expect(reg.getAllDefinitions().map((item) => item.id)).toEqual(['cnc-1.Ready', 'robot-1.AtHome', 'robot-1.ServoOn'])
    expect(reg.getDefinition('robot-1.ServoOn')?.displayName).toBe('Servo on')
    expect(reg.getDefinition('missing')).toBeUndefined()
  })

  it('seeds every registered signal with an uncertain default sample', () => {
    const reg = registry()
    reg.register(definition())
    expect(reg.read('robot-1.ServoOn', FIXED_NOW)).toEqual({
      signalId: 'robot-1.ServoOn',
      value: false,
      quality: 'uncertain',
      source: 'simulated',
      origin: 'import',
      timestamp: T0,
    })
  })

  it('rejects duplicate ids and duplicate names per equipment', () => {
    const reg = registry()
    reg.register(definition())
    expect(() => reg.register(definition())).toThrow(SignalRegistryError)
    expect(() => reg.register(definition({ id: 'robot-1.ServoOnAlias' }))).toThrow(/already declares a signal named 'ServoOn'/)
  })

  it('allows the same signal name on different equipment', () => {
    const reg = registry()
    reg.register(definition())
    expect(() => reg.register(definition({ id: 'robot-2.ServoOn', equipmentId: 'robot-2' }))).not.toThrow()
  })

  it('rejects invalid definitions with actionable diagnostics', () => {
    const invalidCases: Array<[string, Partial<SignalDefinition>]> = [
      ['missing id', { id: '' }],
      ['invalid id characters', { id: 'robot 1 servo' }],
      ['missing equipment id', { equipmentId: '' }],
      ['missing display name', { displayName: ' ' }],
      ['min greater than max', { dataType: 'float', defaultValue: 0, min: 10, max: 1 }],
      ['bounds on bool', { min: 0 }],
      ['default out of range', { dataType: 'int', defaultValue: 5, min: 0, max: 1 }],
      ['enum without values', { dataType: 'enum', defaultValue: 'a' }],
      ['enum default not in values', { dataType: 'enum', enumValues: ['a', 'b'], defaultValue: 'c' }],
      ['invalid stale threshold', { staleAfterMs: 0 }],
    ]
    for (const [label, overrides] of invalidCases) {
      expect(() => registry().register(definition(overrides)), label).toThrow(SignalRegistryError)
    }
  })

  it('clears every registered signal', () => {
    const reg = registry()
    reg.register(definition())
    reg.clear()
    expect(reg.size).toBe(0)
    expect(reg.read('robot-1.ServoOn')).toBeNull()
  })
})

describe('SignalRegistry updates', () => {
  it('accepts valid updates and preserves the previous sample on rejection', () => {
    const reg = registry()
    reg.register(definition())
    const accepted = update(reg, { timestamp: T1 })
    expect(accepted.accepted).toBe(true)
    expect(reg.read('robot-1.ServoOn', FIXED_NOW)).toMatchObject({ value: true, source: 'simulated', origin: 'simulation' })

    const rejected = update(reg, { timestamp: T2, value: 'nope' as unknown as SignalValue })
    expect(rejected.accepted).toBe(false)
    expect(reg.read('robot-1.ServoOn', FIXED_NOW)?.value).toBe(true)
  })

  it('rejects unknown signals and invalid timestamps', () => {
    const reg = registry()
    reg.register(definition())
    expect(reg.update({ signalId: 'missing.X', value: true, source: 'simulated', origin: 'simulation', timestamp: T1 })).toMatchObject({ accepted: false, reason: 'unknown-signal' })
    expect(update(reg, { timestamp: 'not-a-date' })).toMatchObject({ accepted: false, reason: 'invalid-timestamp' })
  })

  it('rejects type mismatches for every data type', () => {
    const cases: Array<[string, SignalDefinition, unknown]> = [
      ['bool receiving a number', definition(), 1],
      ['int receiving a fraction', definition({ dataType: 'int', defaultValue: 0 }), 1.5],
      ['uint receiving a negative', definition({ dataType: 'uint', defaultValue: 0 }), -1],
      ['float receiving infinity', definition({ dataType: 'float', defaultValue: 0 }), Number.POSITIVE_INFINITY],
      ['string receiving a boolean', definition({ dataType: 'string', defaultValue: 'x' }), true],
    ]
    for (const [label, signalDefinition, value] of cases) {
      const reg = registry()
      reg.register(signalDefinition)
      const result = update(reg, { value: value as SignalValue })
      expect(result.accepted, label).toBe(false)
      if (!result.accepted) expect(result.reason, label).toBe('type-mismatch')
    }
  })

  it('enforces numeric range validation', () => {
    const reg = registry()
    reg.register(definition({ dataType: 'float', defaultValue: 1, min: 0, max: 10 }))
    expect(update(reg, { value: 11 })).toMatchObject({ accepted: false, reason: 'out-of-range' })
    expect(update(reg, { value: -1 })).toMatchObject({ accepted: false, reason: 'out-of-range' })
    expect(update(reg, { value: 5 }).accepted).toBe(true)
  })

  it('enforces enum membership', () => {
    const reg = registry()
    reg.register(definition({ dataType: 'enum', enumValues: ['auto', 'manual'], defaultValue: 'auto' }))
    expect(update(reg, { value: 'other' })).toMatchObject({ accepted: false, reason: 'invalid-enum' })
    expect(update(reg, { value: 'auto' }).accepted).toBe(true)
  })

  it('rejects older timestamps and lower-priority sources on equal timestamps', () => {
    const reg = registry()
    reg.register(definition({ direction: 'input-to-controller' }))
    expect(update(reg, { timestamp: T2, source: 'observed', origin: 'controller' }).accepted).toBe(true)
    expect(update(reg, { timestamp: T1, source: 'observed', origin: 'controller', value: false })).toMatchObject({ accepted: false, reason: 'stale-timestamp' })
    expect(update(reg, { timestamp: T2, source: 'commanded', origin: 'simulation', value: false })).toMatchObject({ accepted: false, reason: 'lower-priority-source' })
    expect(update(reg, { timestamp: T2, source: 'observed', origin: 'controller' }).accepted).toBe(true)
  })

  it('accepts a newer lower-priority source update but never regresses the timestamp', () => {
    const reg = registry()
    reg.register(definition())
    expect(update(reg, { timestamp: T1, source: 'commanded', origin: 'simulation' }).accepted).toBe(true)
    expect(update(reg, { timestamp: T2, source: 'observed', origin: 'controller' }).accepted).toBe(true)
    const after = update(reg, { timestamp: T2, source: 'simulated', origin: 'simulation', value: false })
    expect(after).toMatchObject({ accepted: false, reason: 'lower-priority-source' })
    expect(reg.read('robot-1.ServoOn', FIXED_NOW)?.timestamp).toBe(T2)
  })

  it('rejects controller and operator writes to read-only signals', () => {
    const reg = registry()
    reg.register(definition({ writable: false }))
    expect(update(reg, { origin: 'controller', source: 'observed' })).toMatchObject({ accepted: false, reason: 'not-writable' })
    expect(update(reg, { origin: 'operator', source: 'commanded' })).toMatchObject({ accepted: false, reason: 'not-writable' })
    expect(update(reg, { origin: 'simulation', source: 'simulated' }).accepted).toBe(true)
  })

  it('marks stale reads without mutating the stored sample', () => {
    const reg = registry()
    reg.register(definition({ staleAfterMs: 1_000 }))
    update(reg, { timestamp: T1 })
    expect(reg.read('robot-1.ServoOn', Date.parse(T1) + 500)?.quality).toBe('good')
    expect(reg.read('robot-1.ServoOn', Date.parse(T1) + 5_000)?.quality).toBe('stale')
    expect(reg.read('robot-1.ServoOn', Date.parse(T1) + 500)?.quality).toBe('good')
  })
})

describe('SignalRegistry snapshots', () => {
  it('produces deterministic snapshots regardless of registration order', () => {
    const first = registry()
    const second = registry()
    const definitions = [
      definition(),
      definition({ id: 'cnc-1.Ready', equipmentId: 'cnc-1', name: 'Ready', displayName: 'Ready' }),
      definition({ id: 'conveyor-1.Running', equipmentId: 'conveyor-1', name: 'Running', displayName: 'Running' }),
    ]
    for (const item of definitions) first.register(item)
    for (const item of [...definitions].reverse()) second.register(item)
    expect(first.snapshot().map((sample) => sample.signalId)).toEqual(second.snapshot().map((sample) => sample.signalId))
    expect(first.snapshot().map((sample) => sample.signalId)).toEqual(['cnc-1.Ready', 'conveyor-1.Running', 'robot-1.ServoOn'])
  })

  it('registers and snapshots 10,000 signals within a bounded budget', () => {
    const reg = registry()
    const started = Date.now()
    for (let index = 0; index < 10_000; index += 1) {
      reg.register(definition({ id: `cell-1.signal-${index}`, equipmentId: 'cell-1', name: `Signal${index}`, displayName: `Signal ${index}` }))
    }
    const snapshot = reg.snapshot()
    const elapsedMs = Date.now() - started
    console.info(`[signal-benchmark] 10000 signals registered + snapshot in ${elapsedMs} ms`)
    expect(snapshot).toHaveLength(10_000)
    expect(elapsedMs).toBeLessThan(5_000)
  })
})
