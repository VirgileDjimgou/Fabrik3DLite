import { describe, expect, it } from 'vitest'
import {
  compareExpectedVsObserved,
  elapsedSeconds,
  formatDuration,
  formatPercent,
  isRestartable,
  metricCards,
  rankingRows,
  sessionStatusTone,
  unexpectedObservedActions,
} from './instructorView'
import { makeAction, makeMetrics } from './dashboardFixtures'

describe('instructorView helpers', () => {
  it('formats durations compactly and never emits NaN', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(185)).toBe('3m 05s')
    expect(formatDuration(3720)).toBe('1h 02m')
    expect(formatDuration(Number.NaN)).toBe('0s')
  })

  it('computes elapsed seconds from start and end, clamped at zero', () => {
    expect(elapsedSeconds('2026-09-20T10:00:00Z', '2026-09-20T10:05:00Z')).toBe(300)
    expect(elapsedSeconds('2026-09-20T10:00:00Z', '2026-09-20T09:00:00Z')).toBe(0)
    expect(elapsedSeconds('not-a-date', null, 0)).toBe(0)
  })

  it('renders completion rate as a whole percent', () => {
    expect(formatPercent(0.756)).toBe('76%')
    expect(formatPercent(Number.NaN)).toBe('0%')
  })

  it('maps session status to semantic tones', () => {
    expect(sessionStatusTone('completed')).toBe('success')
    expect(sessionStatusTone('failed')).toBe('fault')
    expect(sessionStatusTone('abandoned')).toBe('warning')
    expect(sessionStatusTone('running')).toBe('pending')
    expect(sessionStatusTone('unknown')).toBe('normal')
  })

  it('compares expected actions with observed evidence without double counting', () => {
    const actions = [
      makeAction({ id: 'x1', type: 'PICK_PART', correctness: 'correct', sequence: 1 }),
      makeAction({ id: 'x2', type: 'WRONG_GRIP', correctness: 'incorrect', sequence: 2 }),
      makeAction({ id: 'x3', type: 'EXTRA', correctness: 'unknown', sequence: 3 }),
    ]
    const comparison = compareExpectedVsObserved(['PICK_PART', 'WRONG_GRIP', 'COMPLETE'], actions)

    expect(comparison.map((entry) => entry.status)).toEqual(['satisfied', 'incorrect', 'missing'])
    expect(comparison[0].matchedActionId).toBe('x1')
    expect(comparison[2].matchedActionId).toBeNull()

    const unexpected = unexpectedObservedActions(['PICK_PART'], actions)
    expect(unexpected.map((entry) => entry.id)).toEqual(['x2', 'x3'])
  })

  it('matches an expectation through its expectedActionId when the type differs', () => {
    const actions = [makeAction({ id: 'x1', type: 'step.reached', expectedActionId: 'COMPLETE' })]
    const comparison = compareExpectedVsObserved(['COMPLETE'], actions)
    expect(comparison[0].status).toBe('satisfied')
    expect(comparison[0].matchedActionId).toBe('x1')
  })

  it('builds the documented metric cards and ranking rows', () => {
    const metrics = makeMetrics()
    const cards = metricCards(metrics)
    expect(cards.map((card) => card.key)).toContain('completionRate')
    expect(cards.find((card) => card.key === 'completionRate')?.value).toBe('75%')
    expect(cards.find((card) => card.key === 'safetyViolations')?.tone).toBe('fault')

    const rows = rankingRows([{ key: 'A', count: 4 }, { key: 'B', count: 2 }])
    expect(rows[0].ratio).toBe(1)
    expect(rows[1].ratio).toBe(0.5)
    expect(rankingRows([])).toEqual([])
    // Optional generated fields must not leak as "undefined" rows.
    expect(rankingRows([{ count: 3 }])[0]).toEqual({ key: '', count: 3, ratio: 1 })
  })

  it('only allows restarting a session that is not running', () => {
    expect(isRestartable('completed')).toBe(true)
    expect(isRestartable('failed')).toBe(true)
    expect(isRestartable('Running')).toBe(false)
  })
})
