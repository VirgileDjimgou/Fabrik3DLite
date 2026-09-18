<template>
  <div>
    <h5 class="mb-3"><i class="bi bi-exclamation-triangle hmi-icon me-2"></i>{{ t('alarms.title') }}</h5>
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item">
        <button class="nav-link" :class="{active: tab==='active'}" @click="tab='active'; loadActive()">
          {{ t('alarms.active') }}</button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{active: tab==='all'}" @click="tab='all'; loadAll()">
          {{ t('alarms.all') }}</button>
      </li>
    </ul>
    <div class="d-flex gap-2 mb-3"><label class="small">{{ t('alarms.source') }} <input v-model="sourceFilter" /></label><label class="small">{{ t('alarms.severity') }} <select v-model="severityFilter"><option value="">All</option><option>Warning</option><option>Error</option><option>Critical</option></select></label></div>
    <div v-if="filtered.length === 0" class="alert alert-secondary">{{ t('alarms.noAlarms') }}</div>
    <div class="table-responsive" v-else>
      <table class="table table-sm table-striped align-middle">
        <thead class="table-light">
          <tr>
            <th>{{ t('alarms.severity') }}</th><th>{{ t('jobs.name') }}</th>
            <th>{{ t('alarms.source') }}</th><th>{{ t('alarms.time') }}</th>
            <th>{{ t('alarms.acknowledged') }}</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in filtered" :key="a.id" @click="selected = a" style="cursor:pointer">
            <td><span class="badge" :class="sevBadge(a.severity)">{{ a.severity }}</span></td>
            <td><strong>{{ a.title }}</strong><div class="text-muted small">{{ a.message }}</div></td>
            <td class="small">{{ a.source }}</td>
            <td class="small">{{ fmtDate(a.createdAtUtc) }}</td>
            <td>
              <i v-if="a.acknowledged" class="bi bi-check-circle-fill text-success"></i>
              <i v-else class="bi bi-circle text-muted"></i>
            </td>
            <td>
              <button v-if="!a.acknowledged" class="btn btn-outline-success btn-sm"
                @click="doAck(a.id)">
                <i class="bi bi-check-lg me-1"></i>{{ t('alarms.acknowledge') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <aside v-if="selected" class="card mt-3"><div class="card-body"><h6>{{ selected.title }}</h6><p>{{ selected.message }}</p><dl class="row small"><dt class="col-4">Cause</dt><dd class="col-8">{{ selected.cause || '-' }}</dd><dt class="col-4">Consequence</dt><dd class="col-8">{{ selected.consequence || '-' }}</dd><dt class="col-4">Guidance</dt><dd class="col-8">{{ selected.operatorGuidance || '-' }}</dd><dt class="col-4">Lifecycle</dt><dd class="col-8">{{ selected.lifecycleState }}</dd></dl><button v-if="selected.lifecycleState === 'Active'" class="btn btn-outline-secondary btn-sm" @click="transition(selected.id, 'ReturnedToNormal')">Return to normal</button><button v-if="selected.lifecycleState !== 'Shelved' && selected.lifecycleState !== 'Closed'" class="btn btn-outline-secondary btn-sm ms-2" @click="transition(selected.id, 'Shelved')">Shelve for training</button><ul class="small mt-2"><li v-for="entry in selected.auditTrail" :key="(entry.atUtc ?? '') + (entry.action ?? '')">{{ entry.action ?? '-' }} — {{ entry.by ?? '-' }} — {{ fmtDate(entry.atUtc ?? '') }}</li></ul></div></aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { AlarmDto } from '@/services/api'

const { t } = useI18n()
const tab = ref<'active'|'all'>('active')
const alarms = ref<AlarmDto[]>([])
const selected = ref<AlarmDto | null>(null)
const sourceFilter = ref('')
const severityFilter = ref('')
const filtered = computed(() => alarms.value.filter(a => (!sourceFilter.value || a.source.toLowerCase().includes(sourceFilter.value.toLowerCase())) && (!severityFilter.value || a.severity === severityFilter.value)).sort((a, b) => b.lastOccurredAtUtc.localeCompare(a.lastOccurredAtUtc)))

function sevBadge(s: string) {
  return s === 'Critical' ? 'bg-danger' : s === 'Warning' ? 'bg-warning text-dark'
    : s === 'Info' ? 'bg-info text-dark' : 'bg-secondary'
}
function fmtDate(iso: string) { try { return new Date(iso).toLocaleString() } catch { return iso } }

async function loadActive() { try { alarms.value = await api.getActiveAlarms() } catch { alarms.value = [] } }
async function loadAll() { try { alarms.value = await api.getAlarms() } catch { alarms.value = [] } }

async function doAck(id: string) {
  try { await api.acknowledgeAlarm(id); if (tab.value==='active') await loadActive(); else await loadAll() }
  catch (e) { console.warn('Ack failed', e) }
}
async function transition(id: string, state: string) { try { await api.transitionAlarm(id, state); await loadAll() } catch (e) { console.warn('Alarm transition failed', e) } }

function onEvent() { if (tab.value==='active') void loadActive(); else void loadAll() }

let unsub: (() => void) | null = null
onMounted(() => { void loadActive(); unsub = hub.subscribe({ onAlarmRaised: onEvent, onAlarmAcknowledged: onEvent }) })
onUnmounted(() => { unsub?.() })
</script>
