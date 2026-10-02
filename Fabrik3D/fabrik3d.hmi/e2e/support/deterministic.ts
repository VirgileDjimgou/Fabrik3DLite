import { test as base, expect, type Locator, type Page } from '@playwright/test'

/**
 * Deterministic HMI visual-test fixture (S62).
 *
 * The HMI is data-driven: machine state, jobs, robot telemetry and training records normally come
 * from a live orchestrator backed by a shared MongoDB. A snapshot that reads that shared state can
 * change between runs and between machines. This fixture replaces the live backend with an explicit,
 * in-test seed and follows the same reset → seed → scenario → ready → freeze → screenshot protocol
 * as the simulator visual tests.
 *
 * It never contacts the real server and never writes anywhere; the SignalR hub is deliberately left
 * disconnected so no asynchronous live event can mutate the captured view.
 */

export type HmiRole = 'Learner' | 'Instructor' | 'Engineer' | 'Operator' | 'Administrator'

export interface HmiDataset {
  identity: Record<string, unknown>
  machineState: Record<string, unknown>
  jobs: Array<Record<string, unknown>>
  session: Record<string, unknown>
  authority: Record<string, unknown>
  composerOptions: Record<string, unknown>
  robotPositions: Record<string, unknown>
  training: {
    classes: unknown[]
    resources: unknown[]
    sessions: unknown[]
    metrics: Record<string, unknown>
    session: Record<string, unknown>
    actions: unknown[]
  }
}

