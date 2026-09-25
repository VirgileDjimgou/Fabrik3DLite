<template>
  <section class="signal-inspector" data-signal-inspector aria-label="I/O signal monitor">
    <header class="inspector-head">
      <h4>{{ t('signals.title') }}</h4>
      <span class="simulated">{{ t('signals.simulated') }}</span>
    </header>

    <div class="filters">
      <label>
        <span>{{ t('signals.equipment') }}</span>
        <select v-model="equipmentFilter" data-signal-equipment-filter>
          <option value="all">{{ t('signals.allEquipment') }}</option>
          <option v-for="id in equipmentIds" :key="id" :value="id">{{ id }}</option>
        </select>
      </label>
      <label>
        <span>{{ t('signals.search') }}</span>
        <input v-model="search" type="search" data-signal-search :placeholder="t('signals.searchPlaceholder')" />
      </label>
      <span class="count" data-signal-count>{{ rows.length }} / {{ definitions.length }}</span>
    </div>

    <div v-if="diagnostics.length > 0" class="diagnostics" role="status" data-signal-diagnostics>
      <strong>{{ t('signals.diagnostics') }}</strong>
      <ul>
        <li v-for="diagnostic in diagnostics" :key="diagnostic.signalId" :data-signal-diagnostic="diagnostic.signalId">
          {{ diagnostic.signalId }} — {{ diagnosticLabel(diagnostic.reason) }}
        </li>
      </ul>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t('signals.signal') }}</th>
            <th>{{ t('signals.direction') }}</th>
            <th>{{ t('signals.type') }}</th>
            <th>{{ t('signals.value') }}</th>
            <th>{{ t('signals.unit') }}</th>
            <th>{{ t('signals.quality') }}</th>
            <th>{{ t('signals.source') }}</th>
            <th>{{ t('signals.timestamp') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.definition.id" :data-signal-row="row.definition.id" :data-signal-id="row.definition.id">
            <td class="mono">
              <span class="signal-id">{{ row.definition.id }}</span>
              <small>{{ row.definition.displayName }}</small>
            </td>
            <td class="mono">{{ row.definition.direction }}</td>
            <td class="mono">{{ row.definition.dataType }}</td>
            <td class="mono value" :data-signal-value="row.definition.id">{{ formatValue(row) }}</td>
            <td class="mono">{{ row.definition.engineeringUnit ?? '—' }}</td>
            <td>
              <span class="quality" :class="`quality-${row.sample?.quality ?? 'unknown'}`" :data-signal-quality="row.definition.id">
                {{ row.sample?.quality ?? t('signals.noValue') }}
              </span>
            </td>
            <td class="mono">{{ row.sample?.source ?? '—' }}</td>
            <td class="mono timestamp">{{ formatTimestamp(row.sample?.timestamp) }}</td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="8" class="empty" data-signal-empty>{{ t('signals.noRows') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SignalDefinition, SignalSample } from '../signals/types'
import type { ReferenceCellSignalBinding, SignalCoverageDiagnostic, SignalCoverageReason } from '../signals/binding'
import type { SignalRegistry } from '../signals/SignalRegistry'
import { useSimulatorI18n } from '../i18n/simulator'

const props = withDefaults(defineProps<{
  registry: SignalRegistry
  binding?: ReferenceCellSignalBinding | null
  refreshIntervalMs?: number
}>(), {
  binding: null,
  refreshIntervalMs: 1_000,
})

const { t } = useSimulatorI18n()
const definitions = ref<SignalDefinition[]>([])
const samples = ref<SignalSample[]>([])
const diagnostics = ref<SignalCoverageDiagnostic[]>([])
const equipmentFilter = ref('all')
const search = ref('')
let refreshTimer: number | null = null

function refresh(): void {
  definitions.value = [...props.registry.getAllDefinitions()]
  samples.value = [...props.registry.snapshot()]
  diagnostics.value = props.binding ? [...props.binding.coverageDiagnostics()] : []
}

onMounted(() => {
  refresh()
  refreshTimer = window.setInterval(refresh, props.refreshIntervalMs)
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
})

watch(() => props.registry, refresh)
watch(() => props.binding, refresh)

const equipmentIds = computed(() => [...new Set(definitions.value.map((definition) => definition.equipmentId))].sort())
const sampleById = computed(() => new Map(samples.value.map((sample) => [sample.signalId, sample])))

const rows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return definitions.value
    .filter((definition) => equipmentFilter.value === 'all' || definition.equipmentId === equipmentFilter.value)
    .filter((definition) => !term || definition.id.toLowerCase().includes(term) || definition.displayName.toLowerCase().includes(term))
    .map((definition) => ({ definition, sample: sampleById.value.get(definition.id) ?? null }))
})

function formatValue(row: { definition: SignalDefinition; sample: SignalSample | null }): string {
  if (!row.sample) return '—'
  if (typeof row.sample.value === 'boolean') return row.sample.value ? 'true' : 'false'
  return String(row.sample.value)
}

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return '—'
  return timestamp.slice(11, 23)
}

function diagnosticLabel(reason: SignalCoverageReason): string {
  return reason === 'missing-writer' ? t('signals.missingWriter') : t('signals.unboundEquipment')
}
</script>

<style scoped>
.signal-inspector { display: grid; gap: .45rem; color: #dbe7ec; font: .72rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.inspector-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
.inspector-head h4 { margin: 0; color: #9de3f6; font-size: .8rem; }
.simulated { color: #ffd166; font-weight: 700; }
.filters { display: flex; flex-wrap: wrap; gap: .5rem; align-items: end; }
.filters label { display: grid; gap: .15rem; color: #8fb6c4; }
.filters select, .filters input { padding: .25rem .35rem; border: 1px solid #34758a; border-radius: .25rem; background: #10232d; color: #fff; font: inherit; }
.filters input { min-width: 9rem; }
.count { color: #7f9aa6; margin-left: auto; }
.diagnostics { border-left: 3px solid #ffd166; background: rgb(255 209 102 / 8%); padding: .35rem .5rem; }
.diagnostics strong { color: #ffd166; }
.diagnostics ul { margin: .25rem 0 0; padding-left: 1rem; }
.table-wrap { max-height: 18rem; overflow: auto; border: 1px solid #23485a; border-radius: .3rem; }
table { width: 100%; border-collapse: collapse; }
th { position: sticky; top: 0; background: #0d1f29; color: #8fb6c4; text-align: left; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: .3rem .4rem; }
td { padding: .28rem .4rem; border-top: 1px solid rgb(255 255 255 / 5%); vertical-align: top; }
.mono { white-space: nowrap; }
.signal-id { color: #e8f4f8; }
td small { display: block; color: #7f9aa6; }
.value { color: #fff; font-weight: 700; }
.timestamp { color: #8fb6c4; }
.quality { padding: .05rem .3rem; border: 1px solid currentColor; border-radius: 999px; font-size: .66rem; font-weight: 800; text-transform: uppercase; }
.quality-good { color: #68dfa8; }
.quality-stale, .quality-uncertain { color: #ffd166; }
.quality-bad, .quality-invalid { color: #ff8080; }
.quality-unknown { color: #7f9aa6; }
.empty { text-align: center; color: #7f9aa6; padding: .8rem; }
</style>
