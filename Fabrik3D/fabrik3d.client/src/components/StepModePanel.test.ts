import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StepModePanel from './StepModePanel.vue'
import { CHECKPOINTS } from '../learning/StepModeController'

describe('StepModePanel', () => {
  it('exposes accessible learning controls and emits a single step request', async () => {
    const wrapper = mount(StepModePanel, { props: { active: true, checkpoint: CHECKPOINTS.MOVE_ABOVE_PALLET_SLOT!, speed: 1 } })
    expect(wrapper.find('[aria-label="Simulation learning controls"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Approach pallet')
    await wrapper.get('button:nth-of-type(2)').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
  })
})
