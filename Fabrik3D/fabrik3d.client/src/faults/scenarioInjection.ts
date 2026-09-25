import type { ScenarioDefinition, ScenarioFaultOverlaySpec } from '../scenarios/types'
import { getFaultDefinition } from './catalog'
import type { FaultController } from './FaultController'
import type { FaultLabController } from './FaultLabController'
import type { OverlayFaultType } from './types'
import { isOverlayFaultType } from './overlayCatalog'
import type { TimelineContext } from '../timeline/TimelineRecorder'

/** Applies declared scenario faults at a reproducible point: scenario start. */
export function injectScenarioFaults(scenario: ScenarioDefinition, controller: FaultController, context: TimelineContext): void {
  for (const type of scenario.faultInjections ?? []) {
    const definition = getFaultDefinition(type)
    controller.inject(definition, 'scenario', { ...context, equipmentId: definition.equipmentId })
  }
}

export interface ScenarioOverlayReader {
  overlays: ScenarioFaultOverlaySpec[]
  diagnostics: string[]
}

/**
 * Compatibility reader for the versioned scenario overlay format (S38).
 *
 * The `faultOverlays` field is optional, so scenario files written before S38
 * remain readable (empty list, no diagnostics). Unknown overlay classes are
 * dropped with a diagnostic instead of guessed, so bad data can never become a
 * live fault.
 */
export function readScenarioFaultOverlays(scenario: ScenarioDefinition): ScenarioOverlayReader {
  const diagnostics: string[] = []
  const raw = (scenario as ScenarioDefinition & { faultOverlays?: unknown }).faultOverlays
  if (raw === undefined) return { overlays: [], diagnostics }
  if (!Array.isArray(raw)) {
    return { overlays: [], diagnostics: [`Scenario '${scenario.id}' faultOverlays must be an array.`] }
  }
  const overlays: ScenarioFaultOverlaySpec[] = []
  for (const [index, candidate] of raw.entries()) {
    if (!candidate || typeof candidate !== 'object') {
      diagnostics.push(`Scenario '${scenario.id}' faultOverlays[${index}] is not an object.`)
      continue
    }
    const spec = candidate as Partial<ScenarioFaultOverlaySpec>
    if (!isOverlayFaultType(spec.type)) {
      diagnostics.push(`Scenario '${scenario.id}' faultOverlays[${index}] has unsupported type '${String(spec.type)}'.`)
      continue
    }
    if (typeof spec.equipmentId !== 'string' || spec.equipmentId.trim() === '') {
      diagnostics.push(`Scenario '${scenario.id}' faultOverlays[${index}] is missing equipmentId.`)
      continue
    }
    overlays.push({
      type: spec.type as OverlayFaultType,
      equipmentId: spec.equipmentId,
      signalIds: Array.isArray(spec.signalIds) ? spec.signalIds.filter((id): id is string => typeof id === 'string') : undefined,
      seed: typeof spec.seed === 'number' ? spec.seed : undefined,
      magnitude: typeof spec.magnitude === 'number' ? spec.magnitude : undefined,
      periodMs: typeof spec.periodMs === 'number' ? spec.periodMs : undefined,
      delayMs: typeof spec.delayMs === 'number' ? spec.delayMs : undefined,
    })
  }
  return { overlays, diagnostics }
}

/** Injects the declared scenario overlays at scenario start. */
export function injectScenarioOverlays(scenario: ScenarioDefinition, lab: FaultLabController, context: TimelineContext): string[] {
  const { overlays, diagnostics } = readScenarioFaultOverlays(scenario)
  for (const spec of overlays) {
    const result = lab.activate({ ...spec, source: 'scenario' }, { ...context, equipmentId: spec.equipmentId })
    for (const diagnostic of result.diagnostics) diagnostics.push(diagnostic.message)
  }
  return diagnostics
}
