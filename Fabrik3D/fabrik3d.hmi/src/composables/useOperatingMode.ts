import { computed, ref } from 'vue'
export type OperatingMode = 'automatic' | 'manual-training' | 'setup' | 'maintenance' | 'offline-demo'
const mode = ref<OperatingMode>('offline-demo')
const allowed: Record<OperatingMode, readonly OperatingMode[]> = { automatic: ['manual-training', 'setup', 'offline-demo'], 'manual-training': ['automatic', 'setup', 'offline-demo'], setup: ['automatic', 'manual-training', 'maintenance', 'offline-demo'], maintenance: ['setup', 'offline-demo'], 'offline-demo': ['setup', 'manual-training'] }
export function useOperatingMode() { const canTransitionTo = (next: OperatingMode) => allowed[mode.value].includes(next); const transition = (next: OperatingMode) => { if (!canTransitionTo(next)) return false; mode.value = next; return true }; return { mode, canTransitionTo, transition, isManual: computed(() => mode.value === 'manual-training') } }
