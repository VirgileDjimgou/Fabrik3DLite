/**
 * Versioned, protocol-independent industrial signal model.
 *
 * The signal core decouples equipment behaviour from controllers: equipment declares
 * typed I/O, the registry validates and arbitrates values, and future transports
 * (OPC UA, MQTT, Modbus) map wire data onto the same canonical model.
 *
 * All values are SI-based where a physical unit exists. This module has no Vue,
 * Three.js, protocol or browser dependency so it stays unit-testable and reusable.
 */

export const SIGNAL_SCHEMA_VERSION = '1.0' as const

export const SIGNAL_DATA_TYPES = ['bool', 'int', 'uint', 'float', 'enum', 'string'] as const
export type SignalDataType = (typeof SIGNAL_DATA_TYPES)[number]

/**
 * Direction is expressed relative to the controller boundary:
 * - `input-to-controller`: physical/logical input read by a controller (sensor, feedback).
 * - `output-from-controller`: controller output that drives an actuator.
 * - `internal`: used inside the equipment model only.
 * - `telemetry-only`: exposed for observation, never usable as a command.
 */
export const SIGNAL_DIRECTIONS = ['input-to-controller', 'output-from-controller', 'internal', 'telemetry-only'] as const
export type SignalDirection = (typeof SIGNAL_DIRECTIONS)[number]

export const SIGNAL_QUALITIES = ['good', 'stale', 'bad', 'uncertain', 'invalid'] as const
export type SignalQuality = (typeof SIGNAL_QUALITIES)[number]

/** Mirrors the normalized twin sources so both models stay aligned. */
export const SIGNAL_SOURCES = ['commanded', 'simulated', 'observed', 'replay'] as const
export type SignalSource = (typeof SIGNAL_SOURCES)[number]
export const SIGNAL_SOURCE_PRIORITY: Record<SignalSource, number> = { commanded: 0, replay: 1, simulated: 2, observed: 3 }

/** Describes what produced the last value, independently of the twin source. */
export const SIGNAL_UPDATE_ORIGINS = ['simulation', 'controller', 'scenario', 'fault-injection', 'operator', 'import', 'replay'] as const
export type SignalUpdateOrigin = (typeof SIGNAL_UPDATE_ORIGINS)[number]

export const SIGNAL_SEMANTIC_CATEGORIES = ['command', 'status', 'measurement', 'safety', 'diagnostic', 'configuration'] as const
export type SignalSemanticCategory = (typeof SIGNAL_SEMANTIC_CATEGORIES)[number]

export type SignalValue = boolean | number | string

export interface SignalDefinition {
  /** Stable, globally unique id. The bridge convention is `<equipmentId>.<name>`. */
  id: string
  equipmentId: string
  /** Stable machine name, unique per equipment. */
  name: string
  displayName: string
  description?: string
  direction: SignalDirection
  dataType: SignalDataType
  engineeringUnit?: string
  /** Whether a controller/operator origin may write this signal. Simulation writes are not restricted. */
  writable: boolean
  min?: number
  max?: number
  enumValues?: string[]
  defaultValue: SignalValue
  safeValue?: SignalValue
  semanticCategory?: SignalSemanticCategory
  /** Read-time staleness threshold; falls back to the registry default. */
  staleAfterMs?: number
}

/** Equipment definitions declare signals without repeating the equipment id. */
export interface EquipmentSignalDeclaration {
  name: string
  displayName: string
  description?: string
  direction: SignalDirection
  dataType: SignalDataType
  engineeringUnit?: string
  writable?: boolean
  min?: number
  max?: number
  enumValues?: string[]
  defaultValue: SignalValue
  safeValue?: SignalValue
  semanticCategory?: SignalSemanticCategory
  staleAfterMs?: number
}

export interface SignalSample {
  signalId: string
  value: SignalValue
  quality: SignalQuality
  source: SignalSource
  origin: SignalUpdateOrigin
  timestamp: string
}

export interface SignalSnapshot {
  schemaVersion: typeof SIGNAL_SCHEMA_VERSION
  generatedAt: string
  signals: SignalSample[]
}

export interface SignalDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  signalId?: string
}

export interface SignalUpdateRequest {
  signalId: string
  value: SignalValue
  source: SignalSource
  origin: SignalUpdateOrigin
  timestamp: string
  quality?: SignalQuality
}

export type SignalUpdateRejection =
  | 'unknown-signal'
  | 'not-writable'
  | 'invalid-timestamp'
  | 'stale-timestamp'
  | 'lower-priority-source'
  | 'invalid-quality'
  | 'type-mismatch'
  | 'out-of-range'
  | 'invalid-enum'
  | 'runtime-rejected'

export type SignalUpdateResult =
  | { accepted: true; sample: SignalSample }
  | { accepted: false; reason: SignalUpdateRejection; message: string }

export class SignalRegistryError extends Error {
  readonly diagnostics: SignalDiagnostic[]

  constructor(message: string, diagnostics: SignalDiagnostic[] = []) {
    super(message)
    this.name = 'SignalRegistryError'
    this.diagnostics = diagnostics
  }
}

export function isValidSignalId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)
}

export function isValidTimestamp(value: string): boolean {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))
}

function typeMismatch(definition: SignalDefinition, value: SignalValue): SignalDiagnostic {
  return {
    severity: 'error',
    code: 'type-mismatch',
    message: `Signal '${definition.id}' expects ${definition.dataType} but received ${typeof value} '${String(value)}'.`,
    signalId: definition.id,
  }
}

