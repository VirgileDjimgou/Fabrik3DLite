# Fabrik3D sprint autopilot

This document is the canonical operating contract for the bounded autonomous sprint batch. `AGENTS.md` defines the repository-wide meaning of `Start Next Sprint`; this file defines how the mechanism works, how to inspect it, how to stop it, and how it decides that a sprint may or may not be followed by another.

The batch orchestrator **orchestrates** the existing atomic sprint runner; it never replaces it. `docs/roadmap/roadmap.json` and `docs/roadmap/state.json` remain the authoritative roadmap truth, owned by `scripts/sprint-runner.mjs`.

---

## 1. User workflow

| Intent | OpenCode command | Terminal (cross-platform) | PowerShell |
|---|---|---|---|
| Start up to 10 sprints | `/start-next-sprint` | `npm run sprint:batch:start` | `npm run sprint:batch:start` |
| Exactly one sprint (atomic) | `/start-one-sprint` | `npm run sprint:next` then the sprint workflow | same |
| Queue it while OpenCode is busy | `/q /start-next-sprint` | n/a (TUI feature) | n/a |
| Inspect | `/sprint-batch-status` | `npm run sprint:batch:status` | same |
| Follow until terminal | n/a | `npm run sprint:batch:watch` | same |
| Stop gracefully | `/stop-sprint-batch` | `npm run sprint:batch:stop` | same |
| Continue after stop/gate | `/resume-sprint-batch` | `npm run sprint:batch:resume` | same |
| Resolve a human gate | `/resolve-sprint-gate <what you did>` | `npm run sprint:batch:resolve-gate -- --reason "..."` | same |
| Preview the batch | n/a | `npm run sprint:batch:dry-run` | same |
| Run orchestrator tests | n/a | `npm run sprint:batch:test` | same |

All npm commands run from the repository root and are implemented with Node.js, so they behave identically in PowerShell, `cmd.exe`, Git Bash and Unix shells. No Bash, `sed`, `grep`, `/tmp`, `chmod` or Unix signals are required.

### Normal usage

```text
User:
Start Next Sprint
```

The controlling OpenCode session then:

1. runs `npm run sprint:batch:start`, which validates preconditions and launches a **detached** batch orchestrator;
2. supervises with `npm run sprint:batch:watch` until the batch reaches a terminal state;
3. prints the final batch report.

The detached orchestrator keeps running even if the TUI is closed, the queued entry is lost, or the session is interrupted. Progress is always recoverable from `docs/roadmap/autopilot/state.json` and the logs.

### Queueing while another task runs

`opencode-queue` is configured project-locally in `.opencode/opencode.json` (`plugin: ["opencode-queue"]`), preserving all other OpenCode configuration. Tested with plugin version **0.14.0** (`/q` alias and `/queue carry` supported); OpenCode installs the npm plugin into its own cache. The OpenCode Queue front-end is a convenience layer only: it schedules the single batch command when the session becomes idle. It is never the source of correctness; the repository batch state is. If the queue plugin is unavailable, removed or breaks, the autopilot remains fully functional through the npm/terminal commands below.

- `/q /start-next-sprint` — queue one batch command; when the current task finishes, that single command starts a batch of up to 10 sprints internally. Do not enqueue ten sprint commands.
- `/queue carry` — optional fresh-session boundary supported by the plugin; correctness does not depend on it. Each sprint already runs in its own fresh `sprint-worker` child session.

### Atomic escape hatch

`/start-one-sprint` (or `/start-one-sprint` + manual work) keeps the original one-sprint behaviour: activate with `npm run sprint:next`, implement, run gates, complete, stop. It never continues to the next sprint.

---

## 2. Architecture

```text
USER
 |
 | "Start Next Sprint"  /  /start-next-sprint
 v
OPENCODE COMMAND (supervising session)
 |
 | npm run sprint:batch:start        (detached)
 v
FABRIK3D BATCH ORCHESTRATOR  scripts/sprint-batch-runner.mjs
 |
 +-- activate or resume ONE sprint via scripts/sprint-runner.mjs
 |
 +-- fresh child: node scripts/opencode-sprint-worker.mjs
 |     +-- opencode run --agent sprint-worker "<WORKER_PROMPT.md + parameters>"
 |     +-- implement ONE sprint
 |     +-- tests, quality gates, repairs, docs, sprint:complete
 |     +-- write worker-result.json + FABRIK3D_WORKER_RESULT sentinel
 |
 +-- independent verification (scripts/verify-sprint-gates.mjs + state checks)
 |
 +-- GREEN -> bookkeep, then decide whether the next sprint may start
 +-- NOT GREEN -> stop, never activate the next sprint
 |
 +-- hard bound: MAX_BATCH_SPRINTS = 10 successful completions
```

