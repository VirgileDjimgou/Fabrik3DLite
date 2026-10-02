<template>
  <div data-testid="alarms-view">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="hmi-page-title"><i class="bi bi-exclamation-triangle hmi-icon me-2"></i>{{ t('alarms.title') }}</h5>
      <span class="hmi-detail" data-testid="alarms-count">{{ filtered.length }} {{ t('alarms.count') }}</span>
    </div>

    <!-- Severity summary: the operator reads the worst active state first. -->
    <section class="hmi-status-strip mb-3" :class="summaryStripClass" data-testid="alarms-summary">
      <div class="hmi-metric">
        <span class="hmi-label">{{ t('alarms.critical') }}</span>
        <span class="hmi-value hmi-value--primary" data-testid="alarms-critical-count">{{ severityCounts.Critical }}</span>
      </div>
      <div class="hmi-metric">
        <span class="hmi-label">{{ t('alarms.warning') }}</span>
        <span class="hmi-value" data-testid="alarms-warning-count">{{ severityCounts.Warning }}</span>
      </div>
      <div class="hmi-metric">
        <span class="hmi-label">{{ t('alarms.unacknowledged') }}</span>
        <span class="hmi-value" data-testid="alarms-unack-count">{{ unacknowledgedCount }}</span>
      </div>
    </section>

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

    <div class="d-flex flex-wrap gap-3 mb-3">
      <label class="hmi-detail">{{ t('alarms.source') }}
        <input v-model="sourceFilter" class="form-control form-control-sm" data-testid="alarms-source-filter" /></label>
      <label class="hmi-detail">{{ t('alarms.severity') }}
        <select v-model="severityFilter" class="form-select form-select-sm" data-testid="alarms-severity-filter">
          <option value="">{{ t('alarms.allSeverities') }}</option>
          <option>Warning</option><option>Error</option><option>Critical</option>
        </select></label>
    </div>

    <div v-if="filtered.length === 0" class="alert alert-secondary" data-testid="alarms-empty">{{ t('alarms.noAlarms') }}</div>
    <div class="table-responsive" v-else>
      <table class="table table-sm table-striped align-middle">
        <thead class="table-light">
          <tr>
            <th>{{ t('alarms.time') }}</th>
            <th>{{ t('alarms.severity') }}</th>
            <th>{{ t('alarms.source') }}</th>
            <th>{{ t('alarms.code') }}</th>
            <th>{{ t('alarms.message') }}</th>
            <th>{{ t('alarms.state') }}</th>
            <th>{{ t('alarms.acknowledged') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in filtered" :key="a.id" @click="selected = a" style="cursor:pointer" :data-testid="`alarm-row-${a.id}`">
            <td class="hmi-detail hmi-mono">{{ fmtDate(a.lastOccurredAtUtc ?? a.createdAtUtc ?? '') }}</td>
            <td><span class="badge" :class="sevBadge(a.severity ?? '')">{{ a.severity }}</span></td>
            <td class="hmi-detail hmi-truncate">{{ a.source }}</td>
            <td class="hmi-mono hmi-detail">{{ a.code ?? '-' }}</td>
            <td>
              <strong class="hmi-truncate">{{ a.title }}</strong>
              <div class="hmi-detail hmi-truncate">{{ a.message }}</div>
            </td>
            <td class="hmi-detail">{{ a.lifecycleState ?? '-' }}</td>
            <td>
              <i v-if="a.acknowledged" class="bi bi-check-circle-fill text-success" :aria-label="t('alarms.acknowledged')"></i>
              <i v-else class="bi bi-circle text-muted" :aria-label="t('alarms.unacknowledged')"></i>
            </td>
            <td>
              <button v-if="!a.acknowledged" class="btn btn-outline-success btn-sm"
                :data-testid="`alarm-ack-${a.id}`" @click.stop="doAck(a.id)">
                <i class="bi bi-check-lg me-1"></i>{{ t('alarms.acknowledge') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <aside v-if="selected" class="hmi-card mt-3" data-testid="alarm-detail">
      <div class="hmi-card__header">
        <span class="hmi-truncate">{{ selected.title }}</span>
        <span class="badge" :class="sevBadge(selected.severity ?? '')">{{ selected.severity }}</span>
      </div>
      <div class="hmi-card__body">
        <p class="hmi-detail">{{ selected.message }}</p>
        <dl class="row small mb-2">
          <dt class="col-4">{{ t('alarms.code') }}</dt><dd class="col-8 hmi-mono">{{ selected.code ?? '-' }}</dd>
          <dt class="col-4">{{ t('alarms.source') }}</dt><dd class="col-8">{{ selected.source }}</dd>
          <dt class="col-4">{{ t('alarms.cause') }}</dt><dd class="col-8">{{ selected.cause || '-' }}</dd>
          <dt class="col-4">{{ t('alarms.consequence') }}</dt><dd class="col-8">{{ selected.consequence || '-' }}</dd>
          <dt class="col-4">{{ t('alarms.guidance') }}</dt><dd class="col-8">{{ selected.operatorGuidance || '-' }}</dd>
          <dt class="col-4">{{ t('alarms.state') }}</dt><dd class="col-8">{{ selected.lifecycleState }}</dd>
        </dl>
        <button v-if="selected.lifecycleState === 'Active'" class="btn btn-outline-secondary btn-sm" @click="transition(selected.id, 'ReturnedToNormal')">{{ t('alarms.returnToNormal') }}</button>
        <button v-if="selected.lifecycleState !== 'Shelved' && selected.lifecycleState !== 'Closed'" class="btn btn-outline-secondary btn-sm ms-2" @click="transition(selected.id, 'Shelved')">{{ t('alarms.shelve') }}</button>
        <ul class="small mt-2 mb-0">
          <li v-for="entry in selected.auditTrail" :key="(entry.atUtc ?? '') + (entry.action ?? '')">
            {{ entry.action ?? '-' }} — {{ entry.by ?? '-' }} — {{ fmtDate(entry.atUtc ?? '') }}</li>
        </ul>
      </div>
    </aside>
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
const filtered = computed(() => alarms.value.filter(a => (!sourceFilter.value || (a.source ?? '').toLowerCase().includes(sourceFilter.value.toLowerCase())) && (!severityFilter.value || a.severity === severityFilter.value)).sort((a, b) => (b.lastOccurredAtUtc ?? '').localeCompare(a.lastOccurredAtUtc ?? '')))

const severityCounts = computed(() => ({
  Critical: filtered.value.filter(a => a.severity === 'Critical').length,
  Warning: filtered.value.filter(a => a.severity === 'Warning').length,
}))
const unacknowledgedCount = computed(() => filtered.value.filter(a => !a.acknowledged).length)
const summaryStripClass = computed(() => severityCounts.value.Critical > 0 ? 'hmi-status-strip--fault'
  : severityCounts.value.Warning > 0 ? 'hmi-status-strip--warning' : '')

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
