# Fabrik3D 1.0 reference sample project

A self-contained sample project a new user can open: the CNC machine-tending **reference cell**, the
complete **pallet-processing** learning scenario, an OPC UA / MQTT / Modbus **signal mapping**, and an
example server-assessed **training-session report**.

Everything in this project is **simulated training data**. Opening it does not connect to any real
machine.

## Contents

| File | What it is |
| --- | --- |
| `project.json` | Project manifest: schema `1.0`, the scene preset and robot, the scenario id, and the relative paths of each component. |
| `reference-cell.cell.json` | The reference cell (medium six-axis robot, CNC, conveyor, pallet station) as a versioned cell file (`1.0`). Identical to the built-in *Load sample (medium)* cell. |
| `reference-cell-mapping.json` | Reference-cell signal mapping across OPC UA, MQTT and Modbus TCP, with read and write directions. |
| `training-session-report.sample.json` | An example `server-training-report` (`1.0`) with the educational disclaimer, criteria and evidence. |

## Open it

**1. Open the reference cell.** Open the simulator, choose the **CNC machine tending** scene preset,
or open the cell editor (`?view=cell-editor`) and use **Import** to load `reference-cell.cell.json`.
The built-in *Load sample (medium)* action produces the same cell.

**2. Run the reference scenario.** In the learning dock (or `?view=scenario`), select **Complete
pallet processing** and press **Run scenario**. Enable guided/step mode to pause at each activity.

**3. Inspect the signals.** Open `?view=signals` to see the 54 declared reference-cell signals with
live quality, source and timestamp.

**4. Load the mapping.** Open the mapping studio (`?view=mapping-studio`) and **Import**
`reference-cell-mapping.json`, then **Validate**. The entries reference only signals the reference
cell really declares. Do not enable a connector or writes unless you are deliberately commissioning
against an endpoint — connectors and writes are disabled by default and fail closed.

**5. Review the example report.** Open `training-session-report.sample.json` to see the shape of a
server-assessed training report (JSON export). In the product it is produced by a completed,
synced training session.

## Integrity

The project is validated automatically:

- `npm run docs:check` verifies the manifest and that every referenced file exists and parses.
- The simulator test `src/samples/referenceProject.test.ts` opens the cell with the real cell-file
  parser (asserting it equals the built-in medium sample), validates the mapping against the real
  reference-cell signal catalog, resolves the scene preset and scenario, and confirms the packaged
  mapping/report copies match the canonical samples.

## Related

- [Learner quick start](../../guides/LEARNER_QUICKSTART.md)
- [Signal mapping guide](../../guides/SIGNAL_MAPPING_GUIDE.md)
- [Reference signal catalog](../../architecture/REFERENCE_SIGNAL_CATALOG.md)
- [Architecture overview](../../architecture/OVERVIEW.md)
