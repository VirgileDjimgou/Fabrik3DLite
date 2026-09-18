import { EQUIPMENT_SDK_VERSION, type EquipmentAnchor, type EquipmentConnection, type EquipmentDefinition, type EquipmentPort, type EquipmentRuntimeState, type Transform, type Vector3Meters } from './types'

export type MaterialFlowEquipmentKind =
  | 'straight-conveyor' | 'curved-conveyor' | 'roller-transfer' | 'pneumatic-stop' | 'diverter-pusher'
  | 'photoelectric-sensor' | 'barcode-rfid-reader' | 'infeed-buffer' | 'outfeed-buffer' | 'storage-bin' | 'parts-rack' | 'euro-pallet' | 'carton'
  | 'two-finger-gripper' | 'vacuum-gripper' | 'iso-flange-tcp' | 'tool-changer' | 'tool-rack' | 'part-presence-sensor' | 'grip-pressure-sensor'
  | 'pallet-nest' | 'machining-fixture' | 'toggle-clamp' | 'three-jaw-chuck' | 'workholding-adapter' | 'configurable-part'

const materialIn = (): EquipmentPort => ({ id: 'material-in', kind: 'material', direction: 'input' })
const materialOut = (): EquipmentPort => ({ id: 'material-out', kind: 'material', direction: 'output' })
const signalOut = (): EquipmentPort => ({ id: 'detected', kind: 'signal', direction: 'output' })
const signalIn = (): EquipmentPort => ({ id: 'command', kind: 'signal', direction: 'input' })
const dimensions = (x: number, y: number, z: number): Vector3Meters => ({ x, y, z })
const definition = (id: MaterialFlowEquipmentKind, category: EquipmentDefinition['category'], description: string, size: Vector3Meters, ports: EquipmentPort[], runtimeCapability: 'static' | 'simulation-ready' = 'static'): EquipmentDefinition => ({
  sdkVersion: EQUIPMENT_SDK_VERSION, id, category, capabilities: [{ id, description }], ports, dimensionsMeters: size,
  collisionProxy: { kind: 'box', dimensionsMeters: size }, runtimeCapability,
  anchors: [{ id: 'anchor:placement', kind: 'placement', position: { x: 0, y: 0, z: 0 } }, { id: 'anchor:in', kind: 'material', position: { x: -size.x / 2, y: 0, z: 0 } }, { id: 'anchor:out', kind: 'material', position: { x: size.x / 2, y: 0, z: 0 } }],
})

/** Catalog data: detailed visual assets can be swapped without changing these semantics. */
export const MATERIAL_FLOW_EQUIPMENT_DEFINITIONS: readonly EquipmentDefinition[] = [
  definition('straight-conveyor', 'conveyor', 'Straight belt conveyor', dimensions(2, .55, .65), [materialIn(), materialOut(), signalIn()], 'simulation-ready'),
  definition('curved-conveyor', 'conveyor', 'Curved belt conveyor', dimensions(1.4, .55, 1.4), [materialIn(), materialOut(), signalIn()], 'simulation-ready'),
  definition('roller-transfer', 'conveyor', 'Powered roller transfer', dimensions(1.2, .55, .8), [materialIn(), materialOut(), signalIn()], 'simulation-ready'),
  definition('pneumatic-stop', 'conveyor', 'Pneumatic conveyor stop', dimensions(.3, .45, .65), [signalIn(), { id: 'stopped', kind: 'signal', direction: 'output' }], 'simulation-ready'),
  definition('diverter-pusher', 'conveyor', 'Pneumatic diverter / pusher', dimensions(.75, .5, .75), [signalIn(), { id: 'extended', kind: 'signal', direction: 'output' }], 'simulation-ready'),
  definition('photoelectric-sensor', 'sensor', 'Photoelectric sensor', dimensions(.12, .12, .12), [signalOut()], 'simulation-ready'),
  definition('barcode-rfid-reader', 'sensor', 'Barcode / RFID reader', dimensions(.2, .18, .15), [{ id: 'data', kind: 'data', direction: 'output' }, signalOut()], 'simulation-ready'),
  definition('infeed-buffer', 'pallet-station', 'Infeed buffer', dimensions(1.2, .4, .8), [materialIn(), materialOut()]),
  definition('outfeed-buffer', 'pallet-station', 'Outfeed buffer', dimensions(1.2, .4, .8), [materialIn(), materialOut()]),
  definition('storage-bin', 'pallet-station', 'Parts bin', dimensions(.6, .45, .5), [materialOut()]),
  definition('parts-rack', 'pallet-station', 'Parts rack', dimensions(1.2, 1.8, .5), [materialOut()]),
  definition('euro-pallet', 'pallet-station', 'EUR pallet', dimensions(1.2, .15, .8), [materialIn(), materialOut()]),
  definition('carton', 'pallet-station', 'Configurable carton', dimensions(.4, .3, .3), [materialIn(), materialOut()]),
  definition('two-finger-gripper', 'tool', 'Two-finger gripper', dimensions(.16, .18, .16), [{ id: 'robot-flange', kind: 'material', direction: 'input' }, materialOut(), signalIn(), { id: 'gripped', kind: 'signal', direction: 'output' }], 'simulation-ready'),
  definition('vacuum-gripper', 'tool', 'Vacuum gripper', dimensions(.2, .14, .2), [{ id: 'robot-flange', kind: 'material', direction: 'input' }, materialOut(), signalIn(), { id: 'vacuum-ok', kind: 'signal', direction: 'output' }], 'simulation-ready'),
  definition('iso-flange-tcp', 'tool', 'ISO flange and TCP marker', dimensions(.1, .1, .1), [{ id: 'robot-flange', kind: 'material', direction: 'input' }, materialOut()]),
  definition('tool-changer', 'tool', 'Automatic tool changer', dimensions(.18, .15, .18), [{ id: 'robot-flange', kind: 'material', direction: 'input' }, materialOut(), signalIn()], 'simulation-ready'),
  definition('tool-rack', 'tool', 'Tool rack', dimensions(.7, .8, .35), [materialOut()]),
  definition('part-presence-sensor', 'sensor', 'Part presence sensor', dimensions(.12, .1, .12), [signalOut()], 'simulation-ready'),
  definition('grip-pressure-sensor', 'sensor', 'Grip / pressure sensor', dimensions(.08, .08, .08), [signalOut()], 'simulation-ready'),
  definition('pallet-nest', 'pallet-station', 'Pallet locating nest', dimensions(.7, .12, .7), [materialIn(), materialOut()]),
  definition('machining-fixture', 'machine', 'Machining fixture', dimensions(.55, .2, .55), [materialIn(), materialOut()]),
  definition('toggle-clamp', 'machine', 'Toggle clamp', dimensions(.2, .2, .12), [signalIn(), { id: 'clamped', kind: 'signal', direction: 'output' }], 'simulation-ready'),
  definition('three-jaw-chuck', 'machine', 'Three-jaw chuck', dimensions(.3, .2, .3), [materialIn(), materialOut(), signalIn()], 'simulation-ready'),
  definition('workholding-adapter', 'machine', 'Workholding adapter', dimensions(.35, .14, .35), [materialIn(), materialOut()]),
  definition('configurable-part', 'pallet-station', 'Configurable workpiece', dimensions(.12, .08, .12), [materialIn(), materialOut()]),
]