function outOfRange(definition: SignalDefinition, value: number): SignalDiagnostic {
  const bounds = [definition.min !== undefined ? `min ${definition.min}` : null, definition.max !== undefined ? `max ${definition.max}` : null]
    .filter((part): part is string => part !== null)
    .join(', ')
  return {
    severity: 'error',
    code: 'out-of-range',
    message: `Signal '${definition.id}' value ${value} is outside the declared range (${bounds}).`,
    signalId: definition.id,
  }
}

/** Returns a diagnostic when `value` is not valid for the definition, otherwise null. */
export function validateSignalValue(definition: SignalDefinition, value: SignalValue): SignalDiagnostic | null {
  if (!SIGNAL_DATA_TYPES.includes(definition.dataType)) {
    return {
      severity: 'error',
      code: 'invalid-data-type',
      message: `Signal '${definition.id}' has unsupported data type '${String(definition.dataType)}'.`,
      signalId: definition.id,
    }
  }
  switch (definition.dataType) {
    case 'bool':
      if (typeof value !== 'boolean') return typeMismatch(definition, value)
      return null
    case 'int':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) return typeMismatch(definition, value)
      break
    case 'uint':
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return typeMismatch(definition, value)
      break
    case 'float':
      if (typeof value !== 'number' || !Number.isFinite(value)) return typeMismatch(definition, value)
      break
    case 'enum':
      if (typeof value !== 'string') return typeMismatch(definition, value)
      if (!(definition.enumValues ?? []).includes(value)) {
        return {
          severity: 'error',
          code: 'invalid-enum',
          message: `Signal '${definition.id}' does not accept enum value '${value}'.`,
          signalId: definition.id,
        }
      }
      return null
    case 'string':
      if (typeof value !== 'string') return typeMismatch(definition, value)
      return null
  }
  if (typeof value === 'number') {
    if (definition.min !== undefined && value < definition.min) return outOfRange(definition, value)
    if (definition.max !== undefined && value > definition.max) return outOfRange(definition, value)
  }
  return null
}

/** Validates a full definition and returns every diagnostic instead of throwing. */
export function validateSignalDefinition(definition: SignalDefinition): SignalDiagnostic[] {
  const diagnostics: SignalDiagnostic[] = []
  const fail = (code: string, message: string): void => {
    diagnostics.push({ severity: 'error', code, message, signalId: definition.id })
  }
  if (typeof definition.id !== 'string' || definition.id.trim() === '') fail('invalid-id', 'Signal id is required.')
  else if (!isValidSignalId(definition.id)) fail('invalid-id', `Signal id '${definition.id}' must match [A-Za-z0-9][A-Za-z0-9._-]*.`)
  if (typeof definition.equipmentId !== 'string' || definition.equipmentId.trim() === '') fail('invalid-equipment-id', 'Signal equipmentId is required.')
  if (typeof definition.name !== 'string' || definition.name.trim() === '') fail('invalid-name', 'Signal name is required.')
  if (typeof definition.displayName !== 'string' || definition.displayName.trim() === '') fail('invalid-display-name', 'Signal displayName is required.')
  if (!SIGNAL_DATA_TYPES.includes(definition.dataType)) fail('invalid-data-type', `Unsupported data type '${String(definition.dataType)}'.`)
  if (!SIGNAL_DIRECTIONS.includes(definition.direction)) fail('invalid-direction', `Unsupported direction '${String(definition.direction)}'.`)
  if (typeof definition.writable !== 'boolean') fail('invalid-writable', 'Signal writable must be a boolean.')
  if (definition.semanticCategory !== undefined && !SIGNAL_SEMANTIC_CATEGORIES.includes(definition.semanticCategory)) {
    fail('invalid-semantic-category', `Unsupported semantic category '${String(definition.semanticCategory)}'.`)
  }
  const numeric = definition.dataType === 'int' || definition.dataType === 'uint' || definition.dataType === 'float'
  if (definition.min !== undefined && !numeric) fail('bounds-not-supported', 'min is only supported for int, uint and float signals.')
  if (definition.max !== undefined && !numeric) fail('bounds-not-supported', 'max is only supported for int, uint and float signals.')
  if (definition.min !== undefined && !Number.isFinite(definition.min)) fail('invalid-bounds', 'min must be finite.')
  if (definition.max !== undefined && !Number.isFinite(definition.max)) fail('invalid-bounds', 'max must be finite.')
  if (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max) {
    fail('invalid-bounds', `min (${definition.min}) must be lower than or equal to max (${definition.max}).`)
  }
  if (definition.dataType === 'enum') {
    if (!definition.enumValues || definition.enumValues.length === 0) fail('missing-enum-values', 'Enum signals require enumValues.')
    else if (new Set(definition.enumValues).size !== definition.enumValues.length) fail('duplicate-enum-values', 'enumValues must not contain duplicates.')
  } else if (definition.enumValues !== undefined) {
    fail('unexpected-enum-values', 'enumValues is only supported for enum signals.')
  }
  if (definition.staleAfterMs !== undefined && (!Number.isFinite(definition.staleAfterMs) || definition.staleAfterMs <= 0)) {
    fail('invalid-stale-after', 'staleAfterMs must be a positive finite number.')
  }
  if (SIGNAL_DATA_TYPES.includes(definition.dataType)) {
    const defaultDiagnostic = validateSignalValue(definition, definition.defaultValue)
    if (defaultDiagnostic) {
      diagnostics.push({ ...defaultDiagnostic, code: 'invalid-default-value', message: `Default value is invalid: ${defaultDiagnostic.message}` })
    }
    if (definition.safeValue !== undefined) {
      const safeDiagnostic = validateSignalValue(definition, definition.safeValue)
      if (safeDiagnostic) {
        diagnostics.push({ ...safeDiagnostic, code: 'invalid-safe-value', message: `Safe value is invalid: ${safeDiagnostic.message}` })
      }
    }
  }
  return diagnostics
}
