import { describe, expect, it } from 'vitest'
import { createLearningReport, renderLearningReportHtml } from './report'
import type { TimelineEntry } from '../timeline'
const trace: TimelineEntry[] = [
  { sequence: 1, kind: 'command', payload: { command: 'step-next' }, source: 'simulator', severity: 'info', sessionId: 's', equipmentId: 'e', timestamp: '2026-01-01T00:00:00.000Z', correlationId: 'c', simulated: true },
  { sequence: 2, kind: 'alarm', payload: { faultId: 'f' }, source: 'simulator', severity: 'error', sessionId: 's', equipmentId: 'e', timestamp: '2026-01-01T00:00:01.000Z', correlationId: 'c', simulated: true },
  { sequence: 3, kind: 'acknowledgement', payload: { faultId: 'f' }, source: 'simulator', severity: 'info', sessionId: 's', equipmentId: 'e', timestamp: '2026-01-01T00:00:02.000Z', correlationId: 'c', simulated: true },
  { sequence: 4, kind: 'fault-action', payload: { faultId: 'f', action: 'retry' }, source: 'simulator', severity: 'info', sessionId: 's', equipmentId: 'e', timestamp: '2026-01-01T00:00:03.000Z', correlationId: 'c', simulated: true },
  { sequence: 5, kind: 'state-transition', payload: { to: 'complete' }, source: 'simulator', severity: 'info', sessionId: 's', equipmentId: 'e', timestamp: '2026-01-01T00:00:04.000Z', correlationId: 'c', simulated: true },
]
describe('learning report', () => {
  it('derives report values from a fixed trace and renders concise HTML', () => {
    const report = createLearningReport(trace, '<Ada>', ['step-next'], undefined, () => '2026-01-02T00:00:00.000Z')
    expect(report).toMatchSnapshot()
    expect(renderLearningReportHtml(report)).toContain('Score: 100/100')
  })
})