Each child worker reconstructs all context from repository truth (`AGENTS.md`, roadmap, state, `CURRENT_SPRINT.md`, brief, implementation). No conversational memory is shared between sprints. The repository is the handoff mechanism.

---

## 3. `Start Next Sprint` semantics

`Start Next Sprint`, `Lancer le prochain sprint` and equivalent requests mean:

> Start or resume the current next Fabrik3D roadmap sprint, implement it completely, validate it completely, and — only when it is successfully completed with all mandatory gates green and no human intervention required — automatically continue with the following sprint. Repeat sequentially for a maximum of **10 successfully completed** roadmap sprints.

- Only sprints completed through `npm run sprint:complete` count toward the quota.
- A resumed already-active sprint counts as one when completed.
- Failed attempts do not count.
- The hard maximum is 10; a larger `--max` value is clamped to 10 with an explicit diagnostic. `MAX_BATCH_SPRINTS` is encoded in `scripts/sprint-batch-runner.mjs` and covered by tests.
- Reaching 10 is not an error: the batch ends as `max_reached` and waits for human product review. Only a new user invocation may start the next batch.
- When comparing `--max N` (N < 10): if N sprints complete while work remains, the batch ends as `completed`; when all remaining roadmap sprints complete, it ends as `roadmap_complete`.

---

## 4. Batch state machine

Persistent state: `docs/roadmap/autopilot/state.json` (schema `1.0`).

| Status | Meaning |
|---|---|
| `idle` | No batch has run; committed initial state. |
| `running` | A sprint is being implemented/validated. |
| `validating` | Preflight, verification or gate evaluation in progress. |
| `human_required` | A real human action is required; `HUMAN_REQUIRED.json` exists. |
| `blocked_external` | Provider rate limit/quota/auth or an external system blocks progress. |
| `failed` | Unresolved failure (verification, timeout, repair exhaustion, roadmap activation). |
| `stopped` | Graceful manual STOP or resolved gate pending resume. |
| `max_reached` | Hard limit of 10 completions reached. |
| `roadmap_complete` | No roadmap sprint remains. |
| `completed` | A requested count below 10 was reached with work remaining. |

Every transition is persisted before the next action. On restart the orchestrator determines: was a batch active, which sprint was active, is the roadmap state already completed, and did a worker finish before bookkeeping.

---

## 5. Stop conditions

The batch stops immediately and never starts sprint N+1 when:

- 10 sprints completed during the batch;
- the roadmap ends;
- a sprint cannot be activated safely (roadmap/state inconsistency, missing brief, unmet dependency);
- mandatory validation fails after bounded repair attempts (1 initial + 3 meaningful repairs);
- a worker reports `HUMAN_REQUIRED`, `BLOCKED` or `FAILED` and repair cannot resolve it;
- provider rate limit, exhausted quota, authentication expiration or transport failure (`blocked_external`);
- a worker times out (2 h default, `FABRIK3D_WORKER_TIMEOUT_MS`/`--timeout`); the sprint stays active;
- the OpenCode CLI is missing or cannot be spawned (`HUMAN_REQUIRED: TOOL_FAILURE`);
- unrelated worktree changes make the intent ambiguous (`HUMAN_REQUIRED: UNRELATED_DIRTY_WORKTREE`);
- a merge conflict exists (`HUMAN_REQUIRED: MERGE_CONFLICT`);
- a manual STOP request exists (`/stop-sprint-batch`);
- an independent verification check fails even though the worker claimed `DONE` (`failed`, next sprint never started);
- another live batch holds the lock.

The automation never silently skips a sprint, never marks a failing sprint completed, and never starts N+1 while N is not unequivocally green.

---

## 6. Human gate

File: `docs/roadmap/autopilot/HUMAN_REQUIRED.json`

```json
{
  "schemaVersion": "1.0",
  "batchId": "2026-09-25-183045",
  "sprintId": "S37",
  "reasonCode": "EXTERNAL_CREDENTIAL_REQUIRED",
  "summary": "A real OPC UA server certificate must be trusted before the live integration test can continue.",
  "requiredHumanActions": ["Review certificate fingerprint", "Place approved certificate in the documented trust location"],
  "safeToResume": true,
  "createdAt": "2026-09-25T18:31:02.000Z"
}
```

