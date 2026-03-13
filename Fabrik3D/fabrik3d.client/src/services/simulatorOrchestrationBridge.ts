/**
 * Orchestration bridge — the only module that knows both the local
 * simulator workflow and the backend REST / SignalR contracts.
 *
 * Responsibilities:
 *   • Route start / pause / resume / stop through the backend first
 *   • Push machine-state and simulation-session updates periodically
 *   • Listen to backend SignalR events and align local workflow
 *   • Send heartbeats while a session is active
 */

import type { PalletMachiningWorkflow, PalletWorkflowPhase, WorkflowRunState } from '../simulation/PalletMachiningWorkflow'
import type { PalletData } from '../simulation/PalletModels'
import * as api from './orchestratorApi'
import * as hub from './orchestratorSignalR'
import { logBridge } from './devLogger'

// ── Active orchestration context ───────────────────────────────────

export interface OrchestrationContext {
  jobId: string | null
  sessionId: string | null
  palletId: string | null
  taskId: string | null
}

// ── Bridge class ───────────────────────────────────────────────────

export class SimulatorOrchestrationBridge {
  ctx: OrchestrationContext = { jobId: null, sessionId: null, palletId: null, taskId: null }

  private workflow: PalletMachiningWorkflow | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reportTimer: ReturnType<typeof setInterval> | null = null
  private connected = false
  private lastReportedPhase: PalletWorkflowPhase | null = null

  /** Callback the scene component can set to react to external state changes. */
  onExternalPause: (() => void) | null = null
  onExternalResume: (() => void) | null = null
  onExternalStop: (() => void) | null = null

  // ── Lifecycle ────────────────────────────────────────────────

  /** Call once when the scene initialises. */
  async init(): Promise<void> {
    hub.on({
      onJobStateChanged: (evt) => this.handleJobStateChanged(evt),
      onSimulationStateChanged: (evt) => this.handleSimulationStateChanged(evt),
      onAlarmRaised: (evt) => console.log('[Bridge] Alarm:', evt.title, evt.message),
      onOperatorMessage: (evt) => console.log('[Bridge] Message:', evt.title, evt.message),
    })
    try {
      await hub.connect()
      this.connected = true
      console.log('[Bridge] Orchestration connected')
    } catch {
      console.warn('[Bridge] Running in offline mode')
    }
  }

  /** Bind the local workflow instance. Can be called after init. */
  bindWorkflow(wf: PalletMachiningWorkflow): void {
    this.workflow = wf

    // Hook into workflow events to push state to backend
    const origOnPhase = wf.onPhaseChanged
    wf.onPhaseChanged = (phase) => {
      origOnPhase?.(phase)
      this.reportSimulationState()
    }

    const origOnSlot = wf.onSlotComplete
    wf.onSlotComplete = (row, col) => {
      origOnSlot?.(row, col)
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

  async start(pallet: PalletData, localStartFn: (p: PalletData) => void): Promise<void> {
    try {
      // Create a job automatically for this pallet run
      const job = await api.createJob({
        name: `Pallet ${pallet.id}`,
        description: `Machining run for ${pallet.materialType} pallet`,
        machineMode: 'Automatic',
      })
      this.ctx.jobId = job.id
      this.ctx.palletId = pallet.id

      // Start the job on the server — creates a session
      const started = await api.startJob(job.id)
      this.ctx.sessionId = started.simulationSessionId ?? null

      console.log(`[Bridge] Job ${job.id} started, session ${this.ctx.sessionId}`)
    } catch (err) {
      console.warn('[Bridge] Server start failed, running locally', err)
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
    this.ctx = { jobId: null, sessionId: null, palletId: null, taskId: null }
    this.lastReportedPhase = null
  }

  // ── State reporting ──────────────────────────────────────────

  private async reportSimulationState(): Promise<void> {
    const wf = this.workflow
    if (!wf || !this.ctx.sessionId) return
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
      await api.updateSimulationSessionState(this.ctx.sessionId, {
        status: runStateToStatus[wf.runState] ?? 'Running',
        currentPhase: wf.phase,
        currentPalletId: this.ctx.palletId,
        machinedCount: wf.slotsCompleted,
        remainingCount: wf.remainingSlots,
        totalCount: wf.totalSlots,
        isPaused: wf.runState === 'paused',
      })
      logBridge('simulation state →', {
        status: runStateToStatus[wf.runState], phase: wf.phase,
        machined: wf.slotsCompleted, remaining: wf.remainingSlots, total: wf.totalSlots,
      })
    } catch { /* offline — silent */ }
  }

  private async reportMachineState(): Promise<void> {
    const wf = this.workflow
    if (!wf) return

    try {
      await api.updateCurrentMachineState({
        simulationSessionId: this.ctx.sessionId,
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
    } catch { /* offline — silent */ }
  }

  // ── Timers ───────────────────────────────────────────────────

  private startTimers(): void {
    this.stopTimers()

    // Heartbeat every 5 s
    this.heartbeatTimer = setInterval(async () => {
      if (this.ctx.sessionId) {
        try { await api.heartbeatSimulationSession(this.ctx.sessionId) } catch { /* ok */ }
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
    // Keep context aligned
    if (evt.jobId === this.ctx.jobId) {
      this.ctx.sessionId = evt.sessionId
    }
  }
}
