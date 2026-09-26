import { expect, test } from '@playwright/test'

const API_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:7249'

test.describe('industrial HMI visual hierarchy', () => {
  for (const viewport of [{ name: 'panel', width: 1280, height: 800 }, { name: 'laptop', width: 1024, height: 768 }]) {
    test(`${viewport.name} preserves neutral navigation hierarchy`, async ({ page, request }) => {
      await page.setViewportSize(viewport)

      // Authenticate with a real Test-mode operator token before the app boots. The login surface
      // itself is covered by component tests; here we validate the authenticated workspace.
      const tokenResponse = await request.post(`${API_BASE_URL}/api/auth/dev-token`, {
        data: { role: 'Operator', subject: 'e2e-operator' },
      })
      expect(tokenResponse.ok()).toBeTruthy()
      const token = await tokenResponse.json() as { accessToken: string; mode: string }
      // The seeded identity mirrors the server-resolved organization (S43) so the workspace renders
      // the same context label it would after a real /api/auth/me refresh.
      const seededIdentity = JSON.stringify({
        subject: 'e2e-operator',
        name: 'e2e-operator',
        roles: ['Operator'],
        mode: token.mode,
        organizationId: 'default',
        organizationName: 'Default organization',
      })

      await page.addInitScript(([accessToken, identity]) => {
        sessionStorage.setItem('fabrik3d.auth.token', accessToken)
        sessionStorage.setItem('fabrik3d.auth.identity', identity)
      }, [token.accessToken, seededIdentity] as const)

      await page.goto('/')
      await expect(page.getByRole('link', { name: /Select job|Selectionner|Auftrag zum Starten/ })).toBeVisible()

      // Screenshot baselines are platform-specific (the committed ones are
      // win32). Compare them on the platform that owns the baseline, or when
      // a developer explicitly opts in; other platforms still validate that
      // the HMI renders the expected navigation.
      test.skip(process.platform !== 'win32' && process.env.E2E_VISUAL !== '1', 'visual baselines are win32-only')
      await expect(page).toHaveScreenshot(`hmi-home-${viewport.name}.png`, { fullPage: true, animations: 'disabled' })
    })
  }
})
