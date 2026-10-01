import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NewJobView from './NewJobView.vue'
import { i18n } from '@/i18n'
import * as api from '@/services/api'
import type { JobComposerOptionsDto, JobComposerPreviewDto, JobDto } from '@/services/api'

vi.mock('@/services/api', () => ({
  getJobComposerOptions: vi.fn(),
  previewJobDefinition: vi.fn(),
  createComposerJob: vi.fn(),
}))

const options: JobComposerOptionsDto = {
  cells: [
    {
      id: 'reference-cell', name: 'CNC machine tending (reference)', available: true, simulatorCount: 1,
      compatibleScenarioIds: ['pallet-processing', 'cnc-loading'], defaultScenarioId: 'pallet-processing',
    },
    {
      id: 'vision-sorting-cell', name: 'Vision sorting cell', available: false, simulatorCount: 0,
      compatibleScenarioIds: ['sorting-normal-cycle'], defaultScenarioId: 'sorting-normal-cycle',
    },
  ],
  scenarios: [
    { id: 'pallet-processing', name: 'Complete pallet processing', level: 'advanced' },
    { id: 'cnc-loading', name: 'CNC loading', level: 'intermediate' },
    { id: 'sorting-normal-cycle', name: 'Vision sorting normal cycle', level: 'intermediate' },
  ],
  cellTemplates: [],
  maxRows: 32,
  maxColumns: 32,
  maxTasks: 256,
}

const validPreview: JobComposerPreviewDto = {
  valid: true, resolvedTargetCellId: 'reference-cell', scenarioId: 'pallet-processing', taskCount: 1,
  tasks: [{
    sequenceOrder: 0, name: 'Slot R0 C0', partType: 'part', palletId: 'pallet-1',
    slotRow: 0, slotColumn: 0, stableKey: 'pallet-1:R0:C0',
  }],
  errors: [], warnings: [],
}

const createdJob = { id: 'job-123', name: 'Composed' } as unknown as JobDto

const mountView = () => mount(NewJobView, {
  global: {
    plugins: [i18n],
    stubs: { RouterLink: { template: '<a data-testid="router-link"><slot /></a>' } },
  },
})

async function completeToReview(wrapper: ReturnType<typeof mountView>) {
  await wrapper.get('[data-testid="composer-name"]').setValue('Composed job')
  await wrapper.get('[data-testid="composer-next"]').trigger('click')
  await wrapper.get('[data-testid="composer-slot-0-0"]').trigger('click')
}

describe('NewJobView job composer', () => {
  beforeEach(() => {
    vi.mocked(api.getJobComposerOptions).mockReset()
    vi.mocked(api.previewJobDefinition).mockReset()
    vi.mocked(api.createComposerJob).mockReset()
  })

  it('loads composer options and preselects the default cell/scenario', async () => {
    vi.mocked(api.getJobComposerOptions).mockResolvedValue(options)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="composer-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-identity"]').exists()).toBe(true)
    expect((wrapper.get('[data-testid="composer-cell"]').element as HTMLSelectElement).value).toBe('reference-cell')
    expect((wrapper.get('[data-testid="composer-scenario"]').element as HTMLSelectElement).value).toBe('pallet-processing')
    // Incompatible scenarios for the selected cell are not offered.
    const scenarioText = wrapper.get('[data-testid="composer-scenario"]').text()
    expect(scenarioText).not.toContain('Vision sorting normal cycle')
  })

  it('generates deterministic local tasks from occupied slots and reviews server-side', async () => {
    vi.mocked(api.getJobComposerOptions).mockResolvedValue(options)
    vi.mocked(api.previewJobDefinition).mockResolvedValue(validPreview)
    vi.mocked(api.createComposerJob).mockResolvedValue(createdJob)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="composer-name"]').setValue('Composed job')
    await wrapper.get('[data-testid="composer-next"]').trigger('click')

    // No slot selected yet: next is blocked and a hint is shown.
    expect(wrapper.find('[data-testid="composer-pallet"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-next"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="composer-no-slots"]').exists()).toBe(true)

    await wrapper.get('[data-testid="composer-slot-0-1"]').trigger('click')
    expect(wrapper.get('[data-testid="composer-slot-0-1"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="composer-local-tasks"]').text()).toContain('R0 C1')

    await wrapper.get('[data-testid="composer-next"]').trigger('click')
    await flushPromises()

    expect(api.previewJobDefinition).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(api.previewJobDefinition).mock.calls[0]![0]
    expect(sent.targetCellId).toBe('reference-cell')
    expect(sent.palletLayout).toEqual({ palletId: 'pallet-1', rows: 2, columns: 2 })
    expect(sent.occupiedSlots).toEqual([{ row: 0, column: 1 }])

    expect(wrapper.find('[data-testid="composer-review"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-review-target"]').text()).toBe('reference-cell')
    expect(wrapper.find('[data-testid="composer-valid"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-tasks"]').text()).toContain('Slot R0 C0')

    await wrapper.get('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    expect(api.createComposerJob).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="composer-success"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-success"]').text()).toContain('job-123')
  })

  it('blocks submission and shows actionable errors for an invalid definition', async () => {
    vi.mocked(api.getJobComposerOptions).mockResolvedValue(options)
    vi.mocked(api.previewJobDefinition).mockResolvedValue({
      valid: false, resolvedTargetCellId: 'reference-cell', scenarioId: null, taskCount: 0, tasks: [],
      errors: [{ code: 'no_tasks', field: 'occupiedSlots', message: 'Select at least one slot.' }],
      warnings: [],
    })

    const wrapper = mountView()
    await flushPromises()
    await completeToReview(wrapper)
    await wrapper.get('[data-testid="composer-next"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="composer-valid"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Select at least one slot.')
    expect(api.createComposerJob).not.toHaveBeenCalled()
  })

  it('shows an offline state with retry when options cannot be loaded', async () => {
    vi.mocked(api.getJobComposerOptions)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(options)

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="composer-retry"]').exists()).toBe(true)
    await wrapper.get('[data-testid="composer-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="composer-identity"]').exists()).toBe(true)
  })
})
