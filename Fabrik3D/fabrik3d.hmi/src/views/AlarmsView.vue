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
    <div v-if="alarms.length === 0" class="alert alert-secondary">{{ t('alarms.noAlarms') }}</div>
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
          <tr v-for="a in alarms" :key="a.id">
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { AlarmDto } from '@/services/api'

const { t } = useI18n()
const tab = ref<'active'|'all'>('active')
const alarms = ref<AlarmDto[]>([])

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

function onEvent() { if (tab.value==='active') void loadActive(); else void loadAll() }

let unsub: (() => void) | null = null
onMounted(() => { void loadActive(); unsub = hub.subscribe({ onAlarmRaised: onEvent, onAlarmAcknowledged: onEvent }) })
onUnmounted(() => { unsub?.() })
</script>
