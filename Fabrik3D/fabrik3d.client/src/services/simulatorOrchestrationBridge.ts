/**
 * Orchestration bridge — the only module that knows both the local
 * simulator workflow and the backend REST / SignalR contracts.
 *
 * Responsibilities:
 *   • Claim an existing runnable job + session instead of creating implicit jobs
 *   • Map backend tasks to pallet slots and report task status transitions
 *   • Push machine-state and simulation-session updates periodically
 *   • Listen to backend SignalR events and align local workflow
 *   • Send heartbeats while a session is active
 *   • Fall back to a clearly identified local-only offline demo mode
 */

import type { PalletMachiningWorkflow, PalletWorkflowPhase, WorkflowRunState } from '../simulation/PalletMachiningWorkflow'
import type { PalletData } from '../simulation/PalletModels'
import type { ScenarioProgress } from '../scenarios/types'
import type { TaskDto } from '@fabrik3d/contracts'
import * as api from './orchestratorApi'
import * as hub from './orchestratorSignalR'
import { logBridge } from './devLogger'

// ── Active orchestration context ───────────────────────────────────

export interface OrchestrationContext {
  jobId: string | null
  sessionId: string | null
  palletId: string | null
  taskId: string | null
  correlationId: string | null
}

/** Orchestration mode: online = driven by a claimed server job. */
export type BridgeMode = 'online' | 'offline'

interface SlotTaskMapping {
  taskId: string
  row: number
  col: number
}

// ── Bridge class ───────────────────────────────────────────────────

export class SimulatorOrchestrationBridge {
  ctx: OrchestrationContext = {
    jobId: null, sessionId: null, palletId: null, taskId: null, correlationId: null,
  }

  /** Online when a server job/session was claimed; offline = local demo only. */
  mode: BridgeMode = 'offline'

  /** Live hub connection state for the dashboard. */
  connectionState: hub.ConnectionState = 'disconnected'

  /** Last known session status from the server (e.g. Faulted). */
  sessionStatus: string | null = null

  /** Callbacks the scene component can set to react to external state changes. */
  onExternalPause: (() => void) | null = null
  onExternalResume: (() => void) | null = null
  onExternalStop: (() => void) | null = null
  onModeChanged: ((mode: BridgeMode) => void) | null = null
  onConnectionStateChanged: ((state: hub.ConnectionState) => void) | null = null
  onSessionStatusChanged: ((status: string | null) => void) | null = null

  /** Optional scenario progress provider so scenario state is observable through the orchestrator. */
  scenarioSnapshot: (() => ScenarioProgress | null) | null = null

  private workflow: PalletMachiningWorkflow | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reportTimer: ReturnType<typeof setInterval> | null = null
  private lastReportedPhase: PalletWorkflowPhase | null = null
  private lastStartedSlotKey: string | null = null
  private slotTasks: SlotTaskMapping[] = []

  // ── Lifecycle ────────────────────────────────────────────────

  /** Call once when the scene initialises. */
  async init(): Promise<void> {
    hub.on({
      onJobStateChanged: (evt) => this.handleJobStateChanged(evt),
      onSimulationStateChanged: (evt) => this.handleSimulationStateChanged(evt),
      onAlarmRaised: (evt) => console.log('[Bridge] Alarm:', evt.title, evt.message),
      onOperatorMessage: (evt) => console.log('[Bridge] Message:', evt.title, evt.message),
      onConnectionStateChanged: (state) => {
        this.connectionState = state
        this.onConnectionStateChanged?.(state)
      },
    })
    try {
      await hub.connect()
      this.connectionState = 'connected'
      console.log('[Bridge] Orchestration connected')
    } catch {
      this.connectionState = 'disconnected'
    }
    if (this.connectionState !== 'connected') this.setMode('offline')
  }

