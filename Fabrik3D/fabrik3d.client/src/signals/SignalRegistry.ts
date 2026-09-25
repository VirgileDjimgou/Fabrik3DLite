import {
  SIGNAL_QUALITIES,
  SIGNAL_SOURCE_PRIORITY,
  SignalRegistryError,
  isValidTimestamp,
  validateSignalDefinition,
  validateSignalValue,
  type SignalDefinition,
  type SignalDiagnostic,
  type SignalSample,
  type SignalUpdateOrigin,
  type SignalUpdateRequest,
  type SignalUpdateResult,
} from './types'

export interface SignalRegistryOptions {
  /** Injectable clock in milliseconds, used for registration timestamps and read-time staleness. */
  now?: () => number
  /** Fallback staleness threshold for definitions that do not declare one. */
  defaultStaleAfterMs?: number
}

interface SignalRecord {
  definition: SignalDefinition
  sample: SignalSample
}

const CONTROLLER_ORIGINS: readonly SignalUpdateOrigin[] = ['controller', 'operator']

/**
 * Deterministic registry of equipment signals.
 *
 * - Registration validates the definition and rejects duplicates.
 * - Updates enforce type/range/enum rules, timestamp ordering, source priority and write policy.
 * - Reads derive staleness from the injectable clock without mutating stored samples.
 * - Snapshots and listings are stable-sorted by signal id.
 */
export class SignalRegistry {
  private readonly records = new Map<string, SignalRecord>()
  private readonly namesByEquipment = new Map<string, Set<string>>()
  private readonly now: () => number
  private readonly defaultStaleAfterMs: number

  constructor(options: SignalRegistryOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.defaultStaleAfterMs = options.defaultStaleAfterMs ?? 10_000
  }

  get size(): number {
    return this.records.size
  }

  register(definition: SignalDefinition): SignalDefinition {
    const diagnostics = validateSignalDefinition(definition)
    if (diagnostics.length > 0) {
      throw new SignalRegistryError(`Signal '${definition.id ?? '<unknown>'}' is invalid.`, diagnostics)
    }
    if (this.records.has(definition.id)) {
      throw new SignalRegistryError(`Signal '${definition.id}' is already registered.`, [
        { severity: 'error', code: 'duplicate-signal-id', message: `Duplicate signal id '${definition.id}'.`, signalId: definition.id },
      ])
    }
    const names = this.namesByEquipment.get(definition.equipmentId) ?? new Set<string>()
    if (names.has(definition.name)) {
      throw new SignalRegistryError(`Equipment '${definition.equipmentId}' already declares a signal named '${definition.name}'.`, [
        {
          severity: 'error',
          code: 'duplicate-signal-name',
          message: `Duplicate signal name '${definition.name}' for equipment '${definition.equipmentId}'.`,
          signalId: definition.id,
        },
      ])
    }

    const stored = structuredClone(definition)
    names.add(stored.name)
    this.namesByEquipment.set(stored.equipmentId, names)
    this.records.set(stored.id, {
      definition: stored,
      sample: {
        signalId: stored.id,
        value: stored.defaultValue,
        quality: 'uncertain',
        source: 'simulated',
        origin: 'import',
        timestamp: new Date(this.now()).toISOString(),
      },
    })
    return stored
  }

  registerMany(definitions: readonly SignalDefinition[]): readonly SignalDefinition[] {
    return definitions.map((definition) => this.register(definition))
  }

  getDefinition(id: string): SignalDefinition | undefined {
    return this.records.get(id)?.definition
  }

  getDefinitionsByEquipment(equipmentId: string): readonly SignalDefinition[] {
    return this.sortedDefinitions().filter((definition) => definition.equipmentId === equipmentId)
  }

  getAllDefinitions(): readonly SignalDefinition[] {
    return this.sortedDefinitions()
  }

  update(request: SignalUpdateRequest): SignalUpdateResult {
    const record = this.records.get(request.signalId)
    if (!record) {
      return { accepted: false, reason: 'unknown-signal', message: `Signal '${request.signalId}' is not registered.` }
    }
    if (!isValidTimestamp(request.timestamp)) {
      return { accepted: false, reason: 'invalid-timestamp', message: `Signal '${request.signalId}' received an invalid timestamp.` }
    }
    const incomingTime = Date.parse(request.timestamp)
    const currentTime = Date.parse(record.sample.timestamp)
    if (incomingTime < currentTime) {
      return { accepted: false, reason: 'stale-timestamp', message: `Signal '${request.signalId}' update is older than the stored sample.` }
    }
    if (incomingTime === currentTime && SIGNAL_SOURCE_PRIORITY[request.source] < SIGNAL_SOURCE_PRIORITY[record.sample.source]) {
      return {
        accepted: false,
        reason: 'lower-priority-source',
        message: `Signal '${request.signalId}' update from '${request.source}' loses to stored source '${record.sample.source}'.`,
      }
    }
    if (CONTROLLER_ORIGINS.includes(request.origin) && !record.definition.writable) {
      return {
        accepted: false,
        reason: 'not-writable',
        message: `Signal '${request.signalId}' is read-only and rejects '${request.origin}' writes.`,
      }
    }
    if (request.quality !== undefined && !(SIGNAL_QUALITIES as readonly string[]).includes(request.quality)) {
      return { accepted: false, reason: 'invalid-quality', message: `Signal '${request.signalId}' received an invalid quality.` }
    }
    const valueDiagnostic = validateSignalValue(record.definition, request.value)
    if (valueDiagnostic) {
      return { accepted: false, reason: rejectionFor(valueDiagnostic), message: valueDiagnostic.message }
    }

    const sample: SignalSample = {
      signalId: request.signalId,
      value: request.value,
      quality: request.quality ?? 'good',
      source: request.source,
      origin: request.origin,
      timestamp: request.timestamp,
    }
    record.sample = sample
    return { accepted: true, sample: { ...sample } }
  }

  read(id: string, at: number = this.now()): SignalSample | null {
    const record = this.records.get(id)
    return record ? this.materialize(record, at) : null
  }

  snapshot(at: number = this.now()): readonly SignalSample[] {
    return [...this.records.values()]
      .map((record) => this.materialize(record, at))
      .sort((left, right) => left.signalId.localeCompare(right.signalId))
  }

  clear(): void {
    this.records.clear()
    this.namesByEquipment.clear()
  }

  private sortedDefinitions(): SignalDefinition[] {
    return [...this.records.values()]
      .map((record) => record.definition)
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  private materialize(record: SignalRecord, at: number): SignalSample {
    const sample: SignalSample = { ...record.sample }
    const staleAfterMs = record.definition.staleAfterMs ?? this.defaultStaleAfterMs
    if (sample.quality === 'good' && at - Date.parse(sample.timestamp) > staleAfterMs) {
      sample.quality = 'stale'
    }
    return sample
  }
}

function rejectionFor(diagnostic: SignalDiagnostic): Extract<SignalUpdateResult, { accepted: false }>['reason'] {
  switch (diagnostic.code) {
    case 'invalid-enum':
      return 'invalid-enum'
    case 'out-of-range':
      return 'out-of-range'
    default:
      return 'type-mismatch'
  }
}
