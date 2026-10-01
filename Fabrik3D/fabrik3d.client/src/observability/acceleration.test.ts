import { describe, expect, it } from 'vitest'
import {
  UNKNOWN_RENDERER_IDENTITY,
  classifyAcceleration,
  describeAcceleration,
  hasRendererIdentity,
  readRendererIdentity,
  type RendererIdentity,
} from './acceleration'

function identity(overrides: Partial<RendererIdentity> = {}): RendererIdentity {
  return { ...UNKNOWN_RENDERER_IDENTITY, ...overrides }
}

describe('acceleration classification', () => {
  it('treats an empty identity as unknown, never hardware', () => {
    expect(classifyAcceleration(UNKNOWN_RENDERER_IDENTITY)).toBe('unknown')
    expect(classifyAcceleration(null)).toBe('unknown')
    expect(classifyAcceleration(undefined)).toBe('unknown')
    expect(hasRendererIdentity(UNKNOWN_RENDERER_IDENTITY)).toBe(false)
  })

  it('classifies software rasterizers as software even when wrapped in ANGLE', () => {
    expect(
      classifyAcceleration(identity({ unmaskedRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' })),
    ).toBe('software')
    expect(classifyAcceleration(identity({ renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' }))).toBe('software')
    expect(classifyAcceleration(identity({ unmaskedRenderer: 'Microsoft Basic Render Driver' }))).toBe('software')
  })

  it('classifies known GPU vendors and hardware APIs as hardware', () => {
    expect(classifyAcceleration(identity({ unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11)' }))).toBe('hardware')
    expect(classifyAcceleration(identity({ unmaskedRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)' }))).toBe('hardware')
    expect(classifyAcceleration(identity({ unmaskedRenderer: 'Apple M2 Pro' }))).toBe('hardware')
    expect(classifyAcceleration(identity({ unmaskedVendor: 'AMD', unmaskedRenderer: 'AMD Radeon RX 6600' }))).toBe('hardware')
  })

  it('keeps unrecognised renderer strings as unknown', () => {
    expect(classifyAcceleration(identity({ unmaskedRenderer: 'Acme Frame Blaster 9000' }))).toBe('unknown')
  })

  it('describes each class without over-claiming', () => {
    expect(describeAcceleration('hardware')).toBe('hardware-accelerated')
    expect(describeAcceleration('software')).toContain('not a GPU result')
    expect(describeAcceleration('unknown')).toBe('acceleration not verified')
  })
})

describe('renderer identity reading', () => {
  it('reads masked and unmasked values from a WebGL context', () => {
    const gl = {
      getParameter: (name: number) =>
        name === 0x1f00 ? 'Google Inc.' : name === 0x1f01 ? 'WebKit WebGL' : name === 1 ? 'NVIDIA (unmasked)' : '',
      getExtension: (name: string) =>
        name === 'WEBGL_debug_renderer_info' ? { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 1_000 } : null,
    }
    const identityValue = readRendererIdentity(gl)
    expect(identityValue.vendor).toBe('Google Inc.')
    expect(identityValue.renderer).toBe('WebKit WebGL')
    expect(identityValue.unmaskedVendor).toBe('NVIDIA (unmasked)')
  })

  it('returns the empty identity when the context is missing', () => {
    expect(readRendererIdentity(null)).toEqual(UNKNOWN_RENDERER_IDENTITY)
    expect(readRendererIdentity(undefined)).toEqual(UNKNOWN_RENDERER_IDENTITY)
  })

  it('never throws when the context rejects parameter reads', () => {
    const gl = {
      getParameter: () => {
        throw new Error('context lost')
      },
      getExtension: () => null,
    }
    expect(readRendererIdentity(gl)).toEqual(UNKNOWN_RENDERER_IDENTITY)
  })
})