  /** Bind the local workflow instance. Can be called after init. */
  bindWorkflow(wf: PalletMachiningWorkflow): void {
    this.workflow = wf

    // Hook into workflow events to push state to backend
    const origOnPhase = wf.onPhaseChanged
    wf.onPhaseChanged = (phase) => {
      origOnPhase?.(phase)
      this.handlePhaseForTasks(phase)
      this.reportSimulationState()
    }

    const origOnSlot = wf.onSlotComplete
    wf.onSlotComplete = (row, col) => {
      origOnSlot?.(row, col)
      this.completeCurrentSlotTask(row, col)
      this.reportSimulationState()
      this.reportMachineState()
    }

    const origOnRunState = wf.onRunStateChanged
    wf.onRunStateChanged = (s) => {
      origOnRunState?.(s)
      this.reportMachineState()
    }

    const origOnPalletComplete = wf.onPalletComplete
    wf.onPalletComplete = () => {
      origOnPalletComplete?.()
      this.reportSimulationState()
      this.reportMachineState()
    }
  }

  /** Clean up timers on component unmount. */
  dispose(): void {
    this.stopTimers()
    hub.disconnect()
  }

  // ── Orchestrated commands (called by button handlers) ────────

  /**
   * Claims an existing runnable job for this simulator and starts the
   * local workflow for the given pallet. When no server is reachable or
   * no runnable job exists, runs a local-only offline demonstration —
   * the simulator never creates an implicit job.
   */
  async start(pallet: PalletData, localStartFn: (p: PalletData) => void): Promise<void> {
    const corr = api.newCorrelationId()

    if (this.connectionState !== 'connected') {
      this.ctx.jobId = null
      this.ctx.sessionId = null
      this.ctx.correlationId = null
      this.ctx.palletId = pallet.id
      this.setMode('offline')
      console.warn('[Bridge] No server connection — running local-only demo (offline mode)')
      localStartFn(pallet)
      return
    }

    try {
      // Find an existing job an HMI operator prepared for this run.
      const jobs = await api.getJobs()
      const runnable = jobs.find(j => j.status === 'Created' || j.status === 'Ready')
      if (!runnable) {
        this.ctx.jobId = null
        this.ctx.sessionId = null
        this.ctx.correlationId = null
        this.ctx.palletId = pallet.id
        this.setMode('offline')
        console.warn('[Bridge] No runnable job on the server — running local-only demo (offline mode)')
        localStartFn(pallet)
        return
      }

      const result = await api.claimJob(runnable.id, {
        simulatorId: api.SIMULATOR_ID,
        correlationId: corr,
      })
      this.ctx.jobId = result.job.id
      this.ctx.sessionId = result.session.id
      this.ctx.palletId = pallet.id
      this.ctx.correlationId = corr
      this.slotTasks = this.buildSlotTaskMap(result.tasks, pallet.id)
      this.setMode('online')
      this.setSessionStatus(result.session.status)
      console.log(`[Bridge] Claimed job ${result.job.id} → session ${result.session.id} (corr=${corr})`)
    } catch (err) {
      console.warn('[Bridge] Claim failed, running local-only demo (offline mode)', err)
      this.ctx.jobId = null
      this.ctx.sessionId = null
      this.ctx.correlationId = null
      this.ctx.palletId = pallet.id
      this.setMode('offline')
    }

    // Always start local workflow
    localStartFn(pallet)
    this.startTimers()
  }

  async pause(localPauseFn: () => void): Promise<void> {
    if (this.ctx.jobId) {
      try { await api.pauseJob(this.ctx.jobId) } catch (e) { console.warn('[Bridge] pause', e) }
    }
    localPauseFn()
  }

  async resume(localResumeFn: () => void): Promise<void> {
    if (this.ctx.jobId) {
      try { await api.resumeJob(this.ctx.jobId) } catch (e) { console.warn('[Bridge] resume', e) }
    }
    localResumeFn()
  }

  async stop(localStopFn: () => void): Promise<void> {
    if (this.ctx.jobId) {
      try { await api.stopJob(this.ctx.jobId) } catch (e) { console.warn('[Bridge] stop', e) }
    }
    localStopFn()
    this.stopTimers()
  }

