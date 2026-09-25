# CNC and safety visuals

The CNC machine state, workflow sequencing and deterministic collision checks stay
outside the renderer. Since S39 the reference cell's CNC visuals are driven by a
single deterministic cycle machine, so no animation can contradict the exposed
signals.

## Deterministic cycle machine

`src/simulation/CncCycleMachine.ts` owns the full machining cycle:

```text
IDLE → LOAD_OPENING → LOAD_READY → DOOR_CLOSING → CLAMPING
     → SPINDLE_RAMP_UP → FEED → SPINDLE_RAMP_DOWN → UNCLAMPING
     → CYCLE_COMPLETE → UNLOAD_OPENING → UNLOAD_READY → IDLE
```

- It is framework-free and advanced by `update(dt)`; timings are explicit SI
  seconds and the feed phase is rescaled so the whole machining cycle matches the
  component's `machiningDuration` prop.
- Interlocks: the clamp starts only after the door is fully closed, the spindle
  ramps up only after clamping, the door cannot reopen while cutting, and an
  emergency stop or latched fault refuses commands and freezes the cycle until an
  explicit `reset()`.
- The coarse `IDLE | LOADING | MACHINING | UNLOADING` state kept for the pallet
  workflow is derived from the fine-grained phase; existing workflows and
  scenario files keep loading unchanged.
- `cnc-1.CycleStep` (0…9) and `cnc-1.SpindleSpeed` / `FeedRate` / `SpindleAtSpeed`
  / `FeedActive` / `CoolantOn` / `DoorLocked` / `FixtureClamped` / `PartPresent`
  report the same truth the visuals render. The map from visual node to runtime
  state and signal is declared in `equipment/visuals/referenceCellVisualMap.ts`
  and enforced by a consistency test.

## Visual nodes

`equipment/visuals/cncMachineVisual.ts` builds one instance-owned CNC visual and
exposes semantic nodes (`door:loading`, `spindle:main`, `fixture:chuck`,
`fixture:jaw-left`, `fixture:jaw-right`, `axis:feed`, `coolant:nozzle`,
`signal:panel-screen`, `signal:stack-light`, …). `LargeCNCMachine.vue` is a thin
renderless wrapper: it steps the cycle machine with the animation-loop delta and
applies the snapshot to the visual. Detailed meshes are deliberately not
collision authorities; the analytic cell collision models are unchanged.

## Safety visuals

`SafetyGuardSystem` renders physical fences, posts, mesh panels, kick plates, an
interlocked-gate representation and light-curtain markers separately from the
translucent diagnostic corridor. `IndustrialInfrastructureSystem` renders the
controller/PLC cabinets, cable tray, operator pedestal, E-stop, scanner and stack
lights. Both map to the CNC cycle state, connection state and the simulated
safety interlocks (`safe`, `running`, `warning`, `fault`, `offline`); they are
educational status cues, not a certified safety function.

The simulated `SafetyInterlockModel` sequences recovery: an E-stop unlatches only
when the light curtain and scanner are clear and the gate is closed, and the
reset is explicitly refused (with a reason) otherwise. The documented
robot/CNC loading opening and analytic collision corridor remain defined by the
current safety world. If a future CNC asset fails to load, the procedural CNC
continues to provide the same functional workflow.
