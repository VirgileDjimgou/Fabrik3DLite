import * as THREE from 'three'

export type PartShape = 'cube' | 'rect-block' | 'cylinder' | 'disc' | 'hex-billet'

export const ALL_PART_SHAPES: readonly PartShape[] = [
  'cube', 'rect-block', 'cylinder', 'disc', 'hex-billet',
]

export type CNCState = 'IDLE' | 'LOADING' | 'MACHINING' | 'UNLOADING'

export interface MetalPartData {
  id: string
  shape: PartShape
  position: THREE.Vector3
  picked: boolean
  machined: boolean
}

let nextPartId = 0

/**
 * Tracks all metal parts in the simulation cell.
 *
 * Responsibilities:
 * - Register and track parts
 * - Detect when parts are picked
 * - Detect when parts are placed
 * - Detect when machining is complete
 */
export class PartManager {
  readonly parts: MetalPartData[] = []

  onPartPicked: ((part: MetalPartData) => void) | null = null
  onPartPlaced: ((part: MetalPartData) => void) | null = null
  onPartMachined: ((part: MetalPartData) => void) | null = null

  register(shape: PartShape, position: THREE.Vector3): MetalPartData {
    const part: MetalPartData = {
      id: `part-${nextPartId++}`,
      shape,
      position: position.clone(),
      picked: false,
      machined: false,
    }
    this.parts.push(part)
    return part
  }

  pick(id: string): MetalPartData | undefined {
    const p = this.parts.find(x => x.id === id)
    if (p && !p.picked) {
      p.picked = true
      this.onPartPicked?.(p)
    }
    return p
  }

  place(id: string, position: THREE.Vector3): MetalPartData | undefined {
    const p = this.parts.find(x => x.id === id)
    if (p) {
      p.position.copy(position)
      p.picked = false
      this.onPartPlaced?.(p)
    }
    return p
  }

  markAsMachined(id: string): MetalPartData | undefined {
    const p = this.parts.find(x => x.id === id)
    if (p && !p.machined) {
      p.machined = true
      this.onPartMachined?.(p)
    }
    return p
  }

  getAvailable(): MetalPartData[] {
    return this.parts.filter(p => !p.picked && !p.machined)
  }

  getNextAvailable(): MetalPartData | undefined {
    return this.parts.find(p => !p.picked && !p.machined)
  }
}

/** Returns half-height of a part shape (for placement on surfaces). */
export function getPartHalfHeight(shape: PartShape): number {
  switch (shape) {
    case 'cube': return 0.03
    case 'rect-block': return 0.02
    case 'cylinder': return 0.04
    case 'disc': return 0.0075
    case 'hex-billet': return 0.035
  }
}

/** Creates a Three.js BufferGeometry for the given part shape. */
export function createPartGeometry(shape: PartShape): THREE.BufferGeometry {
  switch (shape) {
    case 'cube':
      return new THREE.BoxGeometry(0.06, 0.06, 0.06)
    case 'rect-block':
      return new THREE.BoxGeometry(0.08, 0.04, 0.05)
    case 'cylinder':
      return new THREE.CylinderGeometry(0.03, 0.03, 0.08, 16)
    case 'disc':
      return new THREE.CylinderGeometry(0.04, 0.04, 0.015, 20)
    case 'hex-billet':
      return new THREE.CylinderGeometry(0.035, 0.035, 0.07, 6)
  }
}
