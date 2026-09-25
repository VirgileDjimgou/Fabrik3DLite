<template>
  <div class="row g-3">
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-play-circle" :label="t('tiles.selectJobToStart')" to="/jobs" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-arrow-repeat" :label="t('tiles.currentJob')" to="/current-job" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-pause-circle" :label="t('tiles.currentJob')" to="/current-job" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-clipboard-data" :label="t('tiles.currentJob')" to="/current-job" />
    </div>
    <div class="col-lg-4 col-md-6 col-sm-6">
      <HmiTileButton icon="bi-card-list" :label="t('tiles.jobList')" to="/jobs" />
    </div>
    <div v-if="operator" class="col-lg-4 col-md-6 col-sm-6">
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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HmiTileButton from '@/components/controls/HmiTileButton.vue'
import { canOperate } from '@/auth/authStore'

const { t } = useI18n()
const operator = computed(() => canOperate())

</script>
