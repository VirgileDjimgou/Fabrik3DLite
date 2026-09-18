import type { TimelineEntry } from '../timeline'

export interface AssessmentRule {
  id: string
  label: string
  description: string
  points: number
  evaluate(entries: readonly TimelineEntry[]): { passed: boolean; observed: string }
}
export interface AssessmentCriterionResult { id: string; label: string; description: string; points: number; earned: number; passed: boolean; observed: string }
export interface AssessmentResult { score: number; possibleScore: number; criteria: AssessmentCriterionResult[] }
const events = (entries: readonly TimelineEntry[], kind: TimelineEntry['kind']) => entries.filter(entry => entry.kind === kind)
export const DEFAULT_ASSESSMENT_RULES: readonly AssessmentRule[] = [
  { id: 'scenario-completed', label: 'Scenario completed', description: 'The trace records a completed workflow state.', points: 40, evaluate: entries => {
    const passed = events(entries, 'state-transition').some(e => e.payload.to === 'complete')
    return { passed, observed: passed ? 'Completed state recorded.' : 'No completed state recorded.' }
  } },
  { id: 'recovered-faults', label: 'Fault recovery', description: 'Every encountered simulated fault was acknowledged and retried.', points: 40, evaluate: entries => {
    const faults = events(entries, 'alarm').map(e => String(e.payload.faultId)).filter(Boolean)
    const retried = new Set(events(entries, 'fault-action').filter(e => e.payload.action === 'retry').map(e => String(e.payload.faultId)))
    const passed = faults.every(id => retried.has(id)
)
    return { passed, observed: faults.length ? `${faults.filter(id => retried.has(id)).length}/${faults.length} faults recovered.` : 'No faults encountered.' }
  } },
  { id: 'guided-steps', label: 'Guided steps', description: 'Each paused learning checkpoint was advanced deliberately.', points: 20, evaluate: entries => {
    const checkpoints = events(entries, 'telemetry').filter(e => e.payload.event === 'learning-checkpoint').length
    const attempts = events(entries, 'command').filter(e => e.payload.command === 'step-next').length
    return { passed: checkpoints === 0 || attempts >= checkpoints, observed: `${attempts}/${checkpoints} checkpoint advances.` }
  } },
]
export function assessTimeline(entries: readonly TimelineEntry[], rules: readonly AssessmentRule[] = DEFAULT_ASSESSMENT_RULES): AssessmentResult {
  const criteria = rules.map(rule => { const outcome = rule.evaluate(entries); return { id: rule.id, label: rule.label, description: rule.description, points: rule.points, earned: outcome.passed ? rule.points : 0, ...outcome } })
  return { score: criteria.reduce((sum, result) => sum + result.earned, 0), possibleScore: criteria.reduce((sum, result) => sum + result.points, 0), criteria }
}
