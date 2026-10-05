/**
 * S73 anchor-driven attachment resolution.
 *
 * A `CellDefinition` instance may declare `attachTo` (a target instance plus a
 * target anchor or port). This module derives the instance's effective world
 * transform from the target's declared anchors/ports instead of its declared
 * transform, so cells compose from data (conveyor chains, fence runs,
 * tool-on-flange, pallet station on conveyor ports).
 *
 * The declared `transform` stays the compatibility fallback: when an attachment
 * is missing, incompatible or cyclic, resolution fails closed with a structured
 * diagnostic and keeps the declared transform. Nothing here changes collision,
 * signal semantics, telemetry or runtime behaviour — it only resolves placement.
 */

import { PLACEMENT_ANCHOR_ID, compatiblePorts, anchorWorldPosition } from './materialFlow'
import { createTransform } from './transforms'
import type {
  CellDefinition,
  EquipmentAnchor,
  EquipmentAttachment,
  EquipmentDefinition,
  EquipmentInstance,
  EquipmentPort,
  Transform,
  Vector3Meters,
} from './types'

export type AttachmentDiagnosticCode =
  | 'missing_attachment_target'
  | 'self_attachment'
  | 'attachment_cycle'
  | 'unknown_target_instance'
  | 'unknown_target_anchor'
  | 'unknown_target_port'
  | 'unknown_source_anchor'
  | 'incompatible_ports'
  | 'unknown_world_anchor'

export interface AttachmentDiagnostic {
  severity: 'error'
  code: AttachmentDiagnosticCode
  /** Equipment instance whose attachment failed. */
  equipmentId: string
  message: string
}

/** Effective placement of one cell equipment instance. */
export interface ResolvedEquipmentPlacement {
  equipmentId: string
  transform: Transform
  /** True when the transform was derived from a declared attachment/connection. */
  attached: boolean
  /** True when the declared transform was used because the attachment was invalid. */
  fallback: boolean
}

export interface AttachmentResolution {
  /** One entry per cell instance, in cell declaration order. */
  placements: ResolvedEquipmentPlacement[]
  byEquipmentId: ReadonlyMap<string, ResolvedEquipmentPlacement>
  diagnostics: AttachmentDiagnostic[]
}

export type EquipmentDefinitionLookup = (definitionId: string) => EquipmentDefinition | undefined

/** A cell/world-level anchor (for example the S59 infrastructure anchors). */
export interface AttachmentWorldAnchor {
  id: string
  position: Vector3Meters
}

export interface AttachmentResolutionOptions {
  /** World/infrastructure anchors an instance may attach to without a target instance. */
  worldAnchors?: readonly AttachmentWorldAnchor[]
}

/** Builds a definition lookup map from a flat definition list. */
export function definitionLookupFrom(definitions: readonly EquipmentDefinition[]): EquipmentDefinitionLookup {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]))
  return (definitionId) => byId.get(definitionId)
}

/** Deterministic anchor a port mates at when the port declares none. */
export function anchorIdForPort(port: EquipmentPort): string {
  if (port.anchorId) return port.anchorId
  if (port.kind === 'material') {
    if (port.direction === 'input') return 'anchor:in'
    if (port.direction === 'output') return 'anchor:out'
  }
  return PLACEMENT_ANCHOR_ID
}

function findAnchor(definition: EquipmentDefinition | undefined, anchorId: string): EquipmentAnchor | undefined {
  const declared = definition?.anchors?.find((anchor) => anchor.id === anchorId)
  if (declared) return declared
  // `anchor:placement` is always available: it is the instance origin using the
  // equipment SDK's base origin convention.
  if (anchorId === PLACEMENT_ANCHOR_ID || anchorId === 'anchor:placement') {
    return { id: anchorId, kind: 'placement', position: { x: 0, y: 0, z: 0 } }
  }
  return undefined
}

function portsMate(a: EquipmentPort, b: EquipmentPort): boolean {
  return compatiblePorts(a, b) || compatiblePorts(b, a)
}

