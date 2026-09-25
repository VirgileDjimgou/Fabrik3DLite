<template>
  <div class="auth-bar" data-simulator-auth>
    <template v-if="authenticated">
      <span class="auth-bar__identity" data-auth-identity>
        <i class="bi bi-person-check"></i>
        {{ identity?.name ?? identity?.subject }} · {{ role }}
      </span>
      <button type="button" class="reset-panels" data-auth-logout @click="signOut">{{ t('auth.signOut') }}</button>
    </template>
    <template v-else-if="open">
      <span class="auth-bar__warning" data-auth-warning>{{ config?.warning ?? t('auth.localDemo') }}</span>
      <input v-model="subject" class="auth-bar__input" :placeholder="t('auth.subject')" data-auth-subject />
      <select v-model="role" class="auth-bar__input" data-auth-role>
        <option v-for="option in roleOptions" :key="option" :value="option">{{ option }}</option>
      </select>
      <button type="button" class="reset-panels" data-auth-submit :disabled="busy" @click="submit">{{ t('auth.signIn') }}</button>
      <button type="button" class="reset-panels" data-auth-cancel @click="open = false">{{ t('auth.cancel') }}</button>
    </template>
    <template v-else>
      <span class="auth-bar__warning" data-auth-local>{{ expired ? t('auth.expired') : t('auth.localDemo') }}</span>
      <button type="button" class="reset-panels" data-auth-open @click="open = true">{{ t('auth.signIn') }}</button>
    </template>
    <span v-if="error" class="auth-bar__error" data-auth-error>{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSimulatorI18n } from '@/i18n/simulator'
import { bootstrap, devLogin, fetchAuthConfig, logout } from '@/auth/authService'
import { identity, isAuthenticated, sessionExpired } from '@/auth/authStore'
import type { AuthConfig } from '@/auth/authTypes'

const { t } = useSimulatorI18n()
const config = ref<AuthConfig | null>(null)
const open = ref(false)
const subject = ref('')
const role = ref('Operator')
const busy = ref(false)
const error = ref('')

const authenticated = computed(() => isAuthenticated())
const expired = sessionExpired
const roleOptions = computed(() => {
  const roles = config.value?.roles ?? ['Operator']
  return config.value?.publicDemoEnabled ? [...roles, 'PublicDemo'] : roles
})

onMounted(async () => {
  await bootstrap()
  try {
    config.value = await fetchAuthConfig()
    if (config.value.roles.length > 0 && !config.value.roles.includes(role.value)) {
      role.value = config.value.roles[0]!
    }
  } catch {
    // Offline local demo: stay usable, clearly labelled, without a server identity.
  }
})

async function submit(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await devLogin(role.value, subject.value.trim() || undefined)
    open.value = false
  } catch {
    error.value = t('auth.failed')
  } finally {
    busy.value = false
  }
}

function signOut(): void {
  logout()
}
</script>

<style scoped>
.auth-bar { display: flex; align-items: center; gap: 0.35rem; padding: 0 0.25rem; }
.auth-bar__identity { color: #9fc4d2; font: inherit; }
.auth-bar__warning { color: #e0b341; font: inherit; max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.auth-bar__error { color: #ff8080; font: inherit; }
.auth-bar__input { border: 1px solid #34758a; border-radius: 0.25rem; background: #10232d; color: #fff; padding: 0.2rem 0.3rem; font: inherit; }
</style>