export function compatiblePorts(output: EquipmentPort, input: EquipmentPort): boolean {
  return output.kind === input.kind && (output.direction === 'output' || output.direction === 'bidirectional') && (input.direction === 'input' || input.direction === 'bidirectional')
}

/** Explicit Y-axis transform for anchor snapping; all values are metres/radians. */
export function anchorWorldPosition(anchor: EquipmentAnchor, transform: Transform): Vector3Meters {
  const angle = transform.rotation.y
  const cos = Math.cos(angle); const sin = Math.sin(angle)
  return {
    x: transform.position.x + anchor.position.x * cos - anchor.position.z * sin,
    y: transform.position.y + anchor.position.y,
    z: transform.position.z + anchor.position.x * sin + anchor.position.z * cos,
  }
}

export function nearestCompatibleAnchor(position: Vector3Meters, anchors: readonly EquipmentAnchor[], transform: Transform, toleranceMeters = .25): EquipmentAnchor | null {
  return anchors.map(anchor => ({ anchor, world: anchorWorldPosition(anchor, transform) }))
    .filter(candidate => Math.hypot(candidate.world.x - position.x, candidate.world.y - position.y, candidate.world.z - position.z) <= toleranceMeters)
    .sort((a, b) => a.anchor.id.localeCompare(b.anchor.id))[0]?.anchor ?? null
}

export function validateConnections(connections: readonly EquipmentConnection[], definitions: readonly EquipmentDefinition[], equipmentDefinitionById: ReadonlyMap<string, string>): string[] {
  const definitionsById = new Map(definitions.map(definition => [definition.id, definition]))
  const seen = new Set<string>(); const diagnostics: string[] = []
  for (const connection of connections) {
    if (seen.has(connection.id)) diagnostics.push(`Duplicate connection '${connection.id}'.`)
    seen.add(connection.id)
    const from = definitionsById.get(equipmentDefinitionById.get(connection.fromEquipmentId) ?? '')?.ports.find(port => port.id === connection.fromPortId)
    const to = definitionsById.get(equipmentDefinitionById.get(connection.toEquipmentId) ?? '')?.ports.find(port => port.id === connection.toPortId)
    if (!from || !to) { diagnostics.push(`Connection '${connection.id}' references an unknown port.`); continue }
    if (connection.kind !== from.kind || !compatiblePorts(from, to)) diagnostics.push(`Connection '${connection.id}' has incompatible ports.`)
  }
  return diagnostics
}

export class ConveyorRuntime {
  private position = 0
  constructor(readonly equipmentId: string, private readonly lengthMeters: number, private readonly speedMetersPerSecond: number) {}
  tick(seconds: number): number { this.position = Math.min(this.lengthMeters, Math.max(0, this.position + this.speedMetersPerSecond * seconds)); return this.position }
  reset(): void { this.position = 0 }
  getRuntimeState(): EquipmentRuntimeState { return { status: this.position >= this.lengthMeters ? 'idle' : 'running', updatedAt: new Date(0).toISOString(), values: { positionMeters: this.position } } }
}

export class BinarySensorRuntime {
  private active = false
  constructor(readonly equipmentId: string) {}
  setDetected(value: boolean): boolean { const changed = this.active !== value; this.active = value; return changed }
  getRuntimeState(): EquipmentRuntimeState { return { status: 'running', updatedAt: new Date(0).toISOString(), values: { detected: this.active } } }
}

export class BinaryActuatorRuntime {
  private extended = false
  constructor(readonly equipmentId: string) {}
  command(extended: boolean): void { this.extended = extended }
  getRuntimeState(): EquipmentRuntimeState { return { status: 'running', updatedAt: new Date(0).toISOString(), values: { extended: this.extended } } }
}

export function isToolPayloadCompatible(toolPayloadKg: number, robotPayloadKg: number): boolean {
  return Number.isFinite(toolPayloadKg) && Number.isFinite(robotPayloadKg) && toolPayloadKg >= 0 && toolPayloadKg <= robotPayloadKg
}