function cloneTransform(transform: Transform): Transform {
  return createTransform(transform.position, transform.rotation, transform.frameId)
}

/**
 * Resolves the effective placement of every instance in a cell. Attachments are
 * resolved in dependency order; a cycle or an invalid reference fails closed to
 * the declared transform with a diagnostic.
 */
export function resolveCellAttachments(
  cell: CellDefinition,
  lookup: EquipmentDefinitionLookup,
  options: AttachmentResolutionOptions = {},
): AttachmentResolution {
  const instances = new Map(cell.equipment.map((instance) => [instance.id, instance]))
  const indexById = new Map(cell.equipment.map((instance, index) => [instance.id, index]))
  const worldAnchors = new Map((options.worldAnchors ?? []).map((anchor) => [anchor.id, anchor]))
  const byEquipmentId = new Map<string, ResolvedEquipmentPlacement>()
  const diagnostics: AttachmentDiagnostic[] = []
  const visiting = new Set<string>()

  const fail = (
    instance: EquipmentInstance,
    code: AttachmentDiagnosticCode,
    message: string,
  ): ResolvedEquipmentPlacement => {
    diagnostics.push({ severity: 'error', code, equipmentId: instance.id, message })
    const fallback: ResolvedEquipmentPlacement = {
      equipmentId: instance.id,
      transform: cloneTransform(instance.transform),
      attached: true,
      fallback: true,
    }
    byEquipmentId.set(instance.id, fallback)
    return fallback
  }

  const resolveOne = (instance: EquipmentInstance): ResolvedEquipmentPlacement => {
    const existing = byEquipmentId.get(instance.id)
    if (existing) return existing

    if (!instance.attachTo) {
      const resolved: ResolvedEquipmentPlacement = {
        equipmentId: instance.id,
        transform: cloneTransform(instance.transform),
        attached: false,
        fallback: false,
      }
      byEquipmentId.set(instance.id, resolved)
      return resolved
    }

    if (visiting.has(instance.id)) {
      return fail(instance, 'attachment_cycle', `Equipment '${instance.id}' participates in an attachment cycle; the declared transform was kept.`)
    }

    visiting.add(instance.id)
    try {
      return resolveAttached(instance, instance.attachTo)
    } finally {
      visiting.delete(instance.id)
    }
  }

  const resolveAttached = (instance: EquipmentInstance, attachment: EquipmentAttachment): ResolvedEquipmentPlacement => {
    if (!attachment.targetId.trim()) {
      return fail(instance, 'missing_attachment_target', `Equipment '${instance.id}' declares an attachment without a target instance id.`)
    }
    if (attachment.targetId === instance.id) {
      return fail(instance, 'self_attachment', `Equipment '${instance.id}' cannot attach to itself.`)
    }

    const sourceAnchorId = attachment.sourceAnchorId ?? PLACEMENT_ANCHOR_ID
    const sourceDefinition = lookup(instance.definitionId)
    const sourceAnchor = findAnchor(sourceDefinition, sourceAnchorId)
    if (!sourceAnchor) {
      return fail(instance, 'unknown_source_anchor', `Equipment '${instance.id}' declares unknown source anchor '${sourceAnchorId}'.`)
    }

    let targetPosition: Vector3Meters
    let targetRotationY: number

    if (attachment.anchorId) {
      const targetInstance = instances.get(attachment.targetId)
      const targetDefinition = targetInstance ? lookup(targetInstance.definitionId) : undefined
      const targetAnchor = findAnchor(targetDefinition, attachment.anchorId)
      if (!targetInstance) {
        return fail(instance, 'unknown_target_instance', `Equipment '${instance.id}' attaches to unknown instance '${attachment.targetId}'.`)
      }
      if (!targetAnchor) {
        return fail(instance, 'unknown_target_anchor', `Equipment '${instance.id}' attaches to unknown anchor '${attachment.anchorId}' on '${attachment.targetId}'.`)
      }
      const targetPlacement = resolveOne(targetInstance)
      targetPosition = anchorWorldPosition(targetAnchor, targetPlacement.transform)
      targetRotationY = targetPlacement.transform.rotation.y
    } else if (attachment.portId) {
      const targetInstance = instances.get(attachment.targetId)
      if (!targetInstance) {
        return fail(instance, 'unknown_target_instance', `Equipment '${instance.id}' attaches to unknown instance '${attachment.targetId}'.`)
      }
      const targetDefinition = lookup(targetInstance.definitionId)
      const targetPort = targetDefinition?.ports.find((port) => port.id === attachment.portId)
      if (!targetPort) {
        return fail(instance, 'unknown_target_port', `Equipment '${instance.id}' attaches to unknown port '${attachment.portId}' on '${attachment.targetId}'.`)
      }
      const sourcePort = attachment.sourcePortId
        ? sourceDefinition?.ports.find((port) => port.id === attachment.sourcePortId)
        : (sourceDefinition?.ports ?? []).find((port) => portsMate(targetPort, port))
      if (!sourcePort || !portsMate(targetPort, sourcePort)) {
        return fail(instance, 'incompatible_ports', `Equipment '${instance.id}' has no compatible port for '${attachment.targetId}.${attachment.portId}'.`)
      }
      const targetAnchor = findAnchor(targetDefinition, anchorIdForPort(targetPort))
      if (!targetAnchor) {
        return fail(instance, 'unknown_target_anchor', `Equipment '${instance.id}' attaches to port '${attachment.portId}', whose anchor is not declared on '${attachment.targetId}'.`)
      }
      const targetPlacement = resolveOne(targetInstance)
      targetPosition = anchorWorldPosition(targetAnchor, targetPlacement.transform)
      targetRotationY = targetPlacement.transform.rotation.y
    } else {
      // World/infrastructure anchor: provided by the resolving layer.
      const worldAnchor = worldAnchors.get(attachment.targetId)
      if (!worldAnchor) {
        return fail(instance, 'unknown_world_anchor', `Equipment '${instance.id}' attaches to unknown world anchor '${attachment.targetId}'.`)
      }
      targetPosition = worldAnchor.position
      targetRotationY = 0
    }

    const rotationY = targetRotationY + (attachment.rotationOffsetRad ?? 0)
    const oriented = anchorWorldPosition(sourceAnchor, createTransform({ x: 0, y: 0, z: 0 }, { x: 0, y: rotationY, z: 0 }))
    const resolved: ResolvedEquipmentPlacement = {
      equipmentId: instance.id,
      transform: createTransform(
        { x: targetPosition.x - oriented.x, y: targetPosition.y - oriented.y, z: targetPosition.z - oriented.z },
        { x: 0, y: rotationY, z: 0 },
        instance.transform.frameId,
      ),
      attached: true,
      fallback: false,
    }
    byEquipmentId.set(instance.id, resolved)
    return resolved
  }

  for (const instance of cell.equipment) resolveOne(instance)

  // Deterministic ordering: cell declaration order, then diagnostic code.
  diagnostics.sort((a, b) =>
    (indexById.get(a.equipmentId) ?? 0) - (indexById.get(b.equipmentId) ?? 0)
    || a.code.localeCompare(b.code))

  return {
    placements: cell.equipment.map((instance) => byEquipmentId.get(instance.id)!),
    byEquipmentId,
    diagnostics,
  }
}

/**
 * Returns a copy of the cell whose instance transforms are the resolved
 * attachment placements. Diagnostics are returned alongside so callers can fail
 * closed or surface them without throwing.
 */
export function applyCellAttachments(
  cell: CellDefinition,
  lookup: EquipmentDefinitionLookup,
  options: AttachmentResolutionOptions = {},
): { cell: CellDefinition; resolution: AttachmentResolution } {
  const resolution = resolveCellAttachments(cell, lookup, options)
  const equipment = cell.equipment.map((instance) => ({
    ...instance,
    transform: resolution.byEquipmentId.get(instance.id)!.transform,
  }))
  return { cell: { ...cell, equipment }, resolution }
}
