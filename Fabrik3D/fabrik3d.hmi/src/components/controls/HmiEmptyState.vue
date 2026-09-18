<template><section class="hmi-empty" role="status"><i class="bi bi-inbox"></i><h2>{{ title }}</h2><p>{{ detail }}</p><slot /></section></template>
<script setup lang="ts">
defineProps<{ title: string; detail: string }>()
</script>
