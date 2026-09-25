import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HmiAuthorityIndicator from './HmiAuthorityIndicator.vue'
import { i18n } from '@/i18n'
import type { ControlAuthorityDto } from '@/services/api'
import type { HandoverFeedback } from '@/composables/authorityView'

const authority = (overrides: Partial<ControlAuthorityDto> = {}): ControlAuthorityDto => ({
  scope: 'cell-1',
  mode: 'external-controller',
  state: 'held',
  ownerId: 'modbus',
  ownerKind: 'connector',
  acquiredAtUtc: null,
  leaseExpiresAtUtc: null,
  lastHeartbeatUtc: null,
  version: 1,
  degradedReason: null,
  correlationId: null,
  isPersisted: true,
  diagnostic: null,
  ...overrides,
})

interface IndicatorProps {
  authority: ControlAuthorityDto | null
  target?: string
  feedback?: HandoverFeedback
  feedbackMessage?: string | null
}

function mountIndicator(props: IndicatorProps) {
  return mount(HmiAuthorityIndicator, {
    props: { target: 'Cell 1', feedback: 'idle', feedbackMessage: null, ...props },
    global: { plugins: [i18n] },
  })
}

describe('HmiAuthorityIndicator', () => {
  it('continuously exposes the authority mode, state, owner and target as text', () => {
    const wrapper = mountIndicator({ authority: authority() })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.get('[data-testid="authority-target"]').text()).toBe('Cell 1')
    expect(wrapper.get('[data-testid="authority-owner"]').text()).toBe('modbus')
    expect(wrapper.text()).toContain('External controller')
    expect(wrapper.text()).toContain('Held')
  })

  it('enables release only while the authority is held', () => {
    const held = mountIndicator({ authority: authority() })
    const available = mountIndicator({ authority: authority({ state: 'available', ownerId: null }) })

    expect(held.get('[data-testid="authority-release"]').attributes('disabled')).toBeUndefined()
    expect(available.get('[data-testid="authority-release"]').attributes('disabled')).toBeDefined()
  })

  it('emits explicit handover actions naming the target context', async () => {
    const wrapper = mountIndicator({ authority: authority() })

    await wrapper.get('[data-testid="authority-acquire"]').trigger('click')
    await wrapper.get('[data-testid="authority-release"]').trigger('click')
    await wrapper.get('[data-testid="authority-takeover"]').trigger('click')

    expect(wrapper.emitted('acquire')).toHaveLength(1)
    expect(wrapper.emitted('release')).toHaveLength(1)
    expect(wrapper.emitted('takeover')).toHaveLength(1)
  })

  it('shows the documented degraded notice and failure feedback', () => {
    const wrapper = mountIndicator({
      authority: authority({ state: 'degraded', degradedReason: 'controller-heartbeat-lost' }),
      feedback: 'failure',
      feedbackMessage: 'authority_lost',
    })

    expect(wrapper.get('[data-testid="authority-degraded"]').text()).toContain('outputs de-energized')
    expect(wrapper.get('[data-testid="authority-feedback"]').text()).toContain('Handover rejected')
    expect(wrapper.get('[data-testid="authority-feedback"]').text()).toContain('authority_lost')
  })

  it('renders pending feedback for a handover in progress', () => {
    const wrapper = mountIndicator({ authority: authority(), feedback: 'pending' })
    expect(wrapper.get('[data-testid="authority-feedback"]').attributes('data-feedback')).toBe('pending')
    expect(wrapper.get('[data-testid="authority-feedback"]').text()).toContain('Handover pending')
  })
})
