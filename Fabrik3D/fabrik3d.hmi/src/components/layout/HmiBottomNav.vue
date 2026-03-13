<template>
  <nav class="hmi-bottom-nav">
    <button @click="$router.back()">
      <i class="bi bi-chevron-left"></i><span>{{ t('nav.back') }}</span>
    </button>
    <router-link to="/">
      <i class="bi bi-house-fill"></i><span>{{ t('nav.home') }}</span>
    </router-link>
    <router-link to="/new-job">
      <i class="bi bi-plus-circle"></i><span>{{ t('nav.new') }}</span>
    </router-link>
    <router-link to="/jobs">
      <i class="bi bi-pencil-square"></i><span>{{ t('nav.edit') }}</span>
    </router-link>
    <button disabled>
      <i class="bi bi-trash3"></i><span>{{ t('nav.delete') }}</span>
    </button>
    <router-link to="/current-job">
      <i class="bi bi-clipboard-data"></i><span>{{ t('nav.job') }}</span>
    </router-link>
    <router-link to="/messages">
      <i class="bi bi-chat-dots"></i><span>{{ t('nav.messages') }}</span>
    </router-link>
    <router-link to="/alarms">
      <i class="bi bi-check-circle"></i><span>{{ t('nav.confirm') }}</span>
    </router-link>
    <button disabled>
      <i class="bi bi-chevron-right"></i><span>{{ t('nav.next') }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
