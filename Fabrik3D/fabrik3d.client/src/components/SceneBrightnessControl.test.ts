import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SceneBrightnessControl from './SceneBrightnessControl.vue'
import { ambientBrightness, setAmbientBrightness } from '../composables/sceneBrightness'
import {
  AMBIENT_BRIGHTNESS_DEFAULT,
  AMBIENT_BRIGHTNESS_STORAGE_KEY,
} from '../equipment/visuals/ambientBrightness'

describe('SceneBrightnessControl', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setAmbientBrightness(AMBIENT_BRIGHTNESS_DEFAULT)
  })

  it('renders the slider at the current value with a percentage label', () => {
    const wrapper = mount(SceneBrightnessControl)
    const slider = wrapper.get('[data-scene-brightness-slider]')
    expect(slider.attributes('type')).toBe('range')
    expect(slider.attributes('min')).toBe('0.5')
    expect(slider.attributes('max')).toBe('3')
    expect(wrapper.get('[data-scene-brightness-value]').text()).toBe('140 %')
  })

  it('applies and persists slider input', async () => {
    const wrapper = mount(SceneBrightnessControl)
    await wrapper.get('[data-scene-brightness-slider]').setValue('1.4')
    expect(ambientBrightness.value).toBeCloseTo(1.4)
    expect(window.localStorage.getItem(AMBIENT_BRIGHTNESS_STORAGE_KEY)).toBe('1.4')
    expect(wrapper.get('[data-scene-brightness-value]').text()).toBe('140 %')
  })

  it('resets to the shipped default', async () => {
    const wrapper = mount(SceneBrightnessControl)
    await wrapper.get('[data-scene-brightness-slider]').setValue('2.6')
    await wrapper.get('[data-scene-brightness-reset]').trigger('click')
    expect(ambientBrightness.value).toBe(AMBIENT_BRIGHTNESS_DEFAULT)
    expect(wrapper.get('[data-scene-brightness-value]').text()).toBe('140 %')
  })
})
