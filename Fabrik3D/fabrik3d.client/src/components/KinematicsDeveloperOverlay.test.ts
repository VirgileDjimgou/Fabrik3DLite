import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import KinematicsDeveloperOverlay from './KinematicsDeveloperOverlay.vue'
import { createRobotKinematics, createSingleCellFrames, createCncTarget } from '../kinematics'
import { MEDIUM_6AXIS } from '../robot/catalog'

describe('KinematicsDeveloperOverlay', () => {
  it('shows the selected profile, SI units, frames, and target pose', () => {
    const wrapper = mount(KinematicsDeveloperOverlay, {
      props: { controller: null, model: createRobotKinematics(MEDIUM_6AXIS), frames: createSingleCellFrames(), target: createCncTarget('approach') },
    })
    expect(wrapper.text()).toContain('medium-6axis')
    expect(wrapper.text()).toContain('m · rad · s · kg')
    expect(wrapper.text()).toContain('waiting for controller')
    expect(wrapper.text()).toContain('cnc-1')
  })
})