While this file exists, no following sprint may start and `/start-next-sprint` refuses to launch a new batch.

Reason codes: `EXTERNAL_CREDENTIAL_REQUIRED`, `SECRET_REQUIRED`, `LICENSE_ACCEPTANCE_REQUIRED`, `HARDWARE_REQUIRED`, `EXTERNAL_SOFTWARE_INTERACTION`, `VISUAL_HUMAN_APPROVAL_REQUIRED`, `ARCHITECTURAL_DECISION_REQUIRED`, `DESTRUCTIVE_ACTION_APPROVAL`, `PRODUCTION_DEPLOYMENT_APPROVAL`, `UNRELATED_DIRTY_WORKTREE`, `MERGE_CONFLICT`, `MANUAL_CERTIFICATE_TRUST`, `MISSING_DEPENDENCY_REQUIRES_ADMIN`, `UNRESOLVED_TEST_FAILURE`, `RATE_LIMIT`, `PROVIDER_QUOTA`, `TOOL_FAILURE`, `ROADMAP_STATE_INCONSISTENT`, `OTHER`.

Resolve it with:

```powershell
npm run sprint:batch:resolve-gate -- --reason "Trusted certificate SHA-256 xx.., validated with the fixture; dotnet test green"
```

The command verifies roadmap validation, appends the resolution to `GATE_HISTORY.json`, clears the gate, and marks the batch `stopped`. Then either `/start-next-sprint` (new bounded batch) or `/resume-sprint-batch` (continue the previous batch, including the blocked active sprint — the blocked sprint is never skipped).

Routine autonomous work must **not** be gated: editing files, adding/running tests, fixing compilation, package restore, contract/asset generation, local Docker fixtures, documentation, lint fixes, disposable test data and deterministic screenshots.

---

## 7. Repair policy

- One worker launch is one attempt; repairs are bounded at `MAX_REPAIR_ATTEMPTS = 3` after the initial attempt (4 launches maximum for a sprint).
- A repair is a meaningful diagnose → modify → rerun cycle, not a trivial rerun.
- A repair attempt is only consumed for sprint failures (`FAILED`, malformed/missing worker result). Provider/transient infrastructure failures are classified separately.
- Transient infrastructure errors (ECONNRESET, ETIMEDOUT, 502/503/504, socket hang up) are retried up to 2 times with backoff; rate limit/quota/auth stop the batch as `blocked_external` without consuming repairs.
- Tests must never be weakened, skipped or deleted to obtain green status; snapshots must never be blindly updated.

---

## 8. Independent verification

A `DONE` worker is necessary but not sufficient. Before the next sprint may be activated, the orchestrator verifies from repository truth:

1. the expected sprint is the one marked `completed`;
2. `state.json` contains completion summary, evidence and timestamp;
3. exactly one new sprint completed and no previously completed sprint changed status (no silent skip/extra completion);
4. no active sprint is left unexpectedly;
5. `CURRENT_SPRINT.md` reports no active sprint;
6. dependencies of the completed sprint are completed;
7. the worker result says `DONE`, `mandatoryGatesPassed: true`, `humanRequired: false`;
8. no `HUMAN_REQUIRED.json` gate is present;
9. the repository has no unmerged git state;
10. `scripts/verify-sprint-gates.mjs` (and `sprint-runner validate`) exits green.

Full mandatory test gates are executed inside the worker and recorded in the completion evidence; the independent layer re-validates roadmap/state integrity, evidence presence, no-active-sprint, dependency and git safety, plus any project-specific checks added to `scripts/verify-sprint-gates.mjs`.

---

## 9. Locking, crash recovery and git safety

**Locking.** `docs/roadmap/autopilot/batch.lock` contains `{batchId, pid, host, createdAt}`. A live lock rejects a second batch. A lock whose PID is dead (stale) is reclaimed with a log line. Fabrik3D sprints are strictly sequential in one repository.

**Crash recovery.** State is persisted before each worker launch. On resume the orchestrator:
- reconciles a sprint that was completed before the parent could bookkeep it (verification only, never a duplicate worker run);
- treats a worker that completed the sprint and then crashed as completed after verification;
- never activates two sprints due to crash ambiguity.

