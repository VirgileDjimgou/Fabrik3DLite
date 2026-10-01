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
import type { JogCommandIssuedEvent, PublishRobotPositionsRequest, TaskDto } from '@fabrik3d/contracts'
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
  /** Cell the server assigned this simulator to (S51). */
  targetCellId: string | null
}

/** Orchestration mode: online = driven by a claimed server job. */
export type BridgeMode = 'online' | 'offline'

/** Dispatch lifecycle as observed by the simulator (S51). */
export type DispatchPhase = 'idle' | 'pending' | 'acknowledged' | 'running' | 'failed' | 'timedout'

interface SlotTaskMapping {
  taskId: string
  row: number
  col: number
}

// ── Bridge class ───────────────────────────────────────────────────

export class SimulatorOrchestrationBridge {
  ctx: OrchestrationContext = {
    jobId: null, sessionId: null, palletId: null, taskId: null, correlationId: null, targetCellId: null,
  }

  /** Online when a server job/session was claimed; offline = local demo only. */
  mode: BridgeMode = 'offline'

  /** Live hub connection state for the dashboard. */
  connectionState: hub.ConnectionState = 'disconnected'

  /** Last known session status from the server (e.g. Faulted). */
  sessionStatus: string | null = null

  /** Cell this simulator advertises to the server for targeted dispatch (S51). */
  cellId: string = (import.meta.env.VITE_SIMULATOR_CELL_ID as string | undefined) ?? 'reference-cell'

  /** Current dispatch phase observed from the server (S51). */
  dispatchPhase: DispatchPhase = 'idle'

  /** Callbacks the scene component can set to react to external state changes. */
  onExternalPause: (() => void) | null = null
  onExternalResume: (() => void) | null = null
  onExternalStop: (() => void) | null = null
  /**
   * Server-authoritative start (S51): the assigned simulator adopts the session and starts the
   * local workflow automatically, without a local Start action.
   */
  onExternalStart: ((pallet: PalletData, jobId: string, sessionId: string) => void) | null = null
  onModeChanged: ((mode: BridgeMode) => void) | null = null
  onConnectionStateChanged: ((state: hub.ConnectionState) => void) | null = null
  onSessionStatusChanged: ((status: string | null) => void) | null = null
  onDispatchPhaseChanged: ((phase: DispatchPhase) => void) | null = null

  /** Optional scenario progress provider so scenario state is observable through the orchestrator. */
  scenarioSnapshot: (() => ScenarioProgress | null) | null = null

  // ── Authoritative robot state and operator jog (S53) ──────────────

  /** Last control authority observed for this cell. Remote jog requires a held authority. */
  authorityMode = 'local-simulation'
  authorityState = 'available'
  authorityOwnerId: string | null = null

  /** Provider of the robot state this simulator actually executed (published at 2 Hz). */
  robotPositionsProvider: (() => Omit<PublishRobotPositionsRequest, 'simulatorId'> | null) | null = null

  /** Applies an authorized jog intent to the existing dead-man/limit/collision path. */
  onJogCommand: ((evt: JogCommandIssuedEvent) => void) | null = null

  /** Stops any active jog when authority, mode or connection changes. */
  onJogStop: ((reason: string) => void) | null = null

  /**
   * Optional provider for the pallet currently stopped at the work station. Used to adopt a
   * dispatched job onto the real scene pallet (S51).
   */
  palletResolver: (() => PalletData | null) | null = null

  private workflow: PalletMachiningWorkflow | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reportTimer: ReturnType<typeof setInterval> | null = null
  private robotTimer: ReturnType<typeof setInterval> | null = null
  private lastReportedPhase: PalletWorkflowPhase | null = null
  private lastStartedSlotKey: string | null = null
  private slotTasks: SlotTaskMapping[] = []

  // ── Lifecycle ────────────────────────────────────────────────

  /** Call once when the scene initialises. */
  async init(): Promise<void> {
    hub.on({
      onJobStateChanged: (evt) => this.handleJobStateChanged(evt),
      onSimulationStateChanged: (evt) => this.handleSimulationStateChanged(evt),
      onExecutionDispatchRequested: (evt) => this.handleExecutionDispatchRequested(evt),
      onDispatchStateChanged: (evt) => this.handleDispatchStateChanged(evt),
      onAlarmRaised: (evt) => console.log('[Bridge] Alarm:', evt.title, evt.message),
      onOperatorMessage: (evt) => console.log('[Bridge] Message:', evt.title, evt.message),
      onControlAuthorityChanged: (evt) => this.handleControlAuthorityChanged(evt),
      onJogCommandIssued: (evt) => this.handleJogCommandIssued(evt),
      onConnectionStateChanged: (state) => {
        this.connectionState = state
        if (state !== 'connected') {
          this.stopRobotTimer()
          this.onJogStop?.('disconnect')
        } else {
          this.startRobotTimer()
        }
        this.onConnectionStateChanged?.(state)
      },
    })
    try {
      await hub.connect()
      // hub.connect() resolves even when the hub is unreachable (it reports disconnected through
      // the callback); trust the real transport state so offline never publishes robot state.
      this.connectionState = hub.isConnected() ? 'connected' : 'disconnected'
      if (this.connectionState === 'connected') {
        // Advertise this simulator's cell capability so targeted dispatch can reach it.
        await hub.registerSimulator(api.SIMULATOR_ID, this.cellId)
        await this.refreshAuthority()
        this.startRobotTimer()
        console.log(`[Bridge] Orchestration connected (cell=${this.cellId})`)
      }
    } catch {
      this.connectionState = 'disconnected'
    }
    if (this.connectionState !== 'connected') this.setMode('offline')
  }

