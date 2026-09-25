<template>
  <div class="d-flex flex-column vh-100">
    <!-- Version bar -->
    <div class="hmi-version d-flex justify-content-between align-items-center bg-white border-bottom">
      <span>Fabrik3D HMI v1.0.0</span>
      <span class="hmi-mode" aria-label="Active operating mode">{{ mode }}</span>
      <div class="d-flex align-items-center gap-2">
        <span class="hmi-user small" data-testid="hmi-user">
          <i class="bi bi-person-circle me-1"></i>{{ userLabel }}
        </span>
        <button type="button" class="btn btn-outline-secondary btn-sm py-0" data-testid="hmi-logout" @click="signOut">
          <i class="bi bi-box-arrow-right me-1"></i>{{ t('auth.logout') }}
        </button>
        <HmiConnectionBadge :connectionState="connectionState" />
      </div>
    </div>

    <!-- Continuously visible machine-control authority (S36) -->
    <HmiAuthorityIndicator
      class="hmi-authority-bar border-bottom bg-white px-2 py-1"
      :authority="authority"
      :target="authority?.scope ?? scope"
      :feedback="feedback"
      :feedbackMessage="feedbackMessage"
      :can-takeover="canEngineer()"
      @acquire="acquireFromOperator"
      @release="releaseFromOwner"
      @takeover="takeoverFromOperator"
    />

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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HmiBottomNav from './HmiBottomNav.vue'
import HmiConnectionBadge from './HmiConnectionBadge.vue'
import HmiStatusPanel from '@/components/dashboard/HmiStatusPanel.vue'
import HmiAuthorityIndicator from '@/components/controls/HmiAuthorityIndicator.vue'
import { useMachineState } from '@/composables/useMachineState'
import { useOperatingMode } from '@/composables/useOperatingMode'
import { useControlAuthority } from '@/composables/useControlAuthority'
import { canEngineer, identity } from '@/auth/authStore'
import { logout } from '@/auth/authService'

const { t } = useI18n()
const { machine, currentJob, session, connectionState } = useMachineState()
const { mode } = useOperatingMode()

// The authenticated subject is the operator identity. Authority remains fail-closed server side:
// an unhealthy/unknown connector owner is refused and a takeover requires confirmation + Engineer.
const operatorOwnerId = computed(() => identity.value?.subject ?? 'hmi-operator')
const userLabel = computed(() => {
  const current = identity.value
  if (!current) return ''
  const role = current.roles[0] ?? 'Operator'
  return `${current.name ?? current.subject} · ${role}`
})

const { authority, feedback, feedbackMessage, scope, acquire, release, takeover } = useControlAuthority()

const acquireFromOperator = () => void acquire(operatorOwnerId.value, 'simulator')
const takeoverFromOperator = () => void takeover(operatorOwnerId.value, 'simulator')
const releaseFromOwner = () => {
  if (authority.value?.ownerId) void release(authority.value.ownerId)
}

function signOut(): void {
  logout()
  window.location.reload()
}
</script>
