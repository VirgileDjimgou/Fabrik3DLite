<template>
  <section class="fault-lab" data-fault-lab aria-label="Instructor fault lab">
    <header class="lab-head">
      <h4>{{ t('faultLab.title') }}</h4>
      <span class="simulated">{{ t('faultLab.simulated') }}</span>
    </header>
    <p class="subtitle">{{ t('faultLab.subtitle') }}</p>

    <p v-if="authorityBlocked" class="blocked" role="alert" data-fault-lab-blocked>
      {{ t('faultLab.blocked') }}
    </p>

    <form class="controls" @submit.prevent="activate">
      <label>
        <span>{{ t('faultLab.fault') }}</span>
        <select v-model="selectedType" data-fault-lab-type>
          <option v-for="definition in OVERLAY_FAULT_CATALOG" :key="definition.type" :value="definition.type">
            {{ definition.title[locale] }} ({{ definition.layer }})
          </option>
        </select>
      </label>
      <label>
        <span>{{ t('faultLab.equipment') }}</span>
        <select v-model="selectedEquipment" data-fault-lab-equipment @change="onEquipmentChange">
          <option v-for="target in targets" :key="target.equipmentId" :value="target.equipmentId">{{ target.label }}</option>
        </select>
      </label>
      <label v-if="layer === 'signal'">
        <span>{{ t('faultLab.signal') }}</span>
        <select v-model="selectedSignal" data-fault-lab-signal>
          <option v-for="signal in signalOptions" :key="signal" :value="signal">{{ signal }}</option>
        </select>
      </label>
      <button type="submit" data-fault-lab-activate :disabled="authorityBlocked">{{ t('faultLab.activate') }}</button>
      <span v-if="feedback" class="feedback" :class="`feedback-${feedbackTone}`" data-fault-lab-feedback>{{ feedback }}</span>
    </form>

    <p class="target" data-fault-lab-target>
      {{ t('faultLab.target') }}: <strong>{{ layer === 'signal' ? selectedSignal : selectedEquipment }}</strong>
    </p>

    <table>
      <thead>
        <tr>
          <th>{{ t('faultLab.activeFault') }}</th>
          <th>{{ t('faultLab.severity') }}</th>
          <th>{{ t('faultLab.source') }}</th>
          <th>{{ t('faultLab.since') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="overlay in activeOverlays" :key="overlay.id" :data-fault-lab-row="overlay.id">
          <td class="mono">
            {{ overlay.type }} · {{ overlay.signalIds.length ? overlay.signalIds.join(', ') : overlay.equipmentId }}
          </td>
          <td><span class="severity" :class="`severity-${overlay.severity}`">{{ overlay.severity }}</span></td>
          <td class="mono">{{ overlay.source }}</td>
          <td class="mono">{{ overlay.startedAt.slice(11, 19) }}</td>
          <td>
            <button
              type="button"
              class="clear"
              :data-fault-lab-clear="overlay.id"
              @click="$emit('deactivate', overlay.id)"
            >{{ t('faultLab.clear') }}</button>
          </td>
        </tr>
        <tr v-if="activeOverlays.length === 0">
          <td colspan="5" class="empty" data-fault-lab-empty>{{ t('faultLab.noFaults') }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { OVERLAY_FAULT_CATALOG } from '../faults/overlayCatalog'
import type { FaultOverlay, OverlayFaultType } from '../faults/types'
import type { FaultLabTarget } from '../faults/faultTargets'
import { useSimulatorI18n } from '../i18n/simulator'

const props = defineProps<{
  targets: readonly FaultLabTarget[]
  activeOverlays: readonly FaultOverlay[]
  authorityBlocked?: boolean
  feedback?: string
  feedbackTone?: 'ok' | 'bad'
}>()

const emit = defineEmits<{
  activate: [type: OverlayFaultType, equipmentId: string, signalId: string]
  deactivate: [id: string]
}>()

const { t, locale } = useSimulatorI18n()
const selectedType = ref<OverlayFaultType>(OVERLAY_FAULT_CATALOG[0]!.type)
const selectedEquipment = ref<string>(props.targets[0]?.equipmentId ?? '')
const selectedSignal = ref<string>(props.targets[0]?.signals[0] ?? '')

const layer = computed(() => OVERLAY_FAULT_CATALOG.find((definition) => definition.type === selectedType.value)?.layer ?? 'signal')
const signalOptions = computed(() => props.targets.find((target) => target.equipmentId === selectedEquipment.value)?.signals ?? [])

function onEquipmentChange(): void {
  selectedSignal.value = signalOptions.value[0] ?? ''
}

function activate(): void {
  emit('activate', selectedType.value, selectedEquipment.value, selectedSignal.value)
}
</script>

<style scoped>
.fault-lab { display: grid; gap: .45rem; color: #dbe7ec; font: .72rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.lab-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
.lab-head h4 { margin: 0; color: #9de3f6; font-size: .85rem; }
.subtitle { margin: 0; color: #8fb6c4; }
.simulated { color: #ffd166; font-weight: 700; }
.blocked { border-left: 3px solid #ff8080; background: rgb(255 128 128 / 10%); padding: .35rem .5rem; color: #ffb3b3; }
.controls { display: flex; flex-wrap: wrap; gap: .5rem; align-items: end; }
.controls label { display: grid; gap: .1rem; color: #8fb6c4; }
.controls select { padding: .22rem .3rem; border: 1px solid #34758a; border-radius: .25rem; background: #10232d; color: #fff; font: inherit; }
.controls button { padding: .25rem .5rem; border: 1px solid #00cc88; border-radius: .25rem; background: #10232d; color: #68dfa8; cursor: pointer; font: inherit; }
.controls button:disabled { opacity: .45; cursor: not-allowed; }
.feedback-ok { color: #68dfa8; }
.feedback-bad { color: #ff8080; }
.target { margin: 0; color: #8fb6c4; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; color: #8fb6c4; text-transform: uppercase; letter-spacing: .04em; padding: .25rem .35rem; }
td { padding: .25rem .35rem; border-top: 1px solid rgb(255 255 255 / 5%); }
.mono { white-space: nowrap; }
.severity { padding: .05rem .3rem; border: 1px solid currentColor; border-radius: 999px; font-size: .66rem; font-weight: 800; text-transform: uppercase; }
.severity-warning { color: #ffd166; }
.severity-error { color: #ffb347; }
.severity-critical { color: #ff8080; }
.clear { border: 1px solid #34758a; border-radius: .25rem; background: transparent; color: #b9eaff; cursor: pointer; font: inherit; }
.empty { color: #7f9aa6; text-align: center; padding: .6rem; }
</style>