  /** True when the observed authority lets a remote operator command this cell. */
  authorityAllowsCommanding(): boolean {
    if (this.authorityState === 'degraded') return false
    if (this.authorityMode === 'replay' || this.authorityMode === 'observed-twin') return false
    return this.authorityState === 'held'
  }

  private async refreshAuthority(): Promise<void> {
    try {
      const authority = await api.getControlAuthority(this.cellId)
      this.authorityMode = authority.mode
      this.authorityState = authority.state
      this.authorityOwnerId = authority.ownerId ?? null
    } catch {
      // Offline: keep the last known authority and fail closed for jog.
      this.authorityState = 'available'
    }
  }

  private handleControlAuthorityChanged(evt: hub.ControlAuthorityChangedEvent): void {
    if (evt.scope !== this.cellId) return
    this.authorityMode = evt.mode
    this.authorityState = evt.state
    this.authorityOwnerId = evt.ownerId ?? null
    if (!this.authorityAllowsCommanding()) this.onJogStop?.('authority-loss')
  }

  private handleJogCommandIssued(evt: hub.JogCommandIssuedEvent): void {
    // Targeting is re-validated on the simulator side: cell, simulator and robot must match.
    if (evt.cellId !== this.cellId) return
    if (evt.simulatorId !== api.SIMULATOR_ID) return
    this.onJogCommand?.(evt)
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
    this.stopRobotTimer()
    this.onJogStop?.('disconnect')
    hub.disconnect()
  }

  // ── Orchestrated commands (called by button handlers) ────────

  /**
   * Local Start action. In orchestrated mode (connected to the server) the simulator must NOT
   * invent or select a production job: the server-authoritative dispatch drives execution through
   * {@link onExternalStart}. The local Start button therefore only runs the clearly-labelled
   * offline demonstration when no server is reachable. This is the S51 ownership boundary.
   */
  async start(pallet: PalletData, localStartFn: (p: PalletData) => void): Promise<void> {
    if (this.connectionState === 'connected') {
      // Orchestrated: refuse a local production start. The operator starts from the HMI.
      console.warn('[Bridge] Orchestrated mode — local Start is disabled; start the job from the HMI.')
      this.setMode('online')
      return
    }

    this.ctx.jobId = null
    this.ctx.sessionId = null
    this.ctx.correlationId = null
    this.ctx.targetCellId = null
    this.ctx.palletId = pallet.id
    this.setMode('offline')
    console.warn('[Bridge] No server connection — running local-only demo (offline mode)')
    localStartFn(pallet)
  }

  /**
   * Adopts a server-authoritative dispatch (S51): validates the target cell and session, maps the
   * assigned tasks, starts the local workflow automatically and acknowledges with the same
   * correlation id. Idempotent: a duplicate request for the same session is ignored.
   */
  private async handleExecutionDispatchRequested(evt: hub.ExecutionDispatchRequestedEvent): Promise<void> {
    // Validate the target: this simulator must be the assigned one and the cell must match.
    if (evt.assignedSimulatorId !== api.SIMULATOR_ID) return
    if (evt.targetCellId !== this.cellId) {
      console.warn(`[Bridge] Dispatch target cell ${evt.targetCellId} does not match ${this.cellId}; ignoring`)
      return
    }

    // Idempotent: already executing this session.
    if (this.ctx.sessionId === evt.sessionId && this.mode === 'online') {
      console.log(`[Bridge] Duplicate dispatch for session ${evt.sessionId}; re-acknowledging`)
      await this.acknowledge(evt, 'Running')
      return
    }

    this.ctx.jobId = evt.jobId
    this.ctx.sessionId = evt.sessionId
    this.ctx.correlationId = evt.correlationId
    this.ctx.targetCellId = evt.targetCellId
    this.setMode('online')
    this.setDispatchPhase('pending')

    // Adopt the server session and map the assigned tasks to pallet slots.
    try {
      const session = await api.getSessionById(evt.sessionId)
      this.setSessionStatus(session.status)
      const tasks = await api.getJobTasks(evt.jobId)
      const pallet = this.resolveAssignedPallet(tasks)
      this.ctx.palletId = pallet?.id ?? null
      this.slotTasks = this.buildSlotTaskMap(tasks, pallet?.id ?? '')
    } catch (err) {
      console.warn('[Bridge] Failed to adopt dispatch session', err)
    }

    await this.acknowledge(evt, 'Acknowledged')

    // Start the local workflow automatically — no local Start action.
    const pallet = this.resolveAssignedPalletFromContext()
    if (pallet && this.onExternalStart) {
      this.onExternalStart(pallet, evt.jobId, evt.sessionId)
      this.startTimers()
      await this.acknowledge(evt, 'Running')
    } else {
      console.warn('[Bridge] No assigned pallet available to start the dispatched workflow')
    }
  }