  reset(): void {
    this.stopTimers()
    this.ctx = {
      jobId: null, sessionId: null, palletId: null, taskId: null, correlationId: null,
    }
    this.lastReportedPhase = null
    this.lastStartedSlotKey = null
    this.slotTasks = []
    this.setMode('offline')
    this.setSessionStatus(null)
  }

  // ── Task ↔ pallet slot mapping ───────────────────────────────

  private buildSlotTaskMap(tasks: TaskDto[], palletId: string): SlotTaskMapping[] {
    return tasks
      .filter(t => t.palletId === null || t.palletId === '' || t.palletId === palletId)
      .map(t => ({ taskId: t.id, row: t.slotRow, col: t.slotColumn }))
  }

  private slotTaskFor(row: number, col: number): SlotTaskMapping | undefined {
    return this.slotTasks.find(t => t.row === row && t.col === col)
  }

  private handlePhaseForTasks(phase: PalletWorkflowPhase): void {
    const wf = this.workflow
    if (!wf || this.mode !== 'online' || !this.ctx.sessionId) return

    // A new slot is selected when the workflow moves above it.
    if (phase !== 'MOVE_ABOVE_PALLET_SLOT') return
    const slotKey = `${wf.currentRow}:${wf.currentCol}`
    if (slotKey === this.lastStartedSlotKey) return
    this.lastStartedSlotKey = slotKey

    const mapped = this.slotTaskFor(wf.currentRow, wf.currentCol)
    this.ctx.taskId = mapped?.taskId ?? null
    if (!mapped) return

    api.updateTaskStatus(mapped.taskId, {
      status: 'Running',
      simulationSessionId: this.ctx.sessionId,
      simulatorId: api.SIMULATOR_ID,
    }).then(() => {
      logBridge('task → running', { taskId: mapped.taskId, slot: slotKey })
    }).catch(err => {
      console.warn('[Bridge] task start report failed', err)
    })
  }

  private completeCurrentSlotTask(row: number, col: number): void {
    if (this.mode !== 'online' || !this.ctx.sessionId) return
    const mapped = this.slotTaskFor(row, col)
    if (!mapped) return

    api.updateTaskStatus(mapped.taskId, {
      status: 'Completed',
      simulationSessionId: this.ctx.sessionId,
      simulatorId: api.SIMULATOR_ID,
    }).then(() => {
      logBridge('task → completed', { taskId: mapped.taskId, slot: `${row}:${col}` })
    }).catch(err => {
      console.warn('[Bridge] task complete report failed', err)
    })
  }

  // ── State reporting ──────────────────────────────────────────

  private async reportSimulationState(): Promise<void> {
    const wf = this.workflow
    if (!wf || !this.ctx.sessionId || this.mode !== 'online') return
    if (wf.phase === this.lastReportedPhase) return
    this.lastReportedPhase = wf.phase

    const runStateToStatus: Record<WorkflowRunState, string> = {
      idle: 'Idle',
      running: 'Running',
      paused: 'Paused',
      stopped: 'Stopped',
      complete: 'Completed',
    }

    try {
      const scenario = this.scenarioSnapshot?.()
      await api.updateSimulationSessionState(this.ctx.sessionId, {
        status: runStateToStatus[wf.runState] ?? 'Running',
        currentPhase: wf.phase,
        currentPalletId: this.ctx.palletId,
        currentTaskId: this.ctx.taskId,
        machinedCount: wf.slotsCompleted,
        remainingCount: wf.remainingSlots,
        totalCount: wf.totalSlots,
        isPaused: wf.runState === 'paused',
        simulatorId: api.SIMULATOR_ID,
        correlationId: this.ctx.correlationId,
        scenarioId: scenario?.scenarioId ?? null,
        scenarioActivityId: scenario?.currentActivityId ?? null,
        scenarioProgress: scenario?.progressPercent ?? null,
      })
      logBridge('simulation state →', {
        status: runStateToStatus[wf.runState], phase: wf.phase,
        machined: wf.slotsCompleted, remaining: wf.remainingSlots, total: wf.totalSlots,
      })
    } catch (err) {
      console.warn('[Bridge] simulation state push failed', err)
    }
  }

