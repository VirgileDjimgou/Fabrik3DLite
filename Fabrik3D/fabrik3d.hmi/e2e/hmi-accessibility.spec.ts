import { expect, test } from '@playwright/test'

const API_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:7249'

/**
 * S49 accessibility validation toward WCAG 2.2 AA for the operator HMI. It checks keyboard
 * reachability, visible focus, landmark/label semantics and target sizes on the rendered workspace.
 * It complements the component-level Vitest assertions and the manual review recorded in
 * docs/operations/ACCESSIBILITY.md.
 */
test.describe('operator HMI accessibility', () => {
  test.beforeEach(async ({ page, request }) => {
    const tokenResponse = await request.post(`${API_BASE_URL}/api/auth/dev-token`, {
      data: { role: 'Operator', subject: 'e2e-a11y' },
    })
    expect(tokenResponse.ok()).toBeTruthy()
    const token = await tokenResponse.json() as { accessToken: string; mode: string }
    const seededIdentity = JSON.stringify({
      subject: 'e2e-a11y',
      name: 'e2e-a11y',
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
  })

  test('exposes labelled landmarks and status semantics', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(nav).toBeVisible()
    await expect(page.getByTestId('hmi-connection-badge')).toHaveAttribute('role', 'status')
  })

  test('is keyboard reachable with a visible focus indicator', async ({ page }) => {
    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      if (!element) return null
      const style = getComputedStyle(element)
      return { tag: element.tagName, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
    })
    expect(first).not.toBeNull()
    expect(first!.tag).not.toBe('BODY')
    expect(first!.outlineStyle).not.toBe('none')
    expect(parseFloat(first!.outlineWidth)).toBeGreaterThan(0)
  })

  test('meets the WCAG 2.2 target-size minimum on navigation controls', async ({ page }) => {
    const sizes = await page.locator('nav.hmi-bottom-nav a, nav.hmi-bottom-nav button').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) {
      // WCAG 2.2 AA target size (minimum) is 24x24 CSS px; the HMI token is 44px.
      expect(size.height).toBeGreaterThanOrEqual(24)
      expect(size.width).toBeGreaterThanOrEqual(24)
    }
  })
})
