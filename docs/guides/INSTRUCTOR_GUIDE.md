# Instructor guide

Status: verified against the 1.0 build. All learner activity, faults and scores describe **simulated**
training exercises and never certify professional competence.

This guide covers running a class on Fabrik3D: preparing learning material, supervising a session,
reviewing results and correcting an assessment. It complements the deeper
[instructor dashboard architecture](../architecture/INSTRUCTOR_DASHBOARD.md) and
[training sessions](../architecture/TRAINING_SESSIONS.md) documents.

## Roles

Instructors hold the **Instructor** role (policy `Instruct`). The role is enforced **server-side**:
the `/instructor` surface is hidden from other roles and the API rejects unauthorized calls. Learner
ownership and tenant (organization) boundaries are enforced in server queries, so an instructor
only sees learners in their own organization and classes.

| Capability | Policy | Notes |
| --- | --- | --- |
| Read training sessions and reports in your organization | `Train` / `Instruct` | Scoped by membership. |
| Open the instructor dashboard | `Instruct` | `/instructor`; server is the authority. |
| Append an audited assessment correction | `Instruct` | The computed score is preserved; corrections are additive and audited. |
| Restart a session for a learner | `Instruct` | Audited; restart semantics are documented in the dashboard doc. |
| Inject simulated faults for an exercise | `Instruct` | Fault lab is authority-gated and never writes to a connector. |

## 1. Prepare the exercise

1. Choose the scene preset that matches the lesson. The reference cell preset
   (`cnc-machine-tending`) carries the **Complete pallet processing** reference scenario; the other
   presets cover sorting, palletizing, assembly/inspection and safety.
2. Decide how much guidance to allow. Guided/step mode records hints, which the scoring engine
   weighs through the *hint discipline* criterion.
3. For abnormal-condition exercises, pre-select the simulated faults to inject. Faults are applied
   as overlays on published signals and never mutate the canonical signal definitions.
4. Optionally assign the run as a class/cohort activity through the organizations API
   (`/api/organizations/classes`, `/api/organizations/resources`), so results are grouped for review.

## 2. Run the session

1. Have each learner open the simulator with their own identity and complete the scenario. A
   synced run is persisted as a `TrainingSession`; an offline run stays local and is labelled as
   such.
2. Watch live execution through the HMI and the instructor dashboard: activity progress, expected
   actions, faults, hints, safety violations and recovery actions.
3. To create an incident deliberately, use the simulated fault lab (`?view=fault-lab`) or the HMI.
   Explain that the E-stop and interlocks are simulated teaching aids, not certified safety
   functions.

## 3. Review results

The **instructor dashboard** (`/instructor`) aggregates sessions and metrics. The dashboard doc
defines the metrics (v1.0) and their aggregation bounds. From a session you can open its report:

- **Assessment authority** is shown explicitly: `local` for an offline report, `SERVER-ASSESSED`
  for a persisted server-computed score.
- The scoring rule version and software version are recorded, so identical evidence with the same
  rule version yields an identical result.
- Per-criterion results (completion, expected actions, simulated fault recovery, safety compliance,
  hint discipline) are shown with earned/possible points and the evidence that produced them.
- Every report carries the educational disclaimer. Do not present it as a qualification.

## 4. Correct an assessment when necessary

If a session's evidence does not reflect what happened (for example a simulator disconnect), append
a **correction** instead of editing the computed score. Corrections are additive, audited with the
authenticated subject, and preserve the original computed result. You can also restart a session for
a learner; restarts are audited.

## 5. Multi-class and multi-organization setups

Organizations, memberships, classes/cohorts and resource assignments are modeled server-side. An
instructor's view is always scoped to the active organization resolved from their membership; a
forged or ambiguous organization context fails closed. See
[Organizations and tenancy](../architecture/ORGANIZATIONS_AND_TENANCY.md).

## Troubleshooting a session

- **Learner report says `local`** — the simulator was offline or not authenticated; the run was not
  persisted. Re-run with a valid identity and connection to get a `SERVER-ASSESSED` report.
- **Sync failure is explicit and retryable** — the local report remains valid and labelled `local`.
- **No learners appear** — verify the class membership and that the learners and instructor share an
  organization.

## Related documents

- [Instructor dashboard](../architecture/INSTRUCTOR_DASHBOARD.md)
- [Training sessions and assessment](../architecture/TRAINING_SESSIONS.md)
- [Fault lab guide](FAULT_LAB_GUIDE.md)
- [Learning assessment and reports](../architecture/LEARNING_ASSESSMENT_REPORTS.md)
- [Limitations](../operations/LIMITATIONS.md)
