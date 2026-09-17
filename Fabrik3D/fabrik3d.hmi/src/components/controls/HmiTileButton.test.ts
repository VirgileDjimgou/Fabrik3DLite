import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HmiTileButton from './HmiTileButton.vue'

describe('HmiTileButton', () => {
  it('renders its industrial icon and emits the operator action', async () => {
    const wrapper = mount(HmiTileButton, {
      props: { icon: 'bi-play-circle', label: 'Start' },
    })

    expect(wrapper.text()).toContain('Start')
    expect(wrapper.find('i').classes()).toContain('bi-play-circle')

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
