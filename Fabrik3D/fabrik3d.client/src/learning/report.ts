import { assessTimeline, type AssessmentResult, type AssessmentRule } from './assessment'
import type { TimelineEntry } from '../timeline'

/** Where an assessment was produced: locally in the browser or authoritatively on the server. */
export type AssessmentAuthority = 'local' | 'server'

/** Educational-scope statement. A local report never claims professional certification. */
export const LOCAL_EDUCATIONAL_SCOPE =
  'Simulated educational training data only. This local report does not certify professional competence, safety qualification or industrial readiness.'

export interface LearningReport {
  schemaVersion: '1.0'
  sessionAlias: string
  generatedAt: string
  simulated: true
  /** S44: assessment authority label. Local reports remain valid offline. */
  assessmentAuthority: AssessmentAuthority
  educationalScope: 'educational'
  disclaimer: string
  metrics: {
    scenarioCompleted: boolean
    stepsAttempted: number
    faultsEncountered: number
    hintsUsed: number
    recoveryActions: number
  }
  assessment: AssessmentResult
  expectedActions: string[]
  observedActions: string[]
}

export function createLearningReport(
  entries: readonly TimelineEntry[],
  sessionAlias: string,
  expectedActions: readonly string[] = [],
  rules?: readonly AssessmentRule[],
  now: () => string = () => new Date().toISOString(),
): LearningReport {
  const commands = entries.filter(e => e.kind === 'command').map(e => String(e.payload.command ?? 'unknown'))
  const observedActions = [
    ...commands,
    ...entries.filter(e => e.kind === 'acknowledgement').map(() => 'acknowledge'),
    ...entries.filter(e => e.kind === 'fault-action').map(e => String(e.payload.action ?? 'unknown')),
  ]
  return {
    schemaVersion: '1.0',
    sessionAlias: sanitizeAlias(sessionAlias),
    generatedAt: now(),
    simulated: true,
    assessmentAuthority: 'local',
    educationalScope: 'educational',
    disclaimer: LOCAL_EDUCATIONAL_SCOPE,
    metrics: {
      scenarioCompleted: entries.some(e => e.kind === 'state-transition' && e.payload.to === 'complete'),
      stepsAttempted: commands.filter(command => command === 'step-next').length,
      faultsEncountered: entries.filter(e => e.kind === 'alarm').length,
      hintsUsed: commands.filter(command => command === 'hint').length,
      recoveryActions: entries.filter(e => e.kind === 'acknowledgement' || e.kind === 'fault-action').length,
    },
    assessment: assessTimeline(entries, rules),
    expectedActions: [...expectedActions],
    observedActions,
  }
}

export function renderLearningReportHtml(report: LearningReport): string {
  const criteria = report.assessment.criteria
    .map(c => `<li><strong>${escape(c.label)}: ${c.passed ? 'passed' : 'not passed'}</strong> — ${escape(c.observed)} (${c.earned}/${c.points})</li>`)
    .join('')
  return `<!doctype html><html><body><h1>Fabrik3D learning report</h1><p>Session alias: ${escape(report.sessionAlias)}. Simulated training data only. Assessment authority: ${escape(report.assessmentAuthority)}.</p><p>Score: ${report.assessment.score}/${report.assessment.possibleScore}</p><ul>${criteria}</ul><p class="disclaimer">${escape(report.disclaimer)}</p></body></html>`
}

export function sanitizeAlias(alias: string): string {
  return alias.trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40) || 'anonymous-learner'
}

function escape(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}
