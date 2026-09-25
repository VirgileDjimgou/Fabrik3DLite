import {
  SIGNAL_SCHEMA_VERSION,
  isValidTimestamp,
  type SignalDiagnostic,
  type SignalSample,
  type SignalSnapshot,
  type SignalValue,
} from './types'

export type SignalSnapshotMigration = (raw: unknown) => unknown

const migrations = new Map<string, Map<string, SignalSnapshotMigration>>()

/**
 * Registers a one-way migration between snapshot schema versions.
 * Migrations are applied in order until the current version is reached.
 */
export function registerSignalSnapshotMigration(from: string, to: string, migrate: SignalSnapshotMigration): void {
  const targets = migrations.get(from) ?? new Map<string, SignalSnapshotMigration>()
  targets.set(to, migrate)
  migrations.set(from, targets)
}

/** Test/maintenance helper: removes every registered migration. */
export function clearSignalSnapshotMigrations(): void {
  migrations.clear()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSignalValue(value: unknown): value is SignalValue {
  if (typeof value === 'boolean' || typeof value === 'string') return true
  return typeof value === 'number' && Number.isFinite(value)
}

function pushError(diagnostics: SignalDiagnostic[], code: string, message: string, signalId?: string): void {
  diagnostics.push({ severity: 'error', code, message, signalId })
}

function validateSample(entry: unknown, diagnostics: SignalDiagnostic[]): SignalSample | null {
  if (!isRecord(entry)) {
    pushError(diagnostics, 'malformed-signal', 'Snapshot signal entry must be an object.')
    return null
  }
  const signalId = entry.signalId
  if (typeof signalId !== 'string' || signalId.trim() === '') {
    pushError(diagnostics, 'invalid-signal-id', 'Snapshot signal entry requires a signalId.')
    return null
  }
  if (!isSignalValue(entry.value)) {
    pushError(diagnostics, 'invalid-signal-value', `Snapshot signal '${signalId}' has an invalid value.`, signalId)
    return null
  }
  const quality = entry.quality
  if (typeof quality !== 'string' || !['good', 'stale', 'bad', 'uncertain', 'invalid'].includes(quality)) {
    pushError(diagnostics, 'invalid-quality', `Snapshot signal '${signalId}' has an invalid quality.`, signalId)
    return null
  }
  const source = entry.source
  if (typeof source !== 'string' || !['commanded', 'simulated', 'observed', 'replay'].includes(source)) {
    pushError(diagnostics, 'invalid-source', `Snapshot signal '${signalId}' has an invalid source.`, signalId)
    return null
  }
  const origin = entry.origin
  if (
    typeof origin !== 'string' ||
    !['simulation', 'controller', 'scenario', 'fault-injection', 'operator', 'import', 'replay'].includes(origin)
  ) {
    pushError(diagnostics, 'invalid-origin', `Snapshot signal '${signalId}' has an invalid update origin.`, signalId)
    return null
  }
  const timestamp = entry.timestamp
  if (typeof timestamp !== 'string' || !isValidTimestamp(timestamp)) {
    pushError(diagnostics, 'invalid-timestamp', `Snapshot signal '${signalId}' has an invalid timestamp.`, signalId)
    return null
  }
  return {
    signalId,
    value: entry.value,
    quality: quality as SignalSample['quality'],
    source: source as SignalSample['source'],
    origin: origin as SignalSample['origin'],
    timestamp,
  }
}

function applyMigrations(
  raw: unknown,
  from: string,
  diagnostics: SignalDiagnostic[],
): { value: unknown; version: string } | null {
  const visited = new Set<string>([from])
  const queue: Array<{ value: unknown; version: string }> = [{ value: raw, version: from }]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    for (const [to, migrate] of migrations.get(current.version) ?? new Map<string, SignalSnapshotMigration>()) {
      if (visited.has(to)) continue
      let migrated: unknown
      try {
        migrated = migrate(current.value)
      } catch (error) {
        pushError(diagnostics, 'migration-failed', `Migration ${current.version} -> ${to} failed: ${(error as Error).message}`)
        continue
      }
      if (to === SIGNAL_SCHEMA_VERSION) {
        diagnostics.push({ severity: 'warning', code: 'migration-applied', message: `Snapshot migrated from ${from} to ${to}.` })
        return { value: migrated, version: to }
      }
      visited.add(to)
      queue.push({ value: migrated, version: to })
    }
  }
  pushError(diagnostics, 'unsupported-schema-version', `Unsupported snapshot schema version '${from}'.`)
  return null
}

/** Deterministic serialization: signals are sorted by id and keys follow the documented order. */
export function serializeSignalSnapshot(snapshot: SignalSnapshot): string {
  const signals = [...snapshot.signals]
    .sort((left, right) => left.signalId.localeCompare(right.signalId))
    .map((sample) => ({
      signalId: sample.signalId,
      value: sample.value,
      quality: sample.quality,
      source: sample.source,
      origin: sample.origin,
      timestamp: sample.timestamp,
    }))
  return JSON.stringify({ schemaVersion: snapshot.schemaVersion, generatedAt: snapshot.generatedAt, signals }, null, 2)
}

export function parseSignalSnapshot(json: string): { snapshot: SignalSnapshot | null; diagnostics: SignalDiagnostic[] } {
  const diagnostics: SignalDiagnostic[] = []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    pushError(diagnostics, 'malformed-snapshot', 'Snapshot is not valid JSON.')
    return { snapshot: null, diagnostics }
  }
  if (!isRecord(raw)) {
    pushError(diagnostics, 'malformed-snapshot', 'Snapshot must be a JSON object.')
    return { snapshot: null, diagnostics }
  }
  let version = typeof raw.schemaVersion === 'string' ? raw.schemaVersion : undefined
  if (!version) {
    pushError(diagnostics, 'missing-schema-version', 'Snapshot requires a schemaVersion.')
    return { snapshot: null, diagnostics }
  }
  let candidate: unknown = raw
  if (version !== SIGNAL_SCHEMA_VERSION) {
    const migrated = applyMigrations(raw, version, diagnostics)
    if (!migrated) return { snapshot: null, diagnostics }
    candidate = migrated.value
    version = migrated.version
  }
  if (!isRecord(candidate)) {
    pushError(diagnostics, 'malformed-snapshot', 'Migrated snapshot must be a JSON object.')
    return { snapshot: null, diagnostics }
  }
  const rawSignals = candidate.signals
  if (!Array.isArray(rawSignals)) {
    pushError(diagnostics, 'malformed-snapshot', "Snapshot 'signals' must be an array.")
    return { snapshot: null, diagnostics }
  }
  const signals: SignalSample[] = []
  for (const entry of rawSignals) {
    const sample = validateSample(entry, diagnostics)
    if (sample) signals.push(sample)
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { snapshot: null, diagnostics }
  }
  const generatedAt = typeof candidate.generatedAt === 'string' && isValidTimestamp(candidate.generatedAt)
    ? candidate.generatedAt
    : new Date(0).toISOString()
  return {
    snapshot: { schemaVersion: SIGNAL_SCHEMA_VERSION, generatedAt, signals: signals.sort((left, right) => left.signalId.localeCompare(right.signalId)) },
    diagnostics,
  }
}
