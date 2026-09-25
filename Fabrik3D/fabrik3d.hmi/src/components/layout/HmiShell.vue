<template>
  <!-- Frontends never decide authorization; the login surface only reflects server responses. -->
  <HmiLogin v-if="!isAuthenticated()" />
  <HmiWorkspace v-else />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import HmiLogin from '@/components/auth/HmiLogin.vue'
import HmiWorkspace from './HmiWorkspace.vue'
import { bootstrap } from '@/auth/authService'
import { isAuthenticated } from '@/auth/authStore'

onMounted(() => { void bootstrap() })
</script>
