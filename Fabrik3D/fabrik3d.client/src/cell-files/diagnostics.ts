/** Human-readable diagnostics for cell files. */

export type DiagnosticSeverity = 'error' | 'warning'

export interface CellFileDiagnostic {
  severity: DiagnosticSeverity
  code: string
  message: string
  /** JSON pointer-ish path for the offending field, when known. */
  path?: string
}

export function errorDiagnostic(code: string, message: string, path?: string): CellFileDiagnostic {
  return { severity: 'error', code, message, path }
}

export function warningDiagnostic(code: string, message: string, path?: string): CellFileDiagnostic {
  return { severity: 'warning', code, message, path }
}

/** Thrown when a cell file cannot be understood (not JSON / unsupported version). */
export class CellFileError extends Error {
  readonly diagnostics: CellFileDiagnostic[]

  constructor(message: string, diagnostics: CellFileDiagnostic[] = []) {
    super(message)
    this.name = 'CellFileError'
    this.diagnostics = diagnostics
  }
}