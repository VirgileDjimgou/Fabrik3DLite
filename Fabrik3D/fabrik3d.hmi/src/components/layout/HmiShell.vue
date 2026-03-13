<template>
  <div class="d-flex flex-column vh-100">
    <!-- Version bar -->
    <div class="hmi-version d-flex justify-content-between align-items-center bg-white border-bottom">
      <span>Fabrik3D HMI v1.0.0</span>
      <HmiConnectionBadge :connectionState="connectionState" />
    </div>

    <!-- Main area: content + sidebar -->
    <div class="flex-grow-1 overflow-hidden">
      <div class="container-fluid h-100 p-0">
        <div class="row g-0 h-100">
          <div class="col-lg-9 col-md-8 hmi-content">
            <router-view />
          </div>
          <div class="col-lg-3 col-md-4 hmi-status-panel">
            <HmiStatusPanel :machine="machine" :session="session" :currentJob="currentJob" />
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom nav -->
    <HmiBottomNav />
  </div>
</template>

<script setup lang="ts">
import HmiBottomNav from './HmiBottomNav.vue'
import HmiConnectionBadge from './HmiConnectionBadge.vue'
import HmiStatusPanel from '@/components/dashboard/HmiStatusPanel.vue'
import { useMachineState } from '@/composables/useMachineState'

const { machine, currentJob, session, connectionState } = useMachineState()
</script>