**Git safety.** At batch start the orchestrator inspects `git status --porcelain`:
- unmerged entries → `HUMAN_REQUIRED: MERGE_CONFLICT`;
- unrelated uncommitted changes while no sprint is active and the batch has no sprint work of its own → `HUMAN_REQUIRED: UNRELATED_DIRTY_WORKTREE` (the changes are never touched);
- uncommitted work from the batch itself is expected and preserved across sprints;
- `git reset --hard` and equivalent destructive commands are never executed.

**No automatic commits.** The repository workflow does not commit per sprint, so the autopilot does not either. Sprint work stays in the worktree for human review and commit. `lastGreenCommit` remains `null` by design; correctness does not depend on commits.

---

## 10. Model, agent and environment configuration

The batch mechanism is model-agnostic. By default the child worker uses the project/default OpenCode agent and model.

| Variable | Default | Purpose |
|---|---|---|
| `FABRIK3D_SPRINT_AGENT` | `sprint-worker` | OpenCode agent for child workers (`.opencode/agents/sprint-worker.md`). |
| `FABRIK3D_SPRINT_MODEL` | unset (OpenCode default) | Optional `provider/model` override for the child worker. |
| `FABRIK3D_WORKER_TIMEOUT_MS` | `7200000` (2 h) | Per-sprint child worker timeout. |
| `FABRIK3D_SPRINT_AUTO` | `1` | Pass `--auto` to the child `opencode run` so ordinary repository permissions do not interrupt. Set `0` to require approvals. |
| `FABRIK3D_OPENCODE_BIN` | auto-resolved | Explicit path to the OpenCode executable when PATH resolution is unusual. |

The worker agent allows edits, bash, web tools and subagents inside the repository, denies interactive questions (a worker must never block on a prompt), and the worker prompt prohibits destructive git operations. `--auto` applies only to the bounded child run.

Each sprint uses a **fresh** `opencode run` session: strong isolation between S33 and S42, no context contamination.

---

## 11. Logs and auditability

`docs/roadmap/autopilot/logs/` (git-ignored, size-bounded) contains:

- the orchestrator log (`orchestrator.log`) with timestamps, activation, worker launch, exit code, classification, verification and stop reason;
- one log per worker attempt, including the raw child output.

The committed `state.json` records which batch ran, which sprints completed, when, with how many attempts, the stop reason, the last evidence and the human gate. Model hidden reasoning is never stored. Verbose child streaming is opt-in via `--verbose`.

---

## 12. Documentation ownership

- `AGENTS.md` is authoritative for `Start Next Sprint` / `Start One Sprint` semantics.
- This file is authoritative for autopilot mechanics.
- `.github/copilot-instructions.md`, `.github/prompts/start-next-sprint.prompt.md` and `.opencode/commands/*.md` only point to these sources and must not duplicate the orchestration specification.

---

## 13. Troubleshooting

| Symptom | Action |
|---|---|
| `start` refuses: unfinished batch | `npm run sprint:batch:resume` (preserves the completed count), or inspect with `status`. |
| `start` refuses: unresolved gate | Perform the actions in `HUMAN_REQUIRED.json`, then `resolve-gate`. |
| `start` refuses: live lock | Another batch is running. Inspect with `status`; request a stop with `sprint:batch:stop`. |
| Batch stopped as `failed` | Read `stopReason` and the worker log; the active sprint remains active and is never completed. Fix the cause and `resume`. |
| Batch stopped as `blocked_external` | Provider quota/rate limit/auth. Wait or re-authenticate, then `resume`. |
| Worker timeout | Increase `FABRIK3D_WORKER_TIMEOUT_MS`, then `resume`. |
| OpenCode CLI not found | Install OpenCode or set `FABRIK3D_OPENCODE_BIN`, then `resume`. |
| Verify failures after `DONE` | The sprint was not accepted; inspect the log and `state.json`. Resolve manually, then `resume` (the verification runs again before anything new starts). |
| Want a fresh bounded batch | Commit or stash pending work, then `/start-next-sprint`. |

---

## 14. Testing the mechanism

```powershell
npm run sprint:batch:test        # fixture roadmaps + deterministic fake workers
npm run sprint:batch:dry-run     # lists the next up-to-10 real sprints, mutates nothing
npm run sprint:validate          # existing roadmap validator
```

The test suite covers: the 10-sprint bound and an untouched 11th sprint, short roadmaps, worker failure, repair success and exhaustion, DONE-but-verification-failure, unexpected extra completion, human gate creation, resuming an active sprint, dirty worktree, merge conflict, lock rejection, parent-crash reconciliation, worker-crash reconciliation, manual stop, provider rate limit, timeouts and dry-run non-mutation.
