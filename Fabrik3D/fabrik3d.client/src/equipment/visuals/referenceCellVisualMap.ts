/**
 * Reference-cell visual ↔ signal map (S39).
 *
 * Every state-bearing visual node in the CNC machine-tending cell is declared
 * here together with the runtime state field it renders and the canonical
 * signal that reports the same truth. The map keeps visuals demonstrably
 * signal-driven: a test asserts full coverage and that every referenced signal
 * exists in the reference-cell catalog. Decorative geometry is intentionally
 * absent from the map.
 */

export type VisualOwner = 'cnc' | 'robot' | 'safety' | 'conveyor' | 'infrastructure' | 'dressing'

export interface VisualSignalBinding {
  /** Three.js semantic node name (`userData.semanticId`). */
  node: string
  owner: VisualOwner
  /** Runtime field or snapshot property that drives the node. */
  stateSource: string
  /** Canonical signal reporting the same runtime state, when one exists. */
  signalId?: string
  description: string
}

export const REFERENCE_CELL_VISUAL_BINDINGS: readonly VisualSignalBinding[] = [
  { node: 'door:loading', owner: 'cnc', stateSource: 'cnc.doorPosition', signalId: 'cnc-1.DoorOpen', description: 'Sliding loading door position; open/closed feedback signals mirror it.' },
  { node: 'spindle:main', owner: 'cnc', stateSource: 'cnc.spindleSpeed', signalId: 'cnc-1.SpindleSpeed', description: 'Spindle rotation follows the ramped simulated spindle speed.' },
  { node: 'fixture:chuck', owner: 'cnc', stateSource: 'cnc.fixtureClamped', signalId: 'cnc-1.FixtureClamped', description: 'Fixture body shows the clamp state reported by the signal.' },
  { node: 'fixture:jaw-left', owner: 'cnc', stateSource: 'cnc.fixtureClamped', signalId: 'cnc-1.FixtureClamped', description: 'Left jaw travel visualises clamp/unclamp.' },
  { node: 'fixture:jaw-right', owner: 'cnc', stateSource: 'cnc.fixtureClamped', signalId: 'cnc-1.FixtureClamped', description: 'Right jaw travel visualises clamp/unclamp.' },
  { node: 'axis:feed', owner: 'cnc', stateSource: 'cnc.feedActive', signalId: 'cnc-1.FeedActive', description: 'Feed table advances only while the feed-active signal is true.' },
  { node: 'coolant:nozzle', owner: 'cnc', stateSource: 'cnc.coolantOn', signalId: 'cnc-1.CoolantOn', description: 'Coolant indicator is driven by the coolant-on signal.' },
  { node: 'signal:panel-screen', owner: 'cnc', stateSource: 'cnc.phase', signalId: 'cnc-1.CycleStep', description: 'Operator panel reflects the active cycle step.' },
  { node: 'signal:stack-light', owner: 'safety', stateSource: 'safety.visualState', signalId: 'safety-zone-1.SafetyHealthy', description: 'Green stack lamp reflects the simulated healthy/idle state.' },
  { node: 'signal:stack-light-amber', owner: 'safety', stateSource: 'safety.visualState', signalId: 'cnc-1.Ready', description: 'Amber lamp reflects transitional loading/unloading states.' },
  { node: 'signal:stack-light-red', owner: 'safety', stateSource: 'safety.visualState', signalId: 'cnc-1.CycleRunning', description: 'Red lamp reflects the running machining cycle.' },
  // S55 hero-cell dressing. These nodes are render-only environment detail;
  // they are bound to the same authoritative runtime state as the CNC/robot
  // visuals and never introduce visual-only server truth.
  { node: 'motor:chip-conveyor', owner: 'dressing', stateSource: 'cnc.coarseState', signalId: 'cnc-1.CycleRunning', description: 'Chip conveyor is active while the machining cycle runs.' },
  { node: 'fixture:buffer:1', owner: 'dressing', stateSource: 'conveyor.rawSlotsRemaining', signalId: 'conveyor-1.RawSlotsRemaining', description: 'Work-in-process buffer reflects remaining raw slots.' },
  { node: 'fixture:buffer:2', owner: 'dressing', stateSource: 'conveyor.machinedSlots', signalId: 'conveyor-1.MachinedSlots', description: 'Work-in-process buffer reflects completed machined slots.' },
  { node: 'signal:worklight:1', owner: 'dressing', stateSource: 'safety.visualState', signalId: 'safety-zone-1.SafetyHealthy', description: 'Work lighting follows the simulated healthy state.' },
  { node: 'signal:worklight:2', owner: 'dressing', stateSource: 'safety.visualState', signalId: 'safety-zone-1.SafetyHealthy', description: 'Work lighting follows the simulated healthy state.' },
]

/** Semantic nodes covered by the map, excluding the container id itself. */
export const MAPPED_VISUAL_NODES: readonly string[] = REFERENCE_CELL_VISUAL_BINDINGS.map((binding) => binding.node)
