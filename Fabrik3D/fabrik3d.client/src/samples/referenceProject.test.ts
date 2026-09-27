/**
 * S50 integrity test for the shipped 1.0 reference sample project.
 *
 * The sample project lives under `docs/samples/fabrik3d-1.0-reference-project/`
 * and must stay valid against the real cell-file, signal-mapping, scenario and
 * scene-preset implementations. This test opens every component with the same
 * parsers the application uses, so a drifting sample is caught by CI rather
 * than by a new user.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCellFile, serializeCellFile } from '../cell-files/importExport'
import { buildSampleCell } from '../cell-files/sampleCells'
import { hasMappingErrors } from '../mapping/diagnostics'
import { importMappingFile } from '../mapping/importExport'
import { createReferenceCellCatalog } from '../mapping/testFixtures'
import { SCENARIO_CATALOG } from '../scenarios/catalog'
import { BUILT_IN_SCENE_PRESETS } from '../scenes/catalog'

// Vitest runs with the client package directory as its working directory.
const PROJECT_DIR = resolve(process.cwd(), '../../docs/samples/fabrik3d-1.0-reference-project')
const CANONICAL_SAMPLES_DIR = resolve(process.cwd(), '../../docs/architecture/samples')

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(PROJECT_DIR, relativePath), 'utf8')) as T
}

interface SampleProjectManifest {
  schemaVersion: string
  id: string
  productVersion: string
  cell: { file: string; schemaVersion: string; robotId: string; scenePresetId: string }
  scenario: { id: string; source: string }
  mapping: { file: string; id: string; schemaVersion: string }
  trainingSession: { file: string; reportKind: string; schemaVersion: string }
}

describe('1.0 reference sample project', () => {
  const manifest = readJson<SampleProjectManifest>('project.json')

  it('declares a current-schema manifest with all four components', () => {
    expect(manifest.schemaVersion).toBe('1.0')
    expect(manifest.id).toBe('fabrik3d-1.0-reference-project')
    expect(manifest.productVersion).toMatch(/^1\.0\./)
    expect(manifest.cell.file).toBeTruthy()
    expect(manifest.scenario.source).toBe('built-in-catalog')
    expect(manifest.mapping.file).toBeTruthy()
    expect(manifest.trainingSession.file).toBeTruthy()
  })

  it('opens the cell component as the built-in reference cell with no validation errors', () => {
    const text = readFileSync(join(PROJECT_DIR, manifest.cell.file), 'utf8')
    const { cell, diagnostics } = parseCellFile(text)
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(cell).toEqual(buildSampleCell(manifest.cell.robotId as 'medium-6axis'))
    expect(serializeCellFile(cell)).toBe(serializeCellFile(buildSampleCell(manifest.cell.robotId as 'medium-6axis')))
  })

  it('resolves the referenced scene preset and learning scenario', () => {
    expect(BUILT_IN_SCENE_PRESETS.map((preset) => preset.id)).toContain(manifest.cell.scenePresetId)
    const scenario = SCENARIO_CATALOG.find((candidate) => candidate.id === manifest.scenario.id)
    expect(scenario).toBeDefined()
    expect(scenario?.cellTemplateId).toBe('single-conveyor-machining-cell')
  })

  it('opens the mapping component against the real reference-cell signal catalog', () => {
    const text = readFileSync(join(PROJECT_DIR, manifest.mapping.file), 'utf8')
    const result = importMappingFile(text, createReferenceCellCatalog())
    expect(hasMappingErrors(result.diagnostics)).toBe(false)
    expect(result.file.id).toBe(manifest.mapping.id)
    expect(result.validation.errors).toEqual([])
  })

  it('keeps the packaged mapping and training-session copies identical to the canonical samples', () => {
    const mapping = readJson(manifest.mapping.file)
    const canonicalMapping = JSON.parse(readFileSync(join(CANONICAL_SAMPLES_DIR, 'reference-cell-mapping.json'), 'utf8'))
    expect(mapping).toEqual(canonicalMapping)

    const session = readJson(manifest.trainingSession.file)
    const canonicalSession = JSON.parse(readFileSync(join(CANONICAL_SAMPLES_DIR, 'training-session-report.sample.json'), 'utf8'))
    expect(session).toEqual(canonicalSession)
  })

  it('provides a well-formed educational training-session report', () => {
    const session = readJson<{
      schemaVersion: string
      reportKind: string
      educationalScope: string
      assessmentAuthority: string
      assessment: { criteria: unknown[] }
      session: { scenarioId: string; completed: boolean }
    }>(manifest.trainingSession.file)
    const preset = BUILT_IN_SCENE_PRESETS.find((candidate) => candidate.id === manifest.cell.scenePresetId)
    expect(session.schemaVersion).toBe('1.0')
    expect(session.reportKind).toBe(manifest.trainingSession.reportKind)
    expect(session.assessmentAuthority).toBe('server')
    expect(session.educationalScope).toBe('educational')
    // The example report is a reference-cell run; it must belong to a scenario the reference cell supports.
    expect(preset?.compatibleScenarioIds).toContain(session.session.scenarioId)
    expect(session.session.completed).toBe(true)
    expect(session.assessment.criteria.length).toBeGreaterThan(0)
  })
})
