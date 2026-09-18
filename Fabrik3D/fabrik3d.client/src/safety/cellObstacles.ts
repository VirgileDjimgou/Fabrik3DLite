/**
 * Simplified collision world for the single-conveyor cell, derived from
 * the layout configuration (not from rendered meshes). All lengths are
 * meters.
 *
 * Modeling notes:
 * - The CNC body is solid except for the door opening, which is the
 *   tool's legitimate workspace during insert/retrieve.
 * - The pallet is modeled as its rim frame only: the tool's workspace is
 *   the cavity grid inside the rim, so the base/tray are not obstacles.
 * - The floor is a plane; the conveyor is a solid box under the belt.
 */

import { SINGLE_CELL_CONVEYOR, SINGLE_CELL_POSITIONS } from '../simulation/SingleConveyorCellLayout'
import { vec, type CollisionPrimitive, type Vec3 } from './collision'

// Documented simplified geometry of the CNC body (matches LargeCNCMachine dims).
const CNC_BODY_WIDTH = 2.0
const CNC_BODY_HEIGHT = 2.2
const CNC_BODY_DEPTH = 1.6

// Door opening on the CNC face that faces the robot (door faces −Z).
const CNC_DOOR_HALF_WIDTH = 0.45
const CNC_DOOR_Y_MIN = 0.5
const CNC_DOOR_Y_MAX = 1.5

// Conveyor belt geometry (belt runs along X).
const CONVEYOR_HEIGHT = 0.6
const CONVEYOR_HALF_DEPTH = 0.3

// Pallet geometry (matches RawMaterialPallet dims).
export const PALLET_SIZE_METERS = 0.6
const PALLET_BASE_H = 0.05
const PALLET_TRAY_H = 0.025
const PALLET_RIM_H = 0.012
const PALLET_RIM_THICKNESS = 0.01

export interface ObstacleDef {
  id: string
  kind: 'equipment' | 'safety-zone' | 'floor' | 'pallet'
  primitive: CollisionPrimitive
  /** Per-obstacle keep-out clearance (meters). */
  clearanceMeters: number
}

export interface CellCollisionWorld {
  obstacles: ObstacleDef[]
  /** Baseline margin added to every collision test (meters). */
  defaultMarginMeters: number
}

function cncBox(czMin: number, czMax: number): { min: Vec3; max: Vec3 } {
  return {
    min: vec(
      SINGLE_CELL_POSITIONS.cnc[0] - CNC_BODY_WIDTH / 2,
      0,
      SINGLE_CELL_POSITIONS.cnc[2] + czMin,
    ),
    max: vec(
      SINGLE_CELL_POSITIONS.cnc[0] + CNC_BODY_WIDTH / 2,
      CNC_BODY_HEIGHT,
      SINGLE_CELL_POSITIONS.cnc[2] + czMax,
    ),
  }
}

/**
 * CNC keep-out geometry: the solid chamber behind the door plane plus the
 * front slab around the door opening. The door opening itself is free so
 * the tool can approach and insert through it.
 */
function cncObstacles(): ObstacleDef[] {
  const doorZ = -CNC_BODY_DEPTH / 2
  const slabZ = doorZ + 0.15
  const obstacles: ObstacleDef[] = []

  // Chamber behind the door opening corridor (starts at the opening depth).
  obstacles.push({ id: 'cnc-1', kind: 'equipment', primitive: { kind: 'box', ...cncBox(slabZ, CNC_BODY_DEPTH / 2) }, clearanceMeters: 0.02 })

  // Front slabs around the door opening (z in [doorZ, slabZ]).
  const slabs: { min: Vec3; max: Vec3 }[] = [
    // header above the door
    { min: vec(-CNC_BODY_WIDTH / 2, CNC_DOOR_Y_MAX, SINGLE_CELL_POSITIONS.cnc[2] + doorZ), max: vec(CNC_BODY_WIDTH / 2, CNC_BODY_HEIGHT, SINGLE_CELL_POSITIONS.cnc[2] + slabZ) },
    // base below the door
    { min: vec(-CNC_BODY_WIDTH / 2, 0, SINGLE_CELL_POSITIONS.cnc[2] + doorZ), max: vec(CNC_BODY_WIDTH / 2, CNC_DOOR_Y_MIN, SINGLE_CELL_POSITIONS.cnc[2] + slabZ) },
    // left column
    { min: vec(-CNC_BODY_WIDTH / 2, CNC_DOOR_Y_MIN, SINGLE_CELL_POSITIONS.cnc[2] + doorZ), max: vec(-CNC_DOOR_HALF_WIDTH, CNC_DOOR_Y_MAX, SINGLE_CELL_POSITIONS.cnc[2] + slabZ) },
    // right column
    { min: vec(CNC_DOOR_HALF_WIDTH, CNC_DOOR_Y_MIN, SINGLE_CELL_POSITIONS.cnc[2] + doorZ), max: vec(CNC_BODY_WIDTH / 2, CNC_DOOR_Y_MAX, SINGLE_CELL_POSITIONS.cnc[2] + slabZ) },
  ]
  for (const slab of slabs) obstacles.push({ id: 'cnc-1', kind: 'equipment', primitive: { kind: 'box', min: slab.min, max: slab.max }, clearanceMeters: 0.02 })
  return obstacles
}

