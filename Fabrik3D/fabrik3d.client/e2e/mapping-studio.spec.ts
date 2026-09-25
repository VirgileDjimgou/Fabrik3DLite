import { expect, test } from '@playwright/test'

/**
 * End-to-end mapping workflow against the deterministic, WebGL-free studio harness:
 * import → validate (conflict) → remove conflicting mapping → apply → live monitor → export.
 */
test.describe('signal mapping studio', () => {
  test('imports, validates, resolves a conflict, applies and exports', async ({ page }) => {
    await page.goto('/?view=mapping-studio')
    await expect(page.locator('[data-mapping-studio]')).toBeVisible()
    await expect(page.locator('[data-mapping-row]')).toHaveCount(6)

    // The shipped reference sample is valid and ready to apply.
    await expect(page.locator('[data-validation-summary]')).toContainText('0 errors')
    await expect(page.locator('[data-action="apply"]')).toBeEnabled()

    // Live monitor shows the internal value from the reference-cell harness, filtered by equipment.
    await page.locator('[data-monitor-equipment]').selectOption('cnc-1')
    await expect(page.locator('[data-monitor-internal="opcua-cnc-spindle-speed"]')).toHaveText('8000')
    await expect(page.locator('[data-monitor-health="opcua-cnc-spindle-speed"]')).toHaveText('Connected')

    // Explicit apply reports success for the valid sample.
    await page.locator('[data-action="apply"]').click()
    await expect(page.locator('[data-mapping-status]')).toContainText('Applied 6 mapping(s)')

    // Reset the shared filters before importing a different mapping file.
    await page.locator('[data-monitor-equipment]').selectOption('all')

    // Import a file with a duplicate write target: validation must flag a conflict.
    const conflicting = {
      schemaVersion: '1.0',
      id: 'conflicting-mapping',
      name: 'Conflicting mapping',
      entries: [
        {
          id: 'opcua-robot-start-a',
          name: 'Robot start A',
          protocol: 'opcua',
          internalSignalId: 'robot-1.Start',
          equipmentId: 'robot-1',
          direction: 'write',
          dataType: 'bool',
          scale: 1,
          offset: 0,
          enabled: true,
          target: { nodeId: 'ns=2;s=Fabrik3D/Robot/Start' },
        },
        {
          id: 'opcua-robot-start-b',
          name: 'Robot start B',
          protocol: 'opcua',
          internalSignalId: 'robot-1.Stop',
          equipmentId: 'robot-1',
          direction: 'write',
          dataType: 'bool',
          scale: 1,
          offset: 0,
          enabled: true,
          target: { nodeId: 'ns=2;s=Fabrik3D/Robot/Start' },
        },
      ],
    }
    await page.locator('[data-action="import"]').setInputFiles({
      name: 'conflicting-mapping.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conflicting)),
    })
    await expect(page.locator('[data-mapping-row]')).toHaveCount(2)
    await expect(page.locator('[data-diagnostic="duplicate-write-target"]')).toBeVisible()
    await expect(page.locator('[data-action="apply"]')).toBeDisabled()

    // Resolve the conflict through the target-confirmed removal flow.
    await page.locator('[data-mapping-remove="opcua-robot-start-b"]').click()
    await expect(page.locator('[data-remove-confirm]')).toContainText('robot-1.Stop')
    await page.locator('[data-action="confirm-remove"]').click()
    await expect(page.locator('[data-mapping-row]')).toHaveCount(1)
    await expect(page.locator('[data-action="apply"]')).toBeEnabled()

    // Explicit apply of the repaired mapping reports success.
    await page.locator('[data-action="apply"]').click()
    await expect(page.locator('[data-mapping-status]')).toContainText('Applied')

    // Export produces a deterministic, re-importable mapping file.
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-action="export"]').click(),
    ]).then(([result]) => result)
    expect(download.suggestedFilename()).toBe('conflicting-mapping.json')
  })

  test('rejects an unknown internal signal on import', async ({ page }) => {
    await page.goto('/?view=mapping-studio')
    const invalid = {
      schemaVersion: '1.0',
      id: 'invalid-mapping',
      name: 'Invalid mapping',
      entries: [
        {
          id: 'bad-signal',
          name: 'Unknown signal',
          protocol: 'opcua',
          internalSignalId: 'robot-1.NoSuchSignal',
          equipmentId: 'robot-1',
          direction: 'read',
          dataType: 'bool',
          scale: 1,
          offset: 0,
          enabled: true,
          target: { nodeId: 'ns=2;s=Fabrik3D/Robot/NoSuchSignal' },
        },
      ],
    }
    await page.locator('[data-action="import"]').setInputFiles({
      name: 'invalid-mapping.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid)),
    })
    await expect(page.locator('[data-diagnostic="unknown-signal"]')).toBeVisible()
    await expect(page.locator('[data-action="apply"]')).toBeDisabled()
  })
})
