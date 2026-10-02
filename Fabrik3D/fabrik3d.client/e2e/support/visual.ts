import { test as base, expect, type Locator, type Page } from '@playwright/test'

/**
 * Deterministic visual-test protocol (S62).
 *
 * Every visual regression must follow the same ordered steps:
 *
 * ```text
 * reset → deterministic seed → deterministic scenario → ready wait → freeze → screenshot
 * ```
 *
 * - `reset` clears browser storage and navigates to a blank origin so a snapshot can never depend
 *   on state left behind by a previous test run.
 * - `seed` navigates to the harness/scenario under test with an explicit, fail-closed readiness
 *   marker; there is no arbitrary sleep that could capture a half-rendered scene.
 * - `freeze` disables motion, waits for the fonts to load and settles two animation frames so the
 *   captured state is stable rather than mid-render.
 * - `screenshot` compares against the committed baseline with CSS animations disabled.
 *
 * The helper never mutates runtime simulation state; it only observes the rendered surface.
 */

export interface VisualSteps {
  /** Clear storage and return to a blank origin so no previous test state can leak in. */
  reset(): Promise<void>
  /** Navigate to a URL and wait for an explicit readiness marker before continuing. */
  seed(path: string, readySelector?: string): Promise<void>
  /** Fail-closed readiness wait on an explicit marker (never an arbitrary sleep). */
  ready(selector: string, options?: { timeout?: number }): Promise<void>
  /**
   * Wait until the WebGL renderer reports a non-zero and stable draw-call count for several
   * consecutive samples. This is the deterministic counterpart of "wait until UI ready / freeze
   * expected state": it fails closed (timeout) rather than capturing a mid-load frame. Requires the
   * diagnostics surface (`?diagnostics=1`).
   */
  settleRender(options?: { stableSamples?: number; timeoutMs?: number }): Promise<void>
  /** Freeze motion, fonts and the render loop before a capture. */
  freeze(): Promise<void>
  /** Deterministic full-page capture with animations disabled. */
  screenshot(name: string, options?: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number }; mask?: Locator[] }): Promise<void>
}

export const test = base.extend<{ visual: VisualSteps }>({
  visual: async ({ page }, use) => {
    const visual: VisualSteps = {
      async reset() {
        await page.goto('about:blank')
        await page.evaluate(() => {
          try {
            window.localStorage.clear()
            window.sessionStorage.clear()
          } catch {
            // Storage can be unavailable on an opaque origin; reset still starts a fresh document.
          }
        })
      },

      async seed(path, readySelector) {
        await page.goto(path)
        if (readySelector) await visual.ready(readySelector)
      },

      async ready(selector, options) {
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: options?.timeout ?? 30_000 })
      },

      async settleRender(options) {
        const stableSamples = options?.stableSamples ?? 3
        await page.waitForFunction(
          (stable) => {
            const diagnostics = (window as {
              __fabrik3dDiagnostics?: { getSummary: () => { lastDrawCalls: number } | null }
              __fabrik3dVisualStableDraw?: number
              __fabrik3dVisualStableCount?: number
            }).__fabrik3dDiagnostics
            if (!diagnostics) return false
            const summary = diagnostics.getSummary()
            if (!summary || summary.lastDrawCalls <= 0) {
              ;(window as { __fabrik3dVisualStableDraw?: number }).__fabrik3dVisualStableDraw = 0
              ;(window as { __fabrik3dVisualStableCount?: number }).__fabrik3dVisualStableCount = 0
              return false
            }
            const state = window as { __fabrik3dVisualStableDraw?: number; __fabrik3dVisualStableCount?: number }
            if (state.__fabrik3dVisualStableDraw === summary.lastDrawCalls) {
              state.__fabrik3dVisualStableCount = (state.__fabrik3dVisualStableCount ?? 0) + 1
            } else {
              state.__fabrik3dVisualStableDraw = summary.lastDrawCalls
              state.__fabrik3dVisualStableCount = 1
            }
            return (state.__fabrik3dVisualStableCount ?? 0) >= stable
          },
          stableSamples,
          { timeout: options?.timeoutMs ?? 20_000, polling: 100 },
        )
      },

      async freeze() {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.evaluate(async () => {
          if (typeof document.fonts?.ready?.then === 'function') await document.fonts.ready
          // Two animation frames settle the first paint without an unbounded sleep. If the loop
          // never runs the promise never resolves and the test fails closed instead of capturing
          // an unknown state.
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        })
      },

      async screenshot(name, options) {
        await expect(page).toHaveScreenshot(name, {
          fullPage: options?.fullPage ?? true,
          animations: 'disabled',
          ...(options?.clip ? { clip: options.clip } : {}),
          ...(options?.mask ? { mask: options.mask } : {}),
        })
      },
    }

    await use(visual)
  },
})

export { expect }
export type { Page }