  private async acknowledge(evt: hub.ExecutionDispatchRequestedEvent, state: 'Acknowledged' | 'Running'): Promise<void> {
    try {
      await api.acknowledgeDispatch(evt.jobId, {
        simulatorId: api.SIMULATOR_ID,
        correlationId: evt.correlationId,
        targetCellId: evt.targetCellId,
        simulationSessionId: evt.sessionId,
        state,
      })
      this.setDispatchPhase(state === 'Running' ? 'running' : 'acknowledged')
      console.log(`[Bridge] Dispatch ${state} → job ${evt.jobId} (corr=${evt.correlationId})`)
    } catch (err) {
      console.warn(`[Bridge] Dispatch ${state} acknowledgement failed`, err)
      this.setDispatchPhase('failed')
    }
  }

  private handleDispatchStateChanged(evt: hub.DispatchStateChangedEvent): void {
    if (evt.jobId !== this.ctx.jobId) return
    const phase = evt.dispatchState.toLowerCase() as DispatchPhase
    if (phase === 'timedout') this.setDispatchPhase('timedout')
    else if (phase === 'failed') this.setDispatchPhase('failed')
    else if (phase === 'running') this.setDispatchPhase('running')
    else if (phase === 'acknowledged') this.setDispatchPhase('acknowledged')
    else if (phase === 'pending') this.setDispatchPhase('pending')
  }

  private resolveAssignedPallet(tasks: TaskDto[]): PalletData | null {
    const palletId = tasks.find(t => t.palletId)?.palletId ?? null
    return this.resolvePalletById(palletId)
  }

  private resolveAssignedPalletFromContext(): PalletData | null {
    return this.resolvePalletById(this.ctx.palletId)
  }

  /** Resolves a pallet from the bound workflow's station, falling back to a synthetic pallet. */
  private resolvePalletById(palletId: string | null): PalletData | null {
    const fromStation = this.palletResolver?.() ?? null
    if (fromStation) return fromStation
    if (!palletId) return null
    // Synthetic fallback so a dispatched job still starts deterministically when the scene has not
    // yet spawned a pallet; the workflow maps tasks by pallet id and slot.
    return {
      id: palletId,
      rows: 5,
      cols: 5,
      cavityShape: 'hex',
      materialType: 'hex-billet',
      occupied: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true)),
      slotStatus: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'raw' as const)),
      worldX: 0,
      state: 'stopped',
    }
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
      jobId: null, sessionId: null, palletId: null, taskId: null, correlationId: null, targetCellId: null,
    }
    this.lastReportedPhase = null
    this.lastStartedSlotKey = null
    this.slotTasks = []
    this.setMode('offline')
    this.setSessionStatus(null)
    this.setDispatchPhase('idle')
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

  // ── Robot state publication (S53) ────────────────────────────────
  //
  // 2 Hz cadence: fast enough that the HMI reproduces a jog without visible lag (stale after 3 s),
  // slow enough that a 6-axis report never floods SignalR or REST. Only the assigned cell publishes.

  private startRobotTimer(): void {
    this.stopRobotTimer()
    this.robotTimer = setInterval(() => { void this.reportRobotPositions() }, 500)
  }

  private stopRobotTimer(): void {
    if (this.robotTimer) { clearInterval(this.robotTimer); this.robotTimer = null }
  }

  private async reportRobotPositions(): Promise<void> {
    const provider = this.robotPositionsProvider
    if (!provider || this.connectionState !== 'connected') return
    let report: Omit<PublishRobotPositionsRequest, 'simulatorId'> | null = null
    try { report = provider() } catch { return }
    if (!report) return
    try {
      await api.publishRobotPositions(this.cellId, report.robotId, { ...report, simulatorId: api.SIMULATOR_ID })
    } catch {
      // Offline or rejected: the HMI will show the last report as stale rather than a fabricated pose.
    }
  }

  private setMode(mode: BridgeMode): void {
    if (this.mode === mode) return
    this.mode = mode
    // Entering automatic execution must stop any manual jog immediately.
    if (mode === 'online') this.onJogStop?.('mode-change')
    this.onModeChanged?.(mode)
  }

  private setSessionStatus(status: string | null): void {
    if (this.sessionStatus === status) return
    this.sessionStatus = status
    this.onSessionStatusChanged?.(status)
  }

  private setDispatchPhase(phase: DispatchPhase): void {
    if (this.dispatchPhase === phase) return
    this.dispatchPhase = phase
    this.onDispatchPhaseChanged?.(phase)
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
