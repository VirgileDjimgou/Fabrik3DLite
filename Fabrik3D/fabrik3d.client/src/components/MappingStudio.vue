<template>
  <section class="mapping-studio" data-mapping-studio aria-label="Signal mapping studio">
    <header class="studio-head">
      <div>
        <h4>{{ t('mapping.title') }}</h4>
        <p class="subtitle">{{ t('mapping.subtitle') }}</p>
      </div>
      <span class="simulated">{{ t('mapping.simulated') }}</span>
    </header>

    <div class="toolbar" role="toolbar">
      <button type="button" data-action="add" @click="addEntry">{{ t('mapping.add') }}</button>
      <button type="button" data-action="validate" @click="validateNow">{{ t('mapping.validate') }}</button>
      <label class="file-button">
        <span>{{ t('mapping.import') }}</span>
        <input type="file" accept="application/json,.json" data-action="import" @change="onImport" />
      </label>
      <button type="button" data-action="export" :disabled="!validation.valid" @click="onExport">{{ t('mapping.export') }}</button>
      <button type="button" data-action="save" @click="onSave">{{ t('mapping.save') }}</button>
      <button
        type="button"
        class="apply"
        data-action="apply"
        :disabled="applyState === 'pending' || !decision.canApply"
        @click="onApply"
      >{{ applyState === 'pending' ? t('mapping.applyPending') : t('mapping.apply') }}</button>
      <span v-if="statusMessage" class="status" :class="`status-${statusTone}`" data-mapping-status>{{ statusMessage }}</span>
    </div>

    <div v-if="pendingRemoval" class="confirm" role="alertdialog" data-remove-confirm>
      <span>{{ t('mapping.removeConfirm') }}: <strong>{{ pendingRemoval.name }}</strong> ({{ pendingRemoval.internalSignalId }} → {{ mappingTargetLabel(pendingRemoval) }})</span>
      <button type="button" data-action="confirm-remove" @click="confirmRemoval">{{ t('mapping.confirm') }}</button>
      <button type="button" data-action="cancel-remove" @click="pendingRemoval = null">{{ t('mapping.cancel') }}</button>
    </div>

    <div class="body">
      <div class="list-column">
        <table>
          <thead>
            <tr>
              <th>{{ t('mapping.signal') }}</th>
              <th>{{ t('mapping.protocol') }}</th>
              <th>{{ t('mapping.target') }}</th>
              <th>{{ t('mapping.direction') }}</th>
              <th>{{ t('mapping.datatype') }}</th>
              <th>{{ t('mapping.scaling') }}</th>
              <th>{{ t('mapping.unit') }}</th>
              <th>{{ t('mapping.status') }}</th>
              <th>{{ t('mapping.quality') }}</th>
              <th>{{ t('mapping.updated') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.entryId"
              :data-mapping-row="row.entryId"
              :class="{ selected: row.entryId === selectedEntryId, disabled: !row.enabled }"
              @click="selectEntry(row.entryId)"
            >
              <td class="mono">{{ row.internalSignalId }}</td>
              <td class="mono">{{ row.protocol }}</td>
              <td class="mono target">{{ row.targetLabel }}</td>
              <td class="mono">{{ row.direction }}</td>
              <td class="mono">{{ row.dataType }}</td>
              <td class="mono">{{ row.scale }} / {{ row.offset }}</td>
              <td class="mono">{{ row.unit ?? '—' }}</td>
              <td class="mono" :class="row.connectorHealthy ? 'ok' : 'bad'" :data-mapping-connector="row.entryId">{{ row.connectorState }}</td>
              <td>
                <span class="quality" :class="`quality-${row.external?.quality ?? (row.externalStale ? 'stale' : 'unknown')}`" :data-mapping-quality="row.entryId">
                  {{ row.external?.quality ?? (row.externalStale ? t('mapping.stale') : t('mapping.noValue')) }}
                </span>
              </td>
              <td class="mono">{{ row.external?.timestamp?.slice(11, 23) ?? '—' }}</td>
              <td>
                <button type="button" class="remove" :data-mapping-remove="row.entryId" @click.stop="requestRemoval(row.entryId)">✕</button>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="11" class="empty" data-mapping-empty>{{ t('mapping.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside class="side-column">
        <section class="validation" data-validation-panel aria-label="Validation">
          <h5>{{ t('mapping.validation') }}</h5>
          <p class="summary" :class="validation.valid ? 'ok' : 'bad'" data-validation-summary>
            {{ validation.errors.length }} {{ t('mapping.errors') }} · {{ validation.warnings.length }} {{ t('mapping.warnings') }}
          </p>
          <ul>
            <li
              v-for="(diagnostic, index) in diagnostics"
              :key="`${diagnostic.code}-${index}`"
              :data-diagnostic="diagnostic.code"
              :class="diagnostic.severity"
              tabindex="0"
              @click="jumpTo(diagnostic.entryId)"
              @keydown.enter="jumpTo(diagnostic.entryId)"
            >
              <strong>{{ diagnostic.severity }}</strong> · {{ diagnostic.message }}
            </li>
            <li v-if="diagnostics.length === 0" data-validation-clean>{{ t('mapping.noDiagnostics') }}</li>
          </ul>
        </section>

        <section v-if="selectedEntry" class="editor" data-mapping-editor aria-label="Edit mapping">
          <h5>{{ t('mapping.edit') }}</h5>
          <label><span>{{ t('mapping.name') }}</span><input :value="selectedEntry.name" data-edit="name" @input="patch({ name: text($event) })" /></label>
          <label>
            <span>{{ t('mapping.direction') }}</span>
            <select :value="selectedEntry.direction" data-edit="direction" @change="patch({ direction: text($event) as MappingDirection })">
              <option v-for="option in MAPPING_DIRECTIONS" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('mapping.datatype') }}</span>
            <select :value="selectedEntry.dataType" data-edit="dataType" @change="patch({ dataType: text($event) as MappingDataType })">
              <option v-for="option in MAPPING_DATA_TYPES" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label><span>{{ t('mapping.scaling') }} (scale)</span><input :value="selectedEntry.scale" type="number" step="any" data-edit="scale" @input="patch({ scale: number($event) })" /></label>
          <label><span>{{ t('mapping.scaling') }} (offset)</span><input :value="selectedEntry.offset" type="number" step="any" data-edit="offset" @input="patch({ offset: number($event) })" /></label>
          <label><span>{{ t('mapping.unit') }}</span><input :value="selectedEntry.unit ?? ''" data-edit="unit" @input="patch({ unit: text($event) })" /></label>
          <label class="check"><input type="checkbox" :checked="selectedEntry.enabled" data-edit="enabled" @change="patch({ enabled: checked($event) })" /><span>{{ t('mapping.enabled') }}</span></label>

          <template v-if="selectedEntry.protocol === 'opcua'">
            <label><span>{{ t('mapping.nodeId') }}</span><input :value="selectedEntry.target.nodeId ?? ''" data-edit="nodeId" @input="patchTarget({ nodeId: text($event) })" /></label>
          </template>
          <template v-else-if="selectedEntry.protocol === 'mqtt'">
            <label><span>{{ t('mapping.topic') }}</span><input :value="selectedEntry.target.topic ?? ''" data-edit="topic" @input="patchTarget({ topic: text($event) })" /></label>
            <label><span>{{ t('mapping.payloadField') }}</span><input :value="selectedEntry.target.payloadField ?? ''" data-edit="payloadField" @input="patchTarget({ payloadField: text($event) })" /></label>
          </template>
          <template v-else>
            <label>
              <span>{{ t('mapping.area') }}</span>
              <select :value="selectedEntry.target.area ?? 'holding-register'" data-edit="area" @change="patchTarget({ area: text($event) as ModbusArea })">
                <option v-for="option in MODBUS_AREAS" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label><span>{{ t('mapping.address') }}</span><input :value="selectedEntry.target.address ?? 0" type="number" data-edit="address" @input="patchTarget({ address: number($event) })" /></label>
            <label><span>{{ t('mapping.width') }}</span><input :value="selectedEntry.target.width ?? 16" type="number" data-edit="width" @input="patchTarget({ width: number($event) })" /></label>
            <label><span>{{ t('mapping.bitIndex') }}</span><input :value="selectedEntry.target.bitIndex ?? ''" type="number" data-edit="bitIndex" @input="patchTarget({ bitIndex: number($event) })" /></label>
            <label>
              <span>{{ t('mapping.byteOrder') }}</span>
              <select :value="selectedEntry.target.byteOrder ?? 'big-endian'" data-edit="byteOrder" @change="patchTarget({ byteOrder: text($event) as ByteOrder })">
                <option v-for="option in BYTE_ORDERS" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
          </template>

          <label class="notes"><span>{{ t('mapping.notes') }}</span><textarea :value="selectedEntry.notes ?? ''" data-edit="notes" @input="patch({ notes: text($event) })"></textarea></label>
        </section>
        <p v-else class="hint" data-mapping-editor-empty>{{ t('mapping.selectRow') }}</p>
      </aside>
    </div>

    <section class="monitor" data-mapping-monitor aria-label="Live signal monitor">
      <header class="monitor-head">
        <h5>{{ t('mapping.monitor') }}</h5>
        <div class="filters">
          <label>
            <span>{{ t('mapping.filterEquipment') }}</span>
            <select v-model="equipmentFilter" data-monitor-equipment>
              <option value="all">{{ t('mapping.all') }}</option>
              <option v-for="id in equipmentIds" :key="id" :value="id">{{ id }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('mapping.filterProtocol') }}</span>
            <select v-model="protocolFilter" data-monitor-protocol>
              <option value="all">{{ t('mapping.all') }}</option>
              <option v-for="protocol in MAPPING_PROTOCOLS" :key="protocol" :value="protocol">{{ protocol }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('mapping.search') }}</span>
            <input v-model="search" type="search" data-monitor-search />
          </label>
          <span class="count" data-monitor-count>{{ monitorRows.length }} / {{ allRows.length }}</span>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th>{{ t('mapping.signal') }}</th>
            <th>{{ t('mapping.protocol') }}</th>
            <th>{{ t('mapping.target') }}</th>
            <th>{{ t('mapping.internal') }}</th>
            <th>{{ t('mapping.external') }}</th>
            <th>{{ t('mapping.quality') }}</th>
            <th>{{ t('mapping.updated') }}</th>
            <th>{{ t('mapping.health') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in monitorRows" :key="row.entryId" :data-monitor-row="row.entryId">
            <td class="mono">{{ row.internalSignalId }}</td>
            <td class="mono">{{ row.protocol }}</td>
            <td class="mono target">{{ row.targetLabel }}</td>
            <td class="mono" :data-monitor-internal="row.entryId">{{ formatValue(row.internal?.value) }}</td>
            <td class="mono" :data-monitor-external="row.entryId">{{ formatValue(row.external?.value) }}</td>
            <td>
              <span class="quality" :class="`quality-${row.external?.quality ?? (row.externalStale ? 'stale' : 'unknown')}`" :data-monitor-quality="row.entryId">
                {{ row.external?.quality ?? (row.externalStale ? t('mapping.stale') : t('mapping.noValue')) }}
              </span>
            </td>
            <td class="mono">{{ row.external?.timestamp?.slice(11, 23) ?? '—' }}</td>
            <td class="mono" :class="row.connectorHealthy ? 'ok' : 'bad'" :data-monitor-health="row.entryId">{{ row.connectorState }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SignalRegistry } from '../signals/SignalRegistry'
import type { SignalQuality, SignalSource } from '../signals/types'
import { useSimulatorI18n } from '../i18n/simulator'
import {
  BYTE_ORDERS,
  MAPPING_DATA_TYPES,
  MAPPING_DIRECTIONS,
  MAPPING_PROTOCOLS,
  MODBUS_AREAS,
  createCatalogFromRegistry,
  downloadMappingFile,
  evaluateMappingApplication,
  exportMappingFile,
  importMappingFile,
  MAPPING_SCHEMA_VERSION,
  mappingTargetLabel,
  summarizeMappingDiagnostics,
  validateMappingFile,
  buildMappingMonitorRows,
  filterMonitorRows,
  type ByteOrder,
  type ConnectorHealth,
  type MappingDataType,
  type MappingDirection,
  type MappingEntryV1,
  type MappingFileV1,
  type MappingTargetDescriptor,
  type ModbusArea,
  type MonitorInternalSample,
} from '../mapping'

export interface MappingApplyFeedback {
  ok: boolean
  message: string
}

const props = withDefaults(defineProps<{
  registry: SignalRegistry
  initialFile?: MappingFileV1
  connectorHealth?: ConnectorHealth[]
  applyHandler?: ((file: MappingFileV1) => Promise<MappingApplyFeedback>) | null
  now?: () => number
}>(), {
  initialFile: undefined,
  connectorHealth: () => [],
  applyHandler: null,
  now: () => Date.now(),
})

const emit = defineEmits<{ (event: 'apply', payload: { file: MappingFileV1; ok: boolean }): void }>()

const { t } = useSimulatorI18n()
const catalog = computed(() => createCatalogFromRegistry(props.registry))

const sampleFile: MappingFileV1 = { schemaVersion: MAPPING_SCHEMA_VERSION, id: 'mapping', name: 'Mapping', entries: [] }
const file = ref<MappingFileV1>(props.initialFile ?? sampleFile)
watch(() => props.initialFile, (next) => { if (next) file.value = next })

const selectedEntryId = ref<string | null>(null)
const pendingRemoval = ref<MappingEntryV1 | null>(null)
const equipmentFilter = ref('all')
const protocolFilter = ref<'all' | 'opcua' | 'mqtt' | 'modbus'>('all')
const search = ref('')
const statusMessage = ref('')
const statusTone = ref<'ok' | 'bad'>('ok')
const applyState = ref<'idle' | 'pending' | 'success' | 'failure'>('idle')

const diagnostics = computed(() => validateMappingFile(file.value, catalog.value))
const validation = computed(() => summarizeMappingDiagnostics(diagnostics.value))
const decision = computed(() => evaluateMappingApplication(file.value, catalog.value))
const selectedEntry = computed(() => file.value.entries.find((entry) => entry.id === selectedEntryId.value) ?? null)

const samples = computed<Map<string, MonitorInternalSample>>(() => {
  const map = new Map<string, MonitorInternalSample>()
  for (const sample of props.registry.snapshot()) {
    map.set(sample.signalId, {
      value: sample.value,
      quality: sample.quality as SignalQuality,
      source: sample.source as SignalSource,
      timestamp: sample.timestamp,
    })
  }
  return map
})

const health = computed<Map<'opcua' | 'mqtt' | 'modbus', ConnectorHealth>>(() => {
  const map = new Map<'opcua' | 'mqtt' | 'modbus', ConnectorHealth>()
  for (const entry of props.connectorHealth) map.set(entry.protocol, entry)
  return map
})

const allRows = computed(() => buildMappingMonitorRows(file.value, samples.value, health.value))
const rows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return allRows.value.filter((row) => {
    if (equipmentFilter.value !== 'all' && row.equipmentId !== equipmentFilter.value) return false
    if (protocolFilter.value !== 'all' && row.protocol !== protocolFilter.value) return false
    if (term && !`${row.internalSignalId} ${row.entryId} ${row.targetLabel}`.toLowerCase().includes(term)) return false
    return true
  })
})
const monitorRows = computed(() => filterMonitorRows(allRows.value, {
  equipmentId: equipmentFilter.value,
  protocol: protocolFilter.value,
  search: search.value,
}))
const equipmentIds = computed(() => [...new Set(file.value.entries.map((entry) => entry.equipmentId))].sort())

function text(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
}

function number(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function patch(update: Partial<MappingEntryV1>): void {
  const id = selectedEntryId.value
  if (!id) return
  file.value = {
    ...file.value,
    entries: file.value.entries.map((entry) => (entry.id === id ? { ...entry, ...update } : entry)),
  }
}

function patchTarget(update: MappingTargetDescriptor): void {
  const id = selectedEntryId.value
  if (!id) return
  file.value = {
    ...file.value,
    entries: file.value.entries.map((entry) => (entry.id === id ? { ...entry, target: { ...entry.target, ...update } } : entry)),
  }
}

function selectEntry(id: string): void {
  selectedEntryId.value = id
}

function jumpTo(entryId?: string): void {
  if (!entryId) return
  selectedEntryId.value = entryId
  const element = document.querySelector(`[data-mapping-row="${entryId}"]`)
  if (element && typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'nearest' })
}

function addEntry(): void {
  const id = `mapping-${Date.now().toString(36)}`
  const entry: MappingEntryV1 = {
    id,
    name: 'New mapping',
    protocol: 'opcua',
    internalSignalId: '',
    equipmentId: '',
    direction: 'read',
    dataType: 'float',
    scale: 1,
    offset: 0,
    enabled: true,
    target: { nodeId: '' },
  }
  file.value = { ...file.value, entries: [...file.value.entries, entry] }
  selectedEntryId.value = id
}

function requestRemoval(id: string): void {
  pendingRemoval.value = file.value.entries.find((entry) => entry.id === id) ?? null
}

function confirmRemoval(): void {
  const target = pendingRemoval.value
  if (!target) return
  file.value = { ...file.value, entries: file.value.entries.filter((entry) => entry.id !== target.id) }
  if (selectedEntryId.value === target.id) selectedEntryId.value = null
  pendingRemoval.value = null
}

function validateNow(): void {
  statusTone.value = validation.value.valid ? 'ok' : 'bad'
  statusMessage.value = validation.value.valid ? t('mapping.valid') : t('mapping.invalid')
}

function onImport(event: Event): void {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0]
  if (!chosen) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const result = importMappingFile(String(reader.result ?? ''), catalog.value)
      file.value = result.file
      statusTone.value = result.validation.valid ? 'ok' : 'bad'
      statusMessage.value = result.validation.valid ? t('mapping.imported') : t('mapping.invalid')
    } catch (error) {
      statusTone.value = 'bad'
      statusMessage.value = error instanceof Error ? error.message : String(error)
    }
  }
  reader.readAsText(chosen)
  input.value = ''
}

