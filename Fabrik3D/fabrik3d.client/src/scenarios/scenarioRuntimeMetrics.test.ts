import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EquipmentAssetRuntime, ThreeGlbAssetLoader, createIndustrialAssetRegistry } from '../equipment/assets'
import { createDefaultScenePresetCatalog } from '../scenes'
import { ScenarioRuntimeHost, type ScenarioRuntimeMetrics } from './ScenarioRuntimeHost'
import { resolveScenarioSceneBinding } from './sceneBinding'

interface ScenarioMetricReport extends ScenarioRuntimeMetrics {
  scenarioId: string
  presetId: string
}

/**
 * S58 GPU-free performance evidence. Before S58 the material-flow presets
 * rendered as an SVG plan view (0 meshes / 0 triangles / 0 WebGL draw calls);
 * after S58 each renders a bounded Three.js cell. These numbers are recorded on
 * the CI host and are not reference-hardware GPU frame-time claims.
 */
describe('S58 scenario runtime resource evidence', () => {
  it('records bounded metrics for every simulation-ready material-flow scenario', async () => {
    const runtime = new EquipmentAssetRuntime(
      createIndustrialAssetRegistry(),
      new ThreeGlbAssetLoader({ loadAsync: vi.fn(async () => { throw new Error('offline evidence runtime') }) }),
    )
    const catalog = createDefaultScenePresetCatalog()
    const report: ScenarioMetricReport[] = []

    for (const preset of catalog.list().filter(candidate => candidate.runtimeProfile === 'material-flow')) {
      const binding = resolveScenarioSceneBinding(preset.defaultScenarioId!, catalog)
      const host = new ScenarioRuntimeHost({ assetRuntime: runtime })
      host.bind(binding)
      const metrics = await host.loadVisuals()
      report.push({ scenarioId: binding.scenarioId, presetId: preset.id, ...metrics })

      expect(metrics.equipmentCount).toBe(binding.cell.equipment.length)
      expect(metrics.triangles).toBeGreaterThan(0)
      expect(metrics.triangles).toBeLessThan(20_000)
      expect(metrics.drawCalls).toBeGreaterThan(0)
      expect(metrics.drawCalls).toBeLessThan(200)
      expect(metrics.loadMs).toBeGreaterThanOrEqual(0)
      const equipmentChildren = host.root.children.filter((child) => typeof child.userData.equipmentId === 'string')
      const environmentChildren = host.root.children.filter((child) => child.name.startsWith('FactoryEnvironment:'))
      expect(equipmentChildren).toHaveLength(metrics.equipmentCount)
      expect(environmentChildren).toHaveLength(1)
      host.dispose()
    }

    expect(report).toHaveLength(4)
    const directory = resolve('test-results', 'perf')
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      resolve(directory, 'scenario-runtime-metrics.json'),
      `${JSON.stringify({ schemaVersion: '1.0', recordedAt: new Date().toISOString(), harness: 'vitest-gpu-free', scenarios: report }, null, 2)}\n`,
      'utf8',
    )
  })
})
