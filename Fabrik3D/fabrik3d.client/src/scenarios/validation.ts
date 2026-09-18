/** Human-readable diagnostics for scenario definitions. */

import type { ScenarioDefinition } from './types'

export interface ScenarioDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
}

/**
 * Validates a scenario definition. Returns an empty array when the
 * scenario is conformant. Malformed or missing required data are errors;
 * missing locales are warnings.
 */
export function validateScenario(scenario: ScenarioDefinition): ScenarioDiagnostic[] {
  const diagnostics: ScenarioDiagnostic[] = []

  if (scenario.schemaVersion !== '1.0') {
    diagnostics.push({ severity: 'error', code: 'unsupported_version', message: `Unsupported scenario schemaVersion '${scenario.schemaVersion}'.` })
  }
  if (!scenario.id?.trim()) diagnostics.push({ severity: 'error', code: 'missing_id', message: 'Scenario is missing an id.' })
  if (!scenario.title) diagnostics.push({ severity: 'error', code: 'missing_title', message: `Scenario '${scenario.id}' is missing a title.` })
  if (!scenario.activities?.length) {
    diagnostics.push({ severity: 'error', code: 'missing_activities', message: `Scenario '${scenario.id}' has no activities.` })
  }

  checkLocales(scenario.title, 'title', scenario.id, diagnostics)
  checkLocales(scenario.explanation, 'explanation', scenario.id, diagnostics)
  checkLocales(scenario.instructorNotes, 'instructorNotes', scenario.id, diagnostics)

  if (scenario.level !== 'beginner' && scenario.level !== 'intermediate' && scenario.level !== 'advanced') {
    diagnostics.push({ severity: 'error', code: 'invalid_level', message: `Scenario '${scenario.id}' has an invalid level.` })
  }

  const ids = new Set<string>()
  for (const activity of scenario.activities ?? []) {
    if (!activity.id?.trim()) {
      diagnostics.push({ severity: 'error', code: 'missing_activity_id', message: `Scenario '${scenario.id}' has an activity without id.` })
      continue
    }
    if (ids.has(activity.id)) diagnostics.push({ severity: 'error', code: 'duplicate_activity_id', message: `Scenario '${scenario.id}' has duplicate activity '${activity.id}'.` })
    ids.add(activity.id)

    checkLocales(activity.title, `activities.${activity.id}.title`, scenario.id, diagnostics)
    checkLocales(activity.instruction, `activities.${activity.id}.instruction`, scenario.id, diagnostics)
    if (activity.expectedEvent && !activity.expectedEvent.type) {
      diagnostics.push({ severity: 'error', code: 'missing_event_type', message: `Activity '${activity.id}' has an expected event without a type.` })
    }
  }

  for (const [index, objective] of (scenario.learningObjectives ?? []).entries()) {
    checkLocales(objective, `learningObjectives[${index}]`, scenario.id, diagnostics)
  }
  for (const [index, criterion] of (scenario.successCriteria ?? []).entries()) {
    checkLocales(criterion, `successCriteria[${index}]`, scenario.id, diagnostics)
  }

  return diagnostics
}

function checkLocales(text: { en?: string; fr?: string; de?: string } | undefined, field: string, id: string, diagnostics: ScenarioDiagnostic[]): void {
  if (!text) return
  for (const locale of ['en', 'fr', 'de'] as const) {
    if (!text[locale]?.trim()) {
      diagnostics.push({ severity: 'warning', code: 'missing_locale', message: `Scenario '${id}' field '${field}' is missing the '${locale}' translation.` })
    }
  }
}