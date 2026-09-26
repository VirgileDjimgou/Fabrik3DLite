<template>
  <table v-if="rows.length > 0" class="table table-sm mb-0" :data-testid="testId">
    <thead>
      <tr>
        <th scope="col">{{ keyLabel }}</th>
        <th scope="col" class="text-end">{{ countLabel }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.key">
        <td>{{ row.key }}</td>
        <td class="text-end">{{ row.count }}</td>
      </tr>
    </tbody>
  </table>
  <p v-else class="text-muted small mb-0" :data-testid="`${testId}-empty`">{{ emptyLabel }}</p>
</template>

<script setup lang="ts">
import type { RankingRow } from '@/instructor/instructorView'

defineProps<{
  rows: RankingRow[]
  testId: string
  emptyLabel: string
  keyLabel: string
  countLabel: string
}>()
</script>