/** Deterministic unsigned JWT: the HMI only decodes it for display/expiry, the server never sees it. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  // Far-future expiry so the token is valid regardless of the machine clock.
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ ...payload, exp: 4102444800 })}.signature`
}

function identityFor(role: HmiRole, subject: string): Record<string, unknown> {
  return {
    subject,
    name: subject,
    roles: [role],
    mode: 'Test',
    organizationId: 'default',
    organizationName: 'Default organization',
  }
}

const BASE_DATASET: HmiDataset = {
  identity: identityFor('Operator', 'e2e-operator'),
  machineState: {
    id: 'machine-state-1',
    simulationSessionId: 'session-1',
    machineMode: 'Automatic',
    simulationStatus: 'Running',
    robotState: 'MOVING',
    cncState: 'RUNNING',
    currentPhase: 'MACHINING',
    currentPalletId: 'pallet-1',
    currentTaskId: 'task-1',
    currentPartId: 'part-1',
    currentSlotRow: 1,
    currentSlotColumn: 2,
    isRunning: true,
    isPaused: false,
    lastUpdatedAtUtc: '2026-10-02T09:00:05Z',
  },
  jobs: [
    {
      id: 'job-1',
      name: 'Reference pallet run',
      description: 'Deterministic visual fixture',
      status: 'Running',
      machineMode: 'Automatic',
      progressPercent: 40,
      simulationSessionId: 'session-1',
      currentTaskIndex: 4,
      taskCount: 10,
      completedTaskCount: 4,
      targetCellId: 'reference-cell',
      scenarioId: 'pallet-processing',
      priority: 5,
      createdAtUtc: '2026-10-02T08:00:00Z',
      updatedAtUtc: '2026-10-02T09:00:00Z',
      version: 3,
    },
  ],
  session: {
    id: 'session-1',
    jobId: 'job-1',
    status: 'Running',
    startedAtUtc: '2026-10-02T08:55:00Z',
    endedAtUtc: '2026-10-02T09:00:00Z',
    isPaused: false,
    currentPhase: 'MACHINING',
    currentPalletId: 'pallet-1',
    machinedCount: 4,
    remainingCount: 6,
    totalCount: 10,
    scenarioId: 'pallet-processing',
    scenarioProgress: 40,
    targetCellId: 'reference-cell',
    simulatorId: 'sim-1',
    version: 2,
  },
  authority: {
    scope: 'reference-cell',
    mode: 'local-simulation',
    state: 'held',
    ownerId: 'local-simulator',
    ownerKind: 'simulator',
    acquiredAtUtc: '2026-10-02T08:55:00Z',
    leaseExpiresAtUtc: null,
    lastHeartbeatUtc: '2026-10-02T09:00:00Z',
    version: 1,
    degradedReason: null,
    correlationId: null,
    isPersisted: true,
    diagnostic: null,
  },
  composerOptions: {
    cells: [
      {
        id: 'reference-cell',
        name: 'Reference CNC cell',
        available: true,
        simulatorCount: 1,
        compatibleScenarioIds: ['pallet-processing'],
        defaultScenarioId: 'pallet-processing',
      },
    ],
    scenarios: [{ id: 'pallet-processing', name: 'Pallet processing', level: 'intermediate' }],
    cellTemplates: [{ id: 'template-1', name: 'Reference layout', schemaVersion: '1.0' }],
    maxRows: 4,
    maxColumns: 4,
    maxTasks: 16,
  },
  robotPositions: {
    cellId: 'reference-cell',
    robotId: 'robot-1',
    robotModel: 'medium-6axis',
    joints: [0, 1, 2, 3, 4, 5].map((index) => ({
      index,
      name: `J${index + 1}`,
      angleRadians: index / 10,
      minRadians: -Math.PI,
      maxRadians: Math.PI,
    })),
    tcp: { x: 0.4, y: 0.1, z: 0.5, rx: 0.01, ry: 0.02, rz: 0.03 },
    frames: { baseFrame: 'world', toolFrame: 'flange', workObjectFrame: 'workobject-1', currentToolId: 'tool-1' },
    motionStatus: 'IDLE',
    operatingMode: 'manual-training',
    controlAuthorityMode: 'external-controller',
    controlAuthorityState: 'held',
    controlAuthorityOwnerId: 'operator-1',
    isStale: false,
    publishedAtUtc: '2026-10-02T09:00:00Z',
    units: 'radians, meters',
    schemaVersion: 1,
  },
  training: {
    classes: [
      {
        id: 'class-1',
        organizationId: 'default',
        name: 'Cohort A',
        description: 'Morning cohort',
        instructorSubjects: ['instructor-1'],
        learnerSubjects: ['learner-1', 'learner-2'],
        scheduleMetadata: {},
        createdAtUtc: '2026-09-01T08:00:00Z',
        updatedAtUtc: '2026-09-01T08:00:00Z',
        version: 0,
      },
    ],
    resources: [
      {
        id: 'assignment-1',
        organizationId: 'default',
        classId: 'class-1',
        kind: 'Scenario',
        resourceId: 'pick-and-place',
        createdAtUtc: '2026-09-01T08:00:00Z',
      },
    ],
    sessions: [
      {
        id: 'session-1',
        organizationId: 'default',
        classId: 'class-1',
        learnerSubject: 'learner-1',
        alias: 'learner-one',
        scenarioId: 'pick-and-place',
        scenarioVersion: '1.0',
        simulationSessionId: null,
        simulatorId: 'sim-1',
        startedAtUtc: '2026-09-20T10:00:00Z',
        endedAtUtc: '2026-09-20T10:05:00Z',
        status: 'completed',
        completed: true,
        completionPercent: 100,
        expectedActions: ['PICK_PART', 'COMPLETE'],
        actionCount: 4,
        faultCount: 1,
        hintCount: 1,
        safetyViolationCount: 1,
        recoveryActionCount: 1,
        score: 90,
        possibleScore: 100,
        assessmentSchemaVersion: '1.0',
        scoringRuleVersion: '1.0',
        softwareVersion: '1.0.0',
        assessmentStatus: 'Computed',
        assessmentDiagnostic: null,
        version: 2,
      },
    ],
    metrics: {
      assessmentSchemaVersion: '1.0',
      definitionsVersion: '1.0',
      scoringRuleVersion: '1.0',
      generatedAtUtc: '2026-09-26T12:00:00Z',
      classId: 'class-1',
      scenarioId: 'pick-and-place',
      fromUtc: null,
      toUtc: null,
      sessionCount: 4,
      completedCount: 3,
      failedCount: 1,
      runningCount: 0,
      terminalCount: 4,
      completionRate: 0.75,
      meanSessionSeconds: 340,
      meanDiagnosisSeconds: 120,
      totalActions: 20,
      incorrectActionCount: 2,
      hintCount: 3,
      sessionsWithHints: 2,
      meanHintsPerSession: 0.75,
      faultCount: 2,
      recoveryActionCount: 2,
      safetyViolationCount: 1,
      sessionsWithSafetyViolations: 1,
      commonIncorrectActions: [{ key: 'WRONG_GRIP', count: 2 }],
      repeatedFaultTypes: [{ key: 'fault', count: 2 }],
      safetyMistakeRules: [{ key: 'guard-door-open', count: 1 }],
      truncated: false,
      educationalNote: 'Teaching aid from simulated evidence; not certification.',
    },
    session: {
      id: 'session-1',
      organizationId: 'default',
      classId: 'class-1',
      learnerSubject: 'learner-1',
      alias: 'learner-one',
      scenarioId: 'pick-and-place',
      scenarioVersion: '1.0',
      simulationSessionId: null,
      simulatorId: 'sim-1',
      startedAtUtc: '2026-09-20T10:00:00Z',
      endedAtUtc: '2026-09-20T10:05:00Z',
      status: 'completed',
      completed: true,
      completionPercent: 100,
      expectedActions: ['PICK_PART', 'COMPLETE'],
      actionCount: 4,
      faultCount: 1,
      hintCount: 1,
      safetyViolationCount: 1,
      recoveryActionCount: 1,
      score: 90,
      possibleScore: 100,
      assessmentSchemaVersion: '1.0',
      scoringRuleVersion: '1.0',
      softwareVersion: '1.0.0',
      assessmentStatus: 'Computed',
      assessmentDiagnostic: null,
      assessment: {
        scoringRuleVersion: '1.0',
        assessmentSchemaVersion: '1.0',
        softwareVersion: '1.0.0',
        computedScore: 90,
        computedPossibleScore: 100,
        effectiveScore: 90,
        effectivePossibleScore: 100,
        complete: true,
        status: 'Computed',
        diagnostic: null,
        disclaimer: 'Educational training record; does not certify professional competence.',
        educationalScope: 'educational',
        criteria: [
          { id: 'completion', label: 'Completion', explanation: 'Scenario completed.', points: 40, earned: 40, passed: true, evidence: ['a1'] },
          { id: 'safety-compliance', label: 'Safety compliance', explanation: 'A safety rule was violated.', points: 20, earned: 0, passed: false, evidence: ['v1'] },
        ],
        assessmentVersion: 1,
        corrections: [],
        computedAtUtc: '2026-09-20T10:05:00Z',
      },
      audit: [{ action: 'completed', subject: 'learner-1', detail: null, atUtc: '2026-09-20T10:05:00Z' }],
      version: 2,
    },
    actions: [
      {
        id: 'x1', actionId: 'a1', correlationId: null, role: 'observed', type: 'PICK_PART', target: null,
        expectedActionId: null, correctness: 'correct', severity: 'info', timestampUtc: '2026-09-20T10:00:10Z',
        sequence: 1, isFault: false, isHint: false, isRecovery: false, isSafetyViolation: false, hint: null,
        safetyViolation: null, recovery: null, schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:00:10Z',
      },
      {
        id: 'x2', actionId: 'f1', correlationId: null, role: 'observed', type: 'fault', target: null,
        expectedActionId: null, correctness: 'unknown', severity: 'warning', timestampUtc: '2026-09-20T10:01:10Z',
        sequence: 2, isFault: true, isHint: false, isRecovery: false, isSafetyViolation: false, hint: null,
        safetyViolation: null, recovery: null, schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:01:10Z',
      },
      {
        id: 'x3', actionId: 'r1', correlationId: null, role: 'observed', type: 'recovery', target: null,
        expectedActionId: null, correctness: 'unknown', severity: 'info', timestampUtc: '2026-09-20T10:02:10Z',
        sequence: 3, isFault: false, isHint: false, isRecovery: true, isSafetyViolation: false, hint: null,
        safetyViolation: null, recovery: { faultId: 'f1', recoveredActionId: null, successful: true, target: null },
        schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:02:10Z',
      },
      {
        id: 'x4', actionId: 'v1', correlationId: null, role: 'observed', type: 'safety.violation', target: null,
        expectedActionId: null, correctness: 'unknown', severity: 'critical', timestampUtc: '2026-09-20T10:03:10Z',
        sequence: 4, isFault: false, isHint: false, isRecovery: false, isSafetyViolation: true, hint: null,
        safetyViolation: { ruleId: 'guard-door-open', description: 'Simulated guard.', severity: 'critical' },
        recovery: null, schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:03:10Z',
      },
    ],
  },
}

export function defaultHmiDataset(): HmiDataset {
  // Deep clone so a test can mutate its copy without leaking into another test.
  return JSON.parse(JSON.stringify(BASE_DATASET)) as HmiDataset
}

export interface HmiSteps {
  reset(): Promise<void>
  /** Install the deterministic seed before navigating. `role` shapes the seeded identity. */
  seed(role?: HmiRole, dataset?: HmiDataset): Promise<void>
  goto(path: string, readySelector?: string): Promise<void>
  ready(selector: string, options?: { timeout?: number }): Promise<void>
  freeze(): Promise<void>
  screenshot(name: string, options?: { fullPage?: boolean; mask?: Locator[] }): Promise<void>
}

