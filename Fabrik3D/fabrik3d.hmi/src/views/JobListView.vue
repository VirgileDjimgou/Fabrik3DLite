<template>
  <div>
    <h5 class="mb-3"><i class="bi bi-card-list hmi-icon me-2"></i>{{ t('jobs.title') }}</h5>
    <div v-if="jobs.length === 0" class="alert alert-secondary">{{ t('jobs.noJobs') }}</div>
    <div class="table-responsive" v-else>
      <table class="table table-hover table-striped align-middle">
        <thead class="table-light">
          <tr>
            <th>{{ t('jobs.name') }}</th><th>{{ t('jobs.status') }}</th>
            <th>{{ t('jobs.mode') }}</th><th>{{ t('jobs.progressPercent') }}</th>
            <th>{{ t('jobs.created') }}</th><th>{{ t('jobs.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.id">
            <td><strong>{{ j.name }}</strong><div class="text-muted small">{{ j.description }}</div></td>
            <td><span class="badge" :class="statusBadge(j.status)">{{ j.status }}</span></td>
            <td>{{ j.machineMode }}</td>
            <td>
              <div class="progress" style="min-width:80px;height:8px">
                <div class="progress-bar" role="progressbar"
                  :style="{width:j.progressPercent+'%',backgroundColor:'var(--hmi-icon-color)'}"></div>
              </div>
              <span class="small">{{ j.progressPercent }}%</span>
            </td>
            <td class="small">{{ fmtDate(j.createdAtUtc) }}</td>
            <td>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary btn-sm" @click="doStart(j)"
                  :disabled="j.status==='Running'" :title="t('tiles.start')">
                  <i class="bi bi-play-fill"></i></button>
                <button class="btn btn-outline-danger btn-sm" @click="doDelete(j)"
                  :title="t('nav.delete')">
                  <i class="bi bi-trash3"></i></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'
import type { JobDto } from '@/services/api'

const { t } = useI18n()
const jobs = ref<JobDto[]>([])

async function load() { try { jobs.value = await api.getJobs() } catch { jobs.value = [] } }

function statusBadge(s: string) {
  return s === 'Running' ? 'bg-success' : s === 'Paused' ? 'bg-warning text-dark'
    : s === 'Stopped' ? 'bg-danger' : s === 'Completed' ? 'bg-info' : 'bg-secondary'
}

function fmtDate(iso: string) { try { return new Date(iso).toLocaleString() } catch { return iso } }

async function doStart(j: JobDto) {
  try { await api.startJob(j.id); await load() } catch (e) { console.warn('Start failed', e) }
}
async function doDelete(j: JobDto) {
  if (!confirm(t('jobs.deleteConfirm'))) return
  try { await api.deleteJob(j.id); await load() } catch (e) { console.warn('Delete failed', e) }
}

onMounted(load)
</script>
