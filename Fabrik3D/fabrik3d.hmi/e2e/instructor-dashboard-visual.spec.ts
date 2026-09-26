import { expect, test } from '@playwright/test'

/**
 * Visual regression for the instructor dashboard (S45) at desktop and laptop widths. The dashboard
 * API and identity are mocked so the layout is deterministic and independent of shared backend data.
 */

/** Deterministic unsigned JWT: the HMI only decodes it for display/expiry, the server never sees it. */
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

const SESSION = {
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
}

const ACTIONS = [
  { id: 'x1', actionId: 'a1', correlationId: null, role: 'observed', type: 'PICK_PART', target: null, expectedActionId: null, correctness: 'correct', severity: 'info', timestampUtc: '2026-09-20T10:00:10Z', sequence: 1, isFault: false, isHint: false, isRecovery: false, isSafetyViolation: false, hint: null, safetyViolation: null, recovery: null, schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:00:10Z' },
  { id: 'x2', actionId: 'f1', correlationId: null, role: 'observed', type: 'fault', target: null, expectedActionId: null, correctness: 'unknown', severity: 'warning', timestampUtc: '2026-09-20T10:01:10Z', sequence: 2, isFault: true, isHint: false, isRecovery: false, isSafetyViolation: false, hint: null, safetyViolation: null, recovery: null, schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:01:10Z' },
  { id: 'x3', actionId: 'r1', correlationId: null, role: 'observed', type: 'recovery', target: null, expectedActionId: null, correctness: 'unknown', severity: 'info', timestampUtc: '2026-09-20T10:02:10Z', sequence: 3, isFault: false, isHint: false, isRecovery: true, isSafetyViolation: false, hint: null, safetyViolation: null, recovery: { faultId: 'f1', recoveredActionId: null, successful: true, target: null }, schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:02:10Z' },
  { id: 'x4', actionId: 'v1', correlationId: null, role: 'observed', type: 'safety.violation', target: null, expectedActionId: null, correctness: 'unknown', severity: 'critical', timestampUtc: '2026-09-20T10:03:10Z', sequence: 4, isFault: false, isHint: false, isRecovery: false, isSafetyViolation: true, hint: null, safetyViolation: { ruleId: 'guard-door-open', description: 'Simulated guard.', severity: 'critical' }, recovery: null, schemaVersion: '1.0', recordedAtUtc: '2026-09-20T10:03:10Z' },
]

const METRICS = {
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
}

async function mockDashboardApi(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    // Keep the identity stable: bootstrap() refreshes it from /api/auth/me, and a mock that erased
    // the role would remove the instructor surface.
    if (path.endsWith('/api/auth/me')) {
      return json({ subject: 'e2e-instructor', name: 'e2e-instructor', roles: ['Instructor'], authenticationType: 'test', organizationId: 'default', organizationName: 'Default organization' })
    }
    if (path.endsWith('/api/auth/config')) {
      return json({ mode: 'Test', developmentAuth: true, publicDemoEnabled: false, roles: ['Instructor'], warning: 'TEST AUTHENTICATION — NOT PRODUCTION SECURITY' })
    }
    if (path.endsWith('/api/organizations/classes')) {
      return json([{ id: 'class-1', organizationId: 'default', name: 'Cohort A', description: 'Morning cohort', instructorSubjects: ['instructor-1'], learnerSubjects: ['learner-1', 'learner-2'], scheduleMetadata: {}, createdAtUtc: '2026-09-01T08:00:00Z', updatedAtUtc: '2026-09-01T08:00:00Z', version: 0 }])
    }
    if (path.endsWith('/api/organizations/resources')) {
      return json([{ id: 'assignment-1', organizationId: 'default', classId: 'class-1', kind: 'Scenario', resourceId: 'pick-and-place', createdAtUtc: '2026-09-01T08:00:00Z' }])
    }
    if (path.endsWith('/api/training/metrics')) return json(METRICS)
    if (path.endsWith('/api/training/sessions/session-1/actions')) return json(ACTIONS)
    if (path.endsWith('/api/training/sessions/session-1')) return json(SESSION)
    if (path.endsWith('/api/training/sessions')) return json([SESSION])
    return json({})
  })
}

test.describe('instructor dashboard visual hierarchy', () => {
  for (const viewport of [{ name: 'panel', width: 1280, height: 800 }, { name: 'laptop', width: 1024, height: 768 }]) {
    test(`${viewport.name} renders the role-gated instructor surface`, async ({ page }) => {
      await page.setViewportSize(viewport)

      const token = fakeJwt({ sub: 'e2e-instructor', name: 'e2e-instructor', role: 'Instructor', exp: Math.floor(Date.now() / 1000) + 3600 })
      const seededIdentity = JSON.stringify({
        subject: 'e2e-instructor',
        name: 'e2e-instructor',
        roles: ['Instructor'],
        mode: 'Test',
        organizationId: 'default',
        organizationName: 'Default organization',
      })

      await page.addInitScript(([accessToken, identity]) => {
        sessionStorage.setItem('fabrik3d.auth.token', accessToken)
        sessionStorage.setItem('fabrik3d.auth.identity', identity)
      }, [token, seededIdentity] as const)

      await mockDashboardApi(page)
      await page.goto('/instructor')

      await expect(page.getByTestId('instructor-dashboard')).toBeVisible()
      await expect(page.getByTestId('metric-completionRate')).toContainText('%')
      await expect(page.getByTestId('comparison-table')).toBeVisible()

      test.skip(process.platform !== 'win32' && process.env.E2E_VISUAL !== '1', 'visual baselines are win32-only')
      await expect(page).toHaveScreenshot(`instructor-dashboard-${viewport.name}.png`, { fullPage: true, animations: 'disabled' })
    })
  }
})
