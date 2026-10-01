import { describe, expect, it, vi } from 'vitest'
import type { MotionSafetyEngine } from '../safety/motionSafety'
import { JogReason, OperatorJogGateway, type JoggableRobot } from './OperatorJogGateway'

function robot(): JoggableRobot {
  const jointAngles = [0, 0, 0, 0, 0, 0]
  return {
    jointAngles,
    setJointAngle: (axis: number, radians: number) => { jointAngles[axis] = radians },
  }
}

function safety(blocked = false): MotionSafetyEngine {
  return { checkMotion: vi.fn(() => ({ blocked, ok: !blocked })) } as unknown as MotionSafetyEngine
}

function make(options: Partial<{ authority: boolean; mode: boolean; replay: boolean }> = {}) {
  let time = 0
  const bot = robot()
  const engine = safety()
  const gateway = new OperatorJogGateway(bot, engine, {
    isAuthorityOwned: () => options.authority ?? true,
    isModeCompatible: () => options.mode ?? true,
    isReplay: () => options.replay ?? false,
    now: () => time,
  })
  return {
    gateway,
    bot,
    engine,
    advance: (ms: number) => { time += ms },
  }
}

const press = { action: 'press', joint: 'J1', direction: 1 as const, deadManToken: 'dm-1', correlationId: 'c1' }

describe('OperatorJogGateway', () => {
  it('accepts an authorized press and moves one step on tick', () => {
    const { gateway, bot } = make()
    expect(gateway.apply(press)).toEqual({ accepted: true, reason: null })
    expect(gateway.tick(0.05)).toBe(true)
    expect(bot.jointAngles[0]).toBeCloseTo(0.05)
    expect(gateway.isActive).toBe(true)
  })

  it('refuses jog in replay, in an incompatible mode, without authority and without a dead-man', () => {
    expect(make({ replay: true }).gateway.apply(press).reason).toBe(JogReason.Replay)
    expect(make({ mode: false }).gateway.apply(press).reason).toBe(JogReason.Mode)
    expect(make({ authority: false }).gateway.apply(press).reason).toBe(JogReason.Authority)
    expect(make().gateway.apply({ ...press, deadManToken: null }).reason).toBe(JogReason.DeadMan)
    expect(make().gateway.apply({ ...press, joint: 'J9' }).reason).toBe(JogReason.Joint)
    expect(make().gateway.apply({ ...press, direction: 5 }).reason).toBe(JogReason.Direction)
  })

  it('releases automatically when the dead-man timeout elapses', () => {
    const { gateway, advance } = make()
    gateway.apply(press)
    advance(600)
    expect(gateway.tick()).toBe(false)
    expect(gateway.isActive).toBe(false)
    expect(gateway.reason).toBe(JogReason.Safety)
  })

  it('releases automatically when motion safety blocks the step', () => {
    let time = 0
    const bot = robot()
    const engine = safety(true)
    const gateway = new OperatorJogGateway(bot, engine, {
      isAuthorityOwned: () => true,
      isModeCompatible: () => true,
      isReplay: () => false,
      now: () => time,
    })
    gateway.apply(press)
    expect(gateway.tick()).toBe(false)
    expect(gateway.isActive).toBe(false)
    expect(bot.jointAngles[0]).toBe(0)
    time += 1
    expect(gateway.isActive).toBe(false)
  })

  it('stops immediately on release and records the reason', () => {
    const { gateway, bot } = make()
    gateway.apply(press)
    gateway.tick(0.05)

    expect(gateway.apply({ action: 'release', joint: 'J1', direction: 1 })).toEqual({ accepted: true, reason: null })
    expect(gateway.isActive).toBe(false)
    expect(gateway.reason).toBe(JogReason.Released)
    expect(gateway.tick()).toBe(false)
    expect(bot.jointAngles[0]).toBeCloseTo(0.05)
  })

  it('stops on authority loss with an explicit reason', () => {
    const { gateway } = make()
    gateway.apply(press)
    gateway.stop('authority-loss')
    expect(gateway.isActive).toBe(false)
    expect(gateway.reason).toBe('authority-loss')
  })
})
