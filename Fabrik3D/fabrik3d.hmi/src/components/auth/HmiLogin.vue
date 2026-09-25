<template>
  <main class="hmi-login" data-testid="hmi-login">
    <section class="hmi-login__card card" aria-labelledby="hmi-login-title">
      <div class="card-body">
        <h1 id="hmi-login-title" class="h5 mb-1">
          <i class="bi bi-person-lock hmi-icon me-2"></i>{{ t('auth.title') }}
        </h1>
        <p class="text-muted small">{{ t('auth.subtitle') }}</p>

        <div v-if="expired" class="alert alert-danger py-2 small" role="alert" data-testid="hmi-session-expired">
          <i class="bi bi-clock-history me-1"></i>{{ t('auth.sessionExpired') }}
        </div>

        <!-- Development/test mode is unmistakably labelled and never production security. -->
        <div
          v-if="config?.warning"
          class="alert alert-warning py-2 small"
          role="alert"
          data-testid="dev-auth-banner"
        >
          <i class="bi bi-exclamation-triangle me-1"></i>{{ config.warning }}
        </div>

        <form v-if="config?.developmentAuth" @submit.prevent="submit" class="vstack gap-3">
          <div>
            <label class="form-label fw-semibold" for="hmi-login-subject">{{ t('auth.subject') }}</label>
            <input
              id="hmi-login-subject"
              v-model="subject"
              type="text"
              class="form-control"
              autocomplete="username"
              :placeholder="t('auth.subjectPlaceholder')"
              required
            />
          </div>
          <div>
            <label class="form-label fw-semibold" for="hmi-login-role">{{ t('auth.role') }}</label>
            <select id="hmi-login-role" v-model="role" class="form-select" required>
              <option v-for="option in roleOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </div>
          <button type="submit" class="btn btn-hmi" :disabled="busy || !subject || !role" data-testid="hmi-login-submit">
            <i class="bi bi-box-arrow-in-right me-1"></i>{{ busy ? t('auth.signingIn') : t('auth.signIn') }}
          </button>
        </form>

        <template v-else>
          <p class="small" data-testid="oidc-hint">{{ t('auth.oidcHint') }}</p>
          <button type="button" class="btn btn-hmi" data-testid="hmi-login-retry" @click="retry">
            <i class="bi bi-arrow-repeat me-1"></i>{{ t('auth.retry') }}
          </button>
        </template>

        <p v-if="error" class="hmi-error mt-3" role="alert" data-testid="hmi-login-error">{{ error }}</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { bootstrap, devLogin, fetchAuthConfig } from '@/auth/authService'
import { identity, sessionExpired } from '@/auth/authStore'
import type { AuthConfig } from '@/auth/authTypes'

const { t } = useI18n()
const expired = sessionExpired
const config = ref<AuthConfig | null>(null)
const subject = ref('')
const role = ref('Operator')
const busy = ref(false)
const error = ref('')

const roleOptions = computed(() => {
  const roles = config.value?.roles ?? ['Operator']
  return config.value?.publicDemoEnabled ? [...roles, 'PublicDemo'] : roles
})

onMounted(async () => {
  try {
    config.value = await fetchAuthConfig()
    if (config.value.roles.length > 0 && !config.value.roles.includes(role.value)) {
      role.value = config.value.roles[0]
    }
  } catch {
    error.value = t('auth.configFailed')
  }
})

async function submit(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await devLogin(role.value, subject.value.trim() || undefined)
  } catch (err) {
    error.value = (err as { status?: number }).status === 401 || (err as { status?: number }).status === 403
      ? t('auth.signInDenied')
      : t('auth.signInFailed')
  } finally {
    busy.value = false
  }
}

async function retry(): Promise<void> {
  await bootstrap()
  if (!identity.value) error.value = t('auth.oidcRequired')
}
</script>

<style scoped>
.hmi-login { display: grid; place-items: center; min-height: 100vh; padding: 1rem; background: var(--hmi-bg); }
.hmi-login__card { max-width: 28rem; width: 100%; }
</style>
