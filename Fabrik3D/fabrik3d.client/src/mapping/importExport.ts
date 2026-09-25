/** Import/export of mapping files. Import validates before the file may be applied. */

import type { MappingSignalCatalog } from './catalog'
import { hasMappingErrors, type MappingDiagnostic } from './diagnostics'
import { parseMappingFile, serializeMappingFile, type ParseMappingOptions } from './serialization'
import { validateMappingFile, type MappingValidationSummary, summarizeMappingDiagnostics } from './validation'
import type { MappingFileV1 } from './schema'

export interface MappingImportResult {
  file: MappingFileV1
  migrated: boolean
  diagnostics: MappingDiagnostic[]
  validation: MappingValidationSummary
}

/**
 * Parses, migrates and validates a mapping file against the internal signal
 * catalog. Import never applies anything; it only produces a validated artifact.
 */
export function importMappingFile(text: string, catalog: MappingSignalCatalog, options: ParseMappingOptions = {}): MappingImportResult {
  const parsed = parseMappingFile(text, options)
  const validationDiagnostics = validateMappingFile(parsed.file, catalog)
  const diagnostics = [...parsed.diagnostics, ...validationDiagnostics]
  return {
    file: parsed.file,
    migrated: parsed.migrated,
    diagnostics,
    validation: summarizeMappingDiagnostics(diagnostics),
  }
}

/** Exports a mapping file deterministically. Refuses to export a mapping with errors. */
export function exportMappingFile(file: MappingFileV1, catalog?: MappingSignalCatalog): string {
  if (catalog) {
    const diagnostics = validateMappingFile(file, catalog)
    if (hasMappingErrors(diagnostics)) {
      throw new Error('Refusing to export a mapping file with validation errors.')
    }
  }
  return serializeMappingFile(file)
}

/** Triggers a local download of the mapping file (DOM helper, not part of validation). */
export function downloadMappingFile(file: MappingFileV1, filename: string): void {
  const blob = new Blob([serializeMappingFile(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
