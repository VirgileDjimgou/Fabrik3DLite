<template>
  <div class="row g-3">
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-play-circle-fill" :label="t('tiles.start')" @click="handleStart" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-arrow-repeat" :label="t('tiles.resume')" @click="handleResume" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-pause-circle" :label="t('tiles.pauseUnload')" @click="handlePause" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-clipboard-data" :label="t('tiles.currentJob')" to="/current-job" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-card-list" :label="t('tiles.jobList')" to="/jobs" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-plus-square" :label="t('tiles.newJob')" to="/new-job" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-robot" :label="t('tiles.robotPositions')" to="/robot-positions" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-grid-3x3-gap" :label="t('tiles.extras')" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-gear" :label="t('tiles.settings')" to="/settings" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import HmiTileButton from '@/components/controls/HmiTileButton.vue'
import * as api from '@/services/api'

const { t } = useI18n()

async function handleStart() {
  try {
    const jobs = await api.getJobs()
    const pending = jobs.find(j => j.status === 'Created' || j.status === 'Running' || j.status === 'Paused')
    if (pending) await api.startJob(pending.id)
    else alert('No job available to start. Create a new job first.')
  } catch (e) { console.warn('Start failed', e) }
}

async function handlePause() {
  try {
    const jobs = await api.getJobs()
    const running = jobs.find(j => j.status === 'Running')
    if (running) await api.pauseJob(running.id)
  } catch (e) { console.warn('Pause failed', e) }
}

async function handleResume() {
  try {
    const jobs = await api.getJobs()
    const paused = jobs.find(j => j.status === 'Paused')
    if (paused) await api.resumeJob(paused.id)
  } catch (e) { console.warn('Resume failed', e) }
}
</script>
