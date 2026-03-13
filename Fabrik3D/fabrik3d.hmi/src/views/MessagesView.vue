<template>
  <div>
    <h5 class="mb-3"><i class="bi bi-chat-dots hmi-icon me-2"></i>{{ t('messages.title') }}</h5>
    <div v-if="messages.length === 0" class="alert alert-secondary">{{ t('messages.noMessages') }}</div>
    <div v-else class="d-flex flex-column gap-2">
      <div v-for="msg in messages" :key="msg.id" class="card">
        <div class="card-body py-2 px-3">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <strong>{{ msg.title }}</strong>
              <span class="badge bg-light text-dark ms-2 small">{{ msg.type }}</span>
            </div>
            <small class="text-muted">{{ fmtDate(msg.createdAtUtc) }}</small>
          </div>
          <p class="mb-0 small mt-1">{{ msg.message }}</p>
          <small class="text-muted">{{ msg.source }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { OperatorMessageDto } from '@/services/api'

const { t } = useI18n()
const messages = ref<OperatorMessageDto[]>([])
function fmtDate(iso: string) { try { return new Date(iso).toLocaleString() } catch { return iso } }
async function load() { try { messages.value = await api.getMessages() } catch { messages.value = [] } }

let unsub: (() => void) | null = null
onMounted(() => { void load(); unsub = hub.subscribe({ onOperatorMessage: () => { void load() } }) })
onUnmounted(() => { unsub?.() })
</script>
