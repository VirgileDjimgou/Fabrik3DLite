import type { ScenePresetCatalog } from './catalog'

/** Framework-independent scene selection and remount lifecycle state. */
export class SceneSelectionController {
  private revision = 0
  private currentId: string

  constructor(private readonly catalog: ScenePresetCatalog, private readonly defaultId: string) {
    catalog.get(defaultId)
    this.currentId = defaultId
  }

  get selectedId(): string { return this.currentId }
  get hostKey(): string { return `${this.currentId}:${this.revision}` }
  get canSimulate(): boolean { return this.catalog.get(this.currentId).capability === 'simulation-ready' }

  select(id: string): boolean {
    this.catalog.get(id)
    if (id === this.currentId) return false
    this.currentId = id
    this.revision += 1
    return true
  }

  reset(): void {
    this.currentId = this.defaultId
    this.revision += 1
  }
}
