# S28 - Material flow, tooling, and smart equipment

## Outcome

Provide the reusable equipment needed to construct credible material-handling chains and robot applications without hardcoded component coupling.

## Scope

- Add straight and curved conveyor modules, roller transfer, pneumatic stop, diverter/pusher, photoelectric sensor, barcode/RFID reader, infeed/outfeed buffers, bins, racks, pallets, and cartons.
- Add two-finger gripper, vacuum gripper, ISO flange/TCP marker, tool changer, tool rack, part-presence and grip/pressure sensors.
- Add reusable pallet nests, fixtures, clamps, chuck/workholding adapters, and configurable parts.
- Connect equipment through typed material, signal, energy, data, and safety ports plus semantic snapping anchors.
- Introduce small deterministic runtime adapters only for sensors and actuators used by scenarios; visual-only equipment remains static.
- Extend editor placement with compatible-port highlighting and predictable anchor snapping while preserving manual numeric transforms.
- Add reusable status animation bindings for belts, cylinders, grippers, sensors, and stack lights.

## Tests and gates

- Port compatibility, anchor transform, conveyor transfer, sensor transition, actuator state-machine, and tool/payload compatibility tests.
- Editor snapping, persistence, undo/redo, and malformed-connection tests.
- Visual and performance regression for a representative material-flow chain.
- Full simulator and applicable workspace baseline gates.

## Acceptance criteria

- A conveyor chain and robot tool setup can be assembled from catalog entries.
- Material transfers and signals are deterministic and observable.
- A visual asset never becomes the collision or behavior source of truth.
- Missing smart assets fall back without breaking the scene.

## Non-goals

- No full rigid-body physics requirement or automatic behavior inference from meshes.
