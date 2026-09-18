<template><section class="hmi-error" role="alert"><i class="bi bi-exclamation-octagon"></i><strong>{{ title }}</strong><span>{{ detail }}</span></section></template>
<script setup lang="ts">
defineProps<{ title: string; detail: string }>()
</script>
