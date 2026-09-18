import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MotionSafetyPanel from './MotionSafetyPanel.vue'
import { MotionSafetyEngine } from '../safety/motionSafety'
import { createSingleCellWorld } from '../safety/cellObstacles'
import { createSafetyRobotModel } from '../safety/robotModel'
import { MEDIUM_6AXIS } from '../robot/catalog'

function engine() {
  return new MotionSafetyEngine(createSafetyRobotModel(MEDIUM_6AXIS), createSingleCellWorld())
}

describe('MotionSafetyPanel', () => {
  it('shows the reach envelope and check status', () => {
    const wrapper = mount(MotionSafetyPanel, { props: { engine: engine() } })
    const reach = createSafetyRobotModel(MEDIUM_6AXIS).maxReachMeters()
    expect(wrapper.text()).toContain(reach.toFixed(2))
    expect(wrapper.text()).toContain('enabled')
    expect(wrapper.text()).toContain('No motion alarms')
  })

  it('displays raised alarms with code, equipment and phase', async () => {
    const e = engine()
    const wrapper = mount(MotionSafetyPanel, { props: { engine: e } })

    e.checkTarget({ frameId: 'world', position: { x: 99, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }, 'MOVE_TO_CNC_APPROACH')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('UNREACHABLE_TARGET')
    expect(wrapper.text()).toContain('robot-1')
    expect(wrapper.text()).toContain('MOVE_TO_CNC_APPROACH')
  })

  it('marks the panel disabled when diagnostics are off', () => {
    const e = new MotionSafetyEngine(createSafetyRobotModel(MEDIUM_6AXIS), createSingleCellWorld(), undefined, { enabled: false })
    const wrapper = mount(MotionSafetyPanel, { props: { engine: e } })
    expect(wrapper.text()).toContain('disabled')
  })
})