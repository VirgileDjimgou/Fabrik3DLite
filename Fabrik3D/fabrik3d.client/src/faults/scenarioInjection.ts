import type { ScenarioDefinition } from '../scenarios/types'
import { getFaultDefinition } from './catalog'
import type { FaultController } from './FaultController'
import type { TimelineContext } from '../timeline/TimelineRecorder'

/** Applies declared scenario faults at a reproducible point: scenario start. */
export function injectScenarioFaults(scenario: ScenarioDefinition, controller: FaultController, context: TimelineContext): void {
  for (const type of scenario.faultInjections ?? []) {
    const definition = getFaultDefinition(type)
    controller.inject(definition, 'scenario', { ...context, equipmentId: definition.equipmentId })
  }
}