function conveyorObstacle(): ObstacleDef {
  const cx = SINGLE_CELL_POSITIONS.conveyor[0]
  const cz = SINGLE_CELL_POSITIONS.conveyor[2]
  const halfLength = SINGLE_CELL_CONVEYOR.length / 2
  return {
    id: 'conveyor-1',
    kind: 'equipment',
    primitive: {
      kind: 'box',
      min: vec(cx - halfLength, 0, cz - CONVEYOR_HALF_DEPTH),
      max: vec(cx + halfLength, CONVEYOR_HEIGHT, cz + CONVEYOR_HALF_DEPTH),
    },
    clearanceMeters: 0.03,
  }
}

function floorObstacle(): ObstacleDef {
  return {
    id: 'floor',
    kind: 'floor',
    primitive: { kind: 'plane', point: vec(0, 0, 0), normal: vec(0, 1, 0) },
    clearanceMeters: 0.02,
  }
}

/**
 * Keep-out buffer behind the conveyor where pallets arrive and queue.
 * The robot tool must never reach into this zone.
 */
function safetyZones(): ObstacleDef[] {
  return [
    {
      id: 'pallet-infeed-zone',
      kind: 'safety-zone',
      primitive: {
        kind: 'box',
        min: vec(-4.4, 0.1, SINGLE_CELL_POSITIONS.conveyor[2] - 0.6),
        max: vec(-3.5, 2.2, SINGLE_CELL_POSITIONS.conveyor[2] + 0.6),
      },
      clearanceMeters: 0.02,
    },
  ]
}

/** The collision world-model for the current single-conveyor cell. */
export function createSingleCellWorld(defaultMarginMeters = 0.02): CellCollisionWorld {
  return {
    defaultMarginMeters,
    obstacles: [...cncObstacles(), conveyorObstacle(), floorObstacle(), ...safetyZones()],
  }
}

/**
 * Dynamic pallet obstacle: the pallet rim frame at its current world X.
 * Only the rim rails are solid — the cavity grid is the tool workspace.
 */
export function palletObstacles(palletWorldX: number): ObstacleDef[] {
  const cz = SINGLE_CELL_POSITIONS.conveyor[2]
  const half = PALLET_SIZE_METERS / 2
  const rimYMin = SINGLE_CELL_CONVEYOR.surfaceY + PALLET_BASE_H + PALLET_TRAY_H
  const rimYMax = rimYMin + PALLET_RIM_H
  const innerHalf = half - PALLET_RIM_THICKNESS

  const rails: { min: Vec3; max: Vec3 }[] = [
    { min: vec(palletWorldX - half, rimYMin, cz - half), max: vec(palletWorldX - innerHalf, rimYMax, cz + half) },
    { min: vec(palletWorldX + innerHalf, rimYMin, cz - half), max: vec(palletWorldX + half, rimYMax, cz + half) },
    { min: vec(palletWorldX - half, rimYMin, cz - half), max: vec(palletWorldX + half, rimYMax, cz - innerHalf) },
    { min: vec(palletWorldX - half, rimYMin, cz + innerHalf), max: vec(palletWorldX + half, rimYMax, cz + half) },
  ]

  return rails.map((rail) => ({
    id: 'pallet-work-object',
    kind: 'pallet',
    primitive: { kind: 'box', min: rail.min, max: rail.max } as CollisionPrimitive,
    clearanceMeters: 0.01,
  }))
}

export function addPalletObstacle(world: CellCollisionWorld, palletWorldX: number): CellCollisionWorld {
  const without = world.obstacles.filter((obstacle) => obstacle.id !== 'pallet-work-object')
  return { ...world, obstacles: [...without, ...palletObstacles(palletWorldX)] }
}