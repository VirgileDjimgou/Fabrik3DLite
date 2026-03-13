<template>
  <div>
    <h5 class="mb-3"><i class="bi bi-plus-square hmi-icon me-2"></i>{{ t('newJob.title') }}</h5>
    <div class="card">
      <div class="card-body">
        <form @submit.prevent="submit">
          <div class="mb-3">
            <label class="form-label">{{ t('jobs.name') }}</label>
            <input v-model="form.name" type="text" class="form-control"
              :placeholder="t('newJob.namePlaceholder')" required />
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('jobs.description') }}</label>
            <textarea v-model="form.description" class="form-control" rows="3"
              :placeholder="t('newJob.descriptionPlaceholder')"></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('newJob.machineModeLabel') }}</label>
            <select v-model="form.machineMode" class="form-select">
              <option value="Automatic">Automatic</option>
              <option value="Manual">Manual</option>
              <option value="Setup">Setup</option>
            </select>
          </div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-hmi" :disabled="!form.name || submitting">
              <i class="bi bi-check-lg me-1"></i>{{ t('newJob.submit') }}</button>
            <router-link to="/jobs" class="btn btn-outline-secondary">
              <i class="bi bi-x-lg me-1"></i>{{ t('nav.back') }}</router-link>
          </div>
          <div v-if="successMsg" class="alert alert-success mt-3 mb-0">{{ successMsg }}</div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'

const { t } = useI18n()
const submitting = ref(false)
const successMsg = ref('')
const form = reactive({ name: '', description: '', machineMode: 'Automatic' })

async function submit() {
  submitting.value = true; successMsg.value = ''
  try {
    await api.createJob({ name: form.name, description: form.description || undefined, machineMode: form.machineMode })
    successMsg.value = t('newJob.success'); form.name = ''; form.description = ''
  } catch (e) { console.warn('Create failed', e) }
  finally { submitting.value = false }
}
</script>