function onExport(): void {
  try {
    const serialized = exportMappingFile(file.value, catalog.value)
    downloadMappingFile(JSON.parse(serialized) as MappingFileV1, `${file.value.id}.json`)
    statusTone.value = 'ok'
    statusMessage.value = t('mapping.exported')
  } catch (error) {
    statusTone.value = 'bad'
    statusMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function onSave(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`fabrik3d:mapping:${file.value.id}`, JSON.stringify(file.value))
    }
    statusTone.value = validation.value.valid ? 'ok' : 'bad'
    statusMessage.value = t('mapping.saved')
  } catch (error) {
    statusTone.value = 'bad'
    statusMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function onApply(): Promise<void> {
  if (!decision.value.canApply) {
    statusTone.value = 'bad'
    statusMessage.value = t('mapping.applyBlocked')
    applyState.value = 'failure'
    return
  }
  applyState.value = 'pending'
  statusTone.value = 'ok'
  statusMessage.value = t('mapping.applyPending')
  try {
    const result = props.applyHandler
      ? await props.applyHandler(file.value)
      : { ok: true, message: t('mapping.applySuccess') }
    applyState.value = result.ok ? 'success' : 'failure'
    statusTone.value = result.ok ? 'ok' : 'bad'
    statusMessage.value = result.message
    emit('apply', { file: file.value, ok: result.ok })
  } catch (error) {
    applyState.value = 'failure'
    statusTone.value = 'bad'
    statusMessage.value = `${t('mapping.applyFailure')} ${error instanceof Error ? error.message : String(error)}`
    emit('apply', { file: file.value, ok: false })
  }
}

function formatValue(value: boolean | number | string | undefined): string {
  if (value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}
</script>

<style scoped>
.mapping-studio { display: grid; gap: .55rem; color: #dbe7ec; font: .72rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.studio-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
.studio-head h4 { margin: 0; color: #9de3f6; font-size: .85rem; }
.subtitle { margin: .1rem 0 0; color: #8fb6c4; }
.simulated { color: #ffd166; font-weight: 700; }
.toolbar { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
.toolbar button, .file-button { padding: .25rem .5rem; border: 1px solid #34758a; border-radius: .25rem; background: #10232d; color: #dbe7ec; cursor: pointer; font: inherit; }
.toolbar button:disabled { opacity: .45; cursor: not-allowed; }
.toolbar .apply { border-color: #00cc88; color: #68dfa8; }
.file-button { display: inline-flex; align-items: center; gap: .3rem; }
.file-button input { display: none; }
.status { margin-left: auto; }
.status-ok { color: #68dfa8; }
.status-bad { color: #ff8080; }
.confirm { display: flex; gap: .5rem; align-items: center; border-left: 3px solid #ff8080; background: rgb(255 128 128 / 8%); padding: .35rem .5rem; }
.body { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(16rem, 1fr); gap: .55rem; align-items: start; }
.table-wrap, .list-column { min-width: 0; }
table { width: 100%; border-collapse: collapse; }
th { position: sticky; top: 0; background: #0d1f29; color: #8fb6c4; text-align: left; text-transform: uppercase; letter-spacing: .04em; padding: .3rem .4rem; }
td { padding: .28rem .4rem; border-top: 1px solid rgb(255 255 255 / 5%); }
.mono { white-space: nowrap; }
.target { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; }
tr.selected { background: rgb(0 204 136 / 10%); outline: 1px solid #34758a; }
tr.disabled td { opacity: .55; }
.ok { color: #68dfa8; }
.bad { color: #ff8080; }
.quality { padding: .05rem .3rem; border: 1px solid currentColor; border-radius: 999px; font-size: .66rem; font-weight: 800; text-transform: uppercase; }
.quality-good { color: #68dfa8; }
.quality-stale, .quality-uncertain { color: #ffd166; }
.quality-bad, .quality-invalid { color: #ff8080; }
.quality-unknown { color: #7f9aa6; }
.remove { border: none; background: transparent; color: #ff8080; cursor: pointer; font: inherit; }
.side-column { display: grid; gap: .55rem; }
.validation, .editor { border: 1px solid #23485a; border-radius: .3rem; padding: .4rem .5rem; background: #0d1f29; }
.validation h5, .editor h5, .monitor h5 { margin: 0 0 .3rem; color: #9de3f6; font-size: .75rem; }
.summary.ok { color: #68dfa8; }
.summary.bad { color: #ff8080; }
.validation ul { margin: .25rem 0 0; padding: 0; list-style: none; max-height: 12rem; overflow: auto; }
.validation li { padding: .18rem .25rem; cursor: pointer; border-left: 2px solid transparent; }
.validation li.error { color: #ff8080; border-left-color: #ff8080; }
.validation li.warning { color: #ffd166; border-left-color: #ffd166; }
.editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .3rem; }
.editor label { display: grid; gap: .1rem; color: #8fb6c4; }
.editor input, .editor select, .editor textarea { padding: .22rem .3rem; border: 1px solid #34758a; border-radius: .25rem; background: #10232d; color: #fff; font: inherit; min-width: 0; }
.editor .check { grid-template-columns: auto 1fr; align-items: center; }
.editor .notes { grid-column: 1 / -1; }
.hint { color: #7f9aa6; }
.monitor { border: 1px solid #23485a; border-radius: .3rem; padding: .4rem .5rem; }
.monitor-head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .4rem; }
.filters { display: flex; gap: .5rem; flex-wrap: wrap; }
.filters label { display: grid; gap: .1rem; color: #8fb6c4; }
.filters select, .filters input { padding: .2rem .3rem; border: 1px solid #34758a; border-radius: .25rem; background: #10232d; color: #fff; font: inherit; }
.count { color: #7f9aa6; align-self: end; }
.empty { text-align: center; color: #7f9aa6; padding: .8rem; }
@media (max-width: 1100px) {
  .body { grid-template-columns: minmax(0, 1fr); }
}
</style>
