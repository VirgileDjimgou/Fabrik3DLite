import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EquipmentSceneBrowser from './EquipmentSceneBrowser.vue'
describe('EquipmentSceneBrowser', () => { it('filters registry-backed assets and scenes', async () => { const wrapper = mount(EquipmentSceneBrowser); expect(wrapper.findAll('[data-browser-item]').length).toBeGreaterThanOrEqual(5); await wrapper.get('input').setValue('pallet'); expect(wrapper.findAll('[data-browser-item]').length).toBeGreaterThan(0); await wrapper.get('button:nth-child(2)').trigger('click'); expect(wrapper.findAll('[data-browser-item]').every(node => node.text().includes('equipment'))).toBe(true) }) })