export const test = base.extend<{ hmi: HmiSteps }>({
  hmi: async ({ page }, use) => {
    const hmi: HmiSteps = {
      async reset() {
        await page.goto('about:blank')
        await page.evaluate(() => {
          try {
            window.localStorage.clear()
            window.sessionStorage.clear()
          } catch {
            // Opaque origin: the seed below is re-applied on the next navigation anyway.
          }
        })
      },

      async seed(role = 'Operator', dataset = defaultHmiDataset()) {
        const identity = role === 'Operator' ? dataset.identity : identityFor(role, `e2e-${role.toLowerCase()}`)
        const token = fakeJwt({ sub: identity.subject, name: identity.name, role })

        await page.addInitScript(
          ([accessToken, identityJson]) => {
            sessionStorage.setItem('fabrik3d.auth.token', accessToken)
            sessionStorage.setItem('fabrik3d.auth.identity', identityJson)
          },
          [token, JSON.stringify(identity)] as const,
        )

        // The SignalR hub is intentionally unreachable: the connection badge is deterministically
        // "Disconnected" and no live event can mutate the view between ready and capture.
        await page.route('**/hubs/**', (route) => route.abort())

        await page.route('**/api/**', async (route) => {
          const path = new URL(route.request().url()).pathname
          const json = (body: unknown, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

          if (path.endsWith('/api/auth/me')) return json(identity)
          if (path.endsWith('/api/auth/config')) {
            return json({
              mode: 'Test',
              developmentAuth: true,
              publicDemoEnabled: false,
              roles: [role],
              warning: 'TEST AUTHENTICATION — NOT PRODUCTION SECURITY',
            })
          }
          if (path.endsWith('/api/version')) {
            return json({ version: '1.0.0', profile: 'Test', environment: 'Test', buildId: 'e2e', informationalVersion: '1.0.0-e2e' })
          }
          if (path.endsWith('/api/machine-state/current')) return json(dataset.machineState)
          if (path.endsWith('/api/jobs')) return json(dataset.jobs)
          if (/\/api\/simulation-sessions\/[^/]+$/.test(path)) return json(dataset.session)
          if (/\/api\/control-authority\/[^/]+$/.test(path)) return json(dataset.authority)
          if (path.endsWith('/api/jobs/composer/options')) return json(dataset.composerOptions)
          if (/\/api\/robots\/[^/]+\/[^/]+\/positions$/.test(path)) return json(dataset.robotPositions)
          if (path.endsWith('/api/organizations/classes')) return json(dataset.training.classes)
          if (path.endsWith('/api/organizations/resources')) return json(dataset.training.resources)
          if (path.endsWith('/api/training/metrics')) return json(dataset.training.metrics)
          if (path.endsWith('/api/training/sessions/session-1/actions')) return json(dataset.training.actions)
          if (path.endsWith('/api/training/sessions/session-1')) return json(dataset.training.session)
          if (path.endsWith('/api/training/sessions')) return json(dataset.training.sessions)
          if (path.includes('/api/alarms') || path.includes('/api/messages')) return json([])
          return json({})
        })
      },

      async goto(path, readySelector) {
        await page.goto(path)
        if (readySelector) await hmi.ready(readySelector)
      },

      async ready(selector, options) {
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: options?.timeout ?? 30_000 })
      },

      async freeze() {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.evaluate(async () => {
          if (typeof document.fonts?.ready?.then === 'function') await document.fonts.ready
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        })
      },

      async screenshot(name, options) {
        await expect(page).toHaveScreenshot(name, {
          fullPage: options?.fullPage ?? true,
          animations: 'disabled',
          ...(options?.mask ? { mask: options.mask } : {}),
        })
      },
    }

    await use(hmi)
  },
})

export { expect }
export type { Page }
