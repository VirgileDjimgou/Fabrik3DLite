# Learner quick start

Status: verified against the 1.0 build. Everything you see is a **simulation**; nothing here
controls real machinery.

This guide gets a first-time learner from opening Fabrik3D to completing a guided scenario. For a
ready-made cell, scenario, mapping and example report, open the
[1.0 reference sample project](../samples/fabrik3d-1.0-reference-project/README.md).

## 1. Open the simulator

| Environment | Simulator URL |
| --- | --- |
| Public demo | <https://fabrik3d.patrickdjimgou.dev> |
| Local Docker stack | <http://localhost:8081> |
| Local dev server | the Vite URL printed by `npm run dev` in `Fabrik3D/fabrik3d.client` |

The simulator does **not** require a login to run the offline local demo. The mode bar shows
`OFFLINE LOCAL DEMO - NOT AUTHENTICATED` and `LOCAL MODE — NO SERVER JOB CLAIMED`: that is an
explicitly offline training mode. When the backend is connected and a job is claimed the bar reads
`ONLINE — ORCHESTRATED BY SERVER`.

## 2. Choose a scene

Use the scene selector to pick one of the five built-in presets. Each preset shows whether it is
**Simulation ready** or **Layout only**, how many scenarios it carries, a default scenario brief
with a complexity label, and a `SIMULATED DATA — training only` notice.

| Preset | Focus |
| --- | --- |
| `cnc-machine-tending` (default) | The deep CNC machine-tending reference cell. |
| `vision-sorting` | Conveyor, photoeye, reader, diverter and bins. |
| `robot-palletizing` | Palletizing with vacuum gripper and pallet buffers. |
| `assembly-inspection` | Assembly fixture, clamp, reader and outfeed. |
| `robot-safety-training` | Gate, area scanner and emergency stop. |

## 3. Run a guided scenario

1. Open the learning dock (bottom panel). The scenario runner is also available directly at
   `?view=scenario`.
2. Select a scenario. Beginners should start with **Robot axes**, then **Coordinate frames**. The
   flagship reference scenario is **Complete pallet processing**.
3. Press **Run scenario** and follow the instruction for each activity. Activities advance
   automatically when the expected simulated event is observed.
4. Enable **Guided / step mode** to pause at each logical checkpoint. Use *Advance*, *Previous
   explanation*, *Restart* and the speed control. Guided mode records hints so the report reflects
   how much help you used.
5. On the reference cell, the operator controls (Start / Stop / Reset) drive the same workflow as
   the guided run.

## 4. Read your report

When a run finishes, open the **Learning report** panel. It shows:

- whether the assessment is `local` (offline) or `SERVER-ASSESSED` (persisted and computed
  server-side);
- the score, completion, expected-vs-observed actions, simulated faults, hints and safety
  violations;
- JSON/HTML export buttons.

The report states its educational scope: it describes a simulated exercise and does **not** certify
professional competence, safety qualification or industrial readiness.

## 5. Try a fault (optional)

Open `?view=fault-lab` or the expert diagnostics dock to inject a typed simulated fault, watch it
propagate through the signals, then clear it and confirm deterministic recovery. See the
[Fault lab guide](FAULT_LAB_GUIDE.md).

## 6. Change language

Use the language selector in the mode bar. The simulator ships **English, French and German**; the
choice is remembered locally.

## Operator HMI (optional)

The [operator HMI](../../README.md) is a separate surface for creating and supervising jobs. Open it
at <https://fabrik3d-hmi.patrickdjimgou.dev> (demo), <http://localhost:8082> (local Docker) or the
HMI dev-server URL. Learners normally only need the simulator; the HMI is the surface an operator or
instructor uses to create jobs and confirm actions.

## Where to go next

- [Instructor guide](INSTRUCTOR_GUIDE.md) — run a class and review reports.
- [Fault lab guide](FAULT_LAB_GUIDE.md) — abnormal-condition exercises.
- [Limitations](../operations/LIMITATIONS.md) — what the simulator is and is not.
