/**
 * Mapping conflict detection.
 *
 * Deterministic, side-effect-free analysis independent of validation. Conflicts
 * are surfaced with severity and an explanation so a technician can act on them.
 */

import { directionAllowsWrite, mappingTargetKey, type MappingEntryV1, type MappingFileV1 } from './schema'
import type { MappingDiagnosticSeverity } from './diagnostics'

export interface MappingConflict {
  severity: MappingDiagnosticSeverity
  code: 'duplicate-write-target' | 'incompatible-signal-mapping'
  message: string
  entryIds: string[]
  targetKey?: string
  signalId?: string
}

/**
 * Flags:
 * - two entries that both write the same external target (unsafe duplicate);
 * - the same internal signal mapped to incompatible targets.
 */
export function detectMappingConflicts(file: MappingFileV1): MappingConflict[] {
  const conflicts: MappingConflict[] = []
  const entries = Array.isArray(file.entries) ? file.entries : []

  const writersByTarget = new Map<string, MappingEntryV1[]>()
  const entriesBySignal = new Map<string, MappingEntryV1[]>()

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    if (directionAllowsWrite(entry.direction)) {
      const key = mappingTargetKey(entry)
      const bucket = writersByTarget.get(key) ?? []
      bucket.push(entry)
      writersByTarget.set(key, bucket)
    }
    const signalBucket = entriesBySignal.get(entry.internalSignalId) ?? []
    signalBucket.push(entry)
    entriesBySignal.set(entry.internalSignalId, signalBucket)
  }

  for (const [targetKey, writers] of [...writersByTarget.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (writers.length < 2) continue
    conflicts.push({
      severity: 'error',
      code: 'duplicate-write-target',
      message: `External target '${targetKey}' is written by ${writers.length} mappings (${writers
        .map((entry) => entry.id)
        .join(', ')}); ambiguous writes are unsafe.`,
      entryIds: writers.map((entry) => entry.id),
      targetKey,
    })
  }

  for (const [signalId, mappings] of [...entriesBySignal.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (mappings.length < 2) continue
    const protocols = new Set(mappings.map((entry) => entry.protocol))
    const directions = new Set(mappings.map((entry) => entry.direction))
    const dataTypes = new Set(mappings.map((entry) => entry.dataType))
    if (protocols.size > 1 || directions.size > 1 || dataTypes.size > 1) {
      conflicts.push({
        severity: 'warning',
        code: 'incompatible-signal-mapping',
        message: `Internal signal '${signalId}' is mapped to incompatible targets (${mappings
          .map((entry) => `${entry.id}:${entry.protocol}/${entry.direction}/${entry.dataType}`)
          .join(', ')}).`,
        entryIds: mappings.map((entry) => entry.id),
        signalId,
      })
    }
  }

  return conflicts
}
