import { TimelineRecorder, type TimelineContext } from '../timeline/TimelineRecorder'
import type { ActiveFault, FaultAction, FaultDefinition, FaultSource } from './types'

export class FaultController {
  private sequence = 0
  private readonly active = new Map<string, ActiveFault>()
  onPauseRequested: (() => void) | null = null
  onRetryRequested: (() => void) | null = null

  constructor(private readonly timeline: TimelineRecorder, private readonly now: () => string = () => new Date().toISOString()) {}

  inject(definition: FaultDefinition, source: FaultSource, context: TimelineContext): ActiveFault {
    const fault: ActiveFault = { ...definition, id: `fault-${++this.sequence}`, source, sessionId: context.sessionId, correlationId: context.correlationId, raisedAt: this.now() }
    this.active.set(fault.id, fault)
    this.timeline.record('alarm', definition.severity, context, { faultId: fault.id, type: fault.type, source, simulated: true })
    if (fault.pauseWorkflow) this.onPauseRequested?.()
    return fault
  }

  act(id: string, action: FaultAction, context: TimelineContext): ActiveFault {
    const fault = this.active.get(id)
    if (!fault) throw new Error(`Fault '${id}' is not active.`)
    if (action === 'acknowledge') {
      if (fault.acknowledgedAt) throw new Error(`Fault '${id}' was already acknowledged.`)
      fault.acknowledgedAt = this.now()
      this.timeline.record('acknowledgement', 'info', context, { faultId: id })
      return fault
    }
    if (fault.requiresAcknowledgement && !fault.acknowledgedAt) throw new Error(`Fault '${id}' must be acknowledged before ${action}.`)
    if (action === 'reset') { fault.resetAt = this.now(); this.timeline.record('fault-action', 'info', context, { faultId: id, action }); return fault }
    if (fault.requiresReset && !fault.resetAt) throw new Error(`Fault '${id}' must be reset before retry.`)
    this.timeline.record('fault-action', 'info', context, { faultId: id, action })
    this.active.delete(id)
    this.onRetryRequested?.()
    return fault
  }

  get activeFaults(): readonly ActiveFault[] { return [...this.active.values()] }
}
