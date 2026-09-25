import { ref } from 'vue'
import * as api from '@/services/api'
import * as hub from '@/services/hub'
import type { ControlAuthorityDto } from '@/services/api'
import { authorityFromEvent, type HandoverFeedback } from './authorityView'

/**
 * Continuously visible control authority for the operator surface (S36). REST is the initial
 * load; the hub event is the live source. Handover actions report pending/success/failure.
 */
const scope = ref('cell-1')
const authority = ref<ControlAuthorityDto | null>(null)
const feedback = ref<HandoverFeedback>('idle')
const feedbackMessage = ref<string | null>(null)

let initialized = false
let unsubscribe: (() => void) | null = null

function failureMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'request_failed')
  }
  return 'request_failed'
}

async function run(action: () => Promise<ControlAuthorityDto>): Promise<void> {
  feedback.value = 'pending'
  feedbackMessage.value = null
  try {
    authority.value = await action()
    feedback.value = 'success'
  } catch (error) {
    feedback.value = 'failure'
    feedbackMessage.value = failureMessage(error)
  }
}

async function refresh(): Promise<void> {
  try {
    authority.value = await api.getControlAuthority(scope.value)
  } catch {
    // Offline: keep the last known authority rather than inventing one.
  }
}

function init(): void {
  if (initialized) return
  initialized = true
  unsubscribe = hub.subscribe({
    onControlAuthorityChanged: (event) => {
      if (event.scope !== scope.value) return
      authority.value = authorityFromEvent(event, authority.value)
    },
  })
  void refresh()
}

export function useControlAuthority() {
  init()

  return {
    scope,
    authority,
    feedback,
    feedbackMessage,
    refresh,
    setScope: (next: string) => {
      scope.value = next
      void refresh()
    },
    acquire: (ownerId: string, ownerKind: 'simulator' | 'connector' = 'simulator') =>
      run(() => api.acquireControlAuthority(scope.value, { mode: 'ExternalController', ownerId, ownerKind, leaseSeconds: 60 })),
    release: (ownerId: string) =>
      run(() => api.releaseControlAuthority(scope.value, { ownerId })),
    takeover: (ownerId: string, ownerKind: 'simulator' | 'connector' = 'connector') =>
      run(() => api.takeoverControlAuthority(scope.value, { mode: 'ExternalController', ownerId, ownerKind, confirm: true })),
    stop: () => {
      unsubscribe?.()
      unsubscribe = null
      initialized = false
    },
  }
}
