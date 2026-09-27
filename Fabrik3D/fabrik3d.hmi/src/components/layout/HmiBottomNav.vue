<template>
  <nav class="hmi-bottom-nav" :aria-label="t('nav.label')">
    <button type="button" @click="$router.back()">
      <i class="bi bi-chevron-left" aria-hidden="true"></i><span>{{ t('nav.back') }}</span>
    </button>
    <router-link to="/">
      <i class="bi bi-house-fill" aria-hidden="true"></i><span>{{ t('nav.home') }}</span>
    </router-link>
    <router-link to="/new-job">
      <i class="bi bi-plus-circle" aria-hidden="true"></i><span>{{ t('nav.new') }}</span>
    </router-link>
    <router-link to="/jobs">
      <i class="bi bi-pencil-square" aria-hidden="true"></i><span>{{ t('nav.edit') }}</span>
    </router-link>
    <button type="button" disabled>
      <i class="bi bi-trash3" aria-hidden="true"></i><span>{{ t('nav.delete') }}</span>
    </button>
    <router-link to="/current-job">
      <i class="bi bi-clipboard-data" aria-hidden="true"></i><span>{{ t('nav.job') }}</span>
    </router-link>
    <router-link to="/messages">
      <i class="bi bi-chat-dots" aria-hidden="true"></i><span>{{ t('nav.messages') }}</span>
    </router-link>
    <router-link to="/alarms">
      <i class="bi bi-check-circle" aria-hidden="true"></i><span>{{ t('nav.confirm') }}</span>
    </router-link>
    <button type="button" disabled>
      <i class="bi bi-chevron-right" aria-hidden="true"></i><span>{{ t('nav.next') }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