  private async reportMachineState(): Promise<void> {
    const wf = this.workflow
    if (!wf || this.mode !== 'online' || !this.ctx.sessionId) return

    try {
      await api.updateCurrentMachineState({
        simulationSessionId: this.ctx.sessionId,
        simulatorId: api.SIMULATOR_ID,
        machineMode: 'Automatic',
        simulationStatus: wf.runState === 'running' ? 'Running'
          : wf.runState === 'paused' ? 'Paused'
          : wf.runState === 'stopped' ? 'Stopped'
          : wf.runState === 'complete' ? 'Completed'
          : 'Idle',
        robotState: wf.runState === 'running' ? 'MOVING' : 'IDLE',
        cncState: wf.phase === 'MACHINING' ? 'MACHINING' : 'IDLE',
        currentPhase: wf.phase,
        currentPalletId: this.ctx.palletId,
        currentTaskId: this.ctx.taskId,
        currentSlotRow: wf.currentRow,
        currentSlotColumn: wf.currentCol,
        isRunning: wf.runState === 'running',
        isPaused: wf.runState === 'paused',
      })
      logBridge('machine state →', {
        phase: wf.phase, robot: wf.runState === 'running' ? 'MOVING' : 'IDLE',
        cnc: wf.phase === 'MACHINING' ? 'MACHINING' : 'IDLE',
        slot: `R${wf.currentRow} C${wf.currentCol}`,
      })
    } catch (err) {
      console.warn('[Bridge] machine state push failed', err)
    }
  }

  // ── Timers ───────────────────────────────────────────────────

  private startTimers(): void {
    this.stopTimers()

    // Heartbeat every 5 s — proves ownership, revives a faulted session
    this.heartbeatTimer = setInterval(async () => {
      if (this.ctx.sessionId && this.mode === 'online') {
        try {
          await api.heartbeatSimulationSession(this.ctx.sessionId, api.SIMULATOR_ID)
        } catch { /* owner may have changed — keep local demo running */ }
      }
    }, 5_000)

    // Periodic machine-state report every 2 s
    this.reportTimer = setInterval(() => {
      this.reportMachineState()
    }, 2_000)
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    if (this.reportTimer) { clearInterval(this.reportTimer); this.reportTimer = null }
  }

  private setMode(mode: BridgeMode): void {
    if (this.mode === mode) return
    this.mode = mode
    this.onModeChanged?.(mode)
  }

  private setSessionStatus(status: string | null): void {
    if (this.sessionStatus === status) return
    this.sessionStatus = status
    this.onSessionStatusChanged?.(status)
  }

  // ── SignalR event handlers ───────────────────────────────────

  private handleJobStateChanged(evt: hub.JobStateChangedEvent): void {
    if (evt.jobId !== this.ctx.jobId) return

    const wf = this.workflow
    if (!wf) return

    // Align local workflow if the server drives a state change externally
    if (evt.newStatus === 'Paused' && wf.runState === 'running') {
      this.onExternalPause?.()
    } else if (evt.newStatus === 'Running' && wf.runState === 'paused') {
      this.onExternalResume?.()
    } else if (evt.newStatus === 'Stopped' && wf.runState !== 'stopped' && wf.runState !== 'idle') {
      this.onExternalStop?.()
    }
  }

  private handleSimulationStateChanged(evt: hub.SimulationStateChangedEvent): void {
    // Keep context aligned and surface server status (incl. Faulted)
    if (evt.jobId === this.ctx.jobId) {
      this.ctx.sessionId = evt.sessionId
    }
    if (evt.sessionId === this.ctx.sessionId) {
      this.setSessionStatus(evt.status)
    }
  }
}
