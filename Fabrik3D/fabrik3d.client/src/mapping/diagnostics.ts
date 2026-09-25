/** Human-readable, row-addressable diagnostics for signal-mapping files. */

export type MappingDiagnosticSeverity = 'error' | 'warning'

export interface MappingDiagnostic {
  severity: MappingDiagnosticSeverity
  code: string
  message: string
  /** JSON-pointer-ish path of the offending field, when known. */
  path?: string
  /** Mapping entry id this diagnostic belongs to, when known. */
  entryId?: string
}

export function mappingError(code: string, message: string, path?: string, entryId?: string): MappingDiagnostic {
  return { severity: 'error', code, message, path, entryId }
}

export function mappingWarning(code: string, message: string, path?: string, entryId?: string): MappingDiagnostic {
  return { severity: 'warning', code, message, path, entryId }
}

export function hasMappingErrors(diagnostics: readonly MappingDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

/** Thrown when a mapping file cannot be understood at all (not JSON / unsupported version). */
export class MappingFileError extends Error {
  readonly diagnostics: MappingDiagnostic[]

  constructor(message: string, diagnostics: MappingDiagnostic[] = []) {
    super(message)
    this.name = 'MappingFileError'
    this.diagnostics = diagnostics
  }
}
