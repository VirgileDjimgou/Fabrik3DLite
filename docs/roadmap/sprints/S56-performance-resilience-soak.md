# S56 - Performance, resilience, recovery and soak hardening

## Outcome

Move validation from functional correctness to reproducible sustained reliability through hardware-aware GPU measurements, larger SignalR load, automated soak tooling and an explicit recovery matrix.

## Motivation

S49 established baseline observability and a 25-client measurement. The product now needs measured hero-cell performance and controlled failure/recovery behavior over longer runs. Evidence must distinguish automated, software-rendered and real hardware results.

## Current-state assumptions to verify

- Inspect S49 performance/load scripts, observability metrics, Playwright/browser launch flags and recorded reference hardware.
- Inventory reconnect/retry policies for MongoDB, SignalR and OPC UA/MQTT/Modbus.
- Establish repeatable baseline runs for the S55 hero cell and identify CI versus manual/reference capabilities.

## Scope

- Create reproducible hardware-acceleration checks and hero-cell performance runs at 1920×1080 and, where practical, 2560×1440 for Quality/Balanced/Performance.
- Record FPS, mean frame time, p50/p95/p99, draw calls, triangles, textures, load time, JS heap where available and renderer memory.
- Define developer/reference and mid-range-laptop target classes without promising untested hardware.
- Extend deterministic SignalR/load harnesses to 50 clients and 100 where the environment allows, recording connection/broadcast latency, loss, reconnect storms, memory and CPU.
- Add a CI-friendly short soak plus a documented 4–8 hour manual/reference soak.
- Execute a failure/recovery matrix for persistence, orchestrator, clients, protocols, historian and external authority.
- Derive regression budgets from measurements.

## Non-goals

- No fabricated GPU evidence from software/headless rendering and no blanket performance claim.
- No architectural rewrite or weakening of correctness/safety for benchmark numbers.
- No mandatory real-hardware gate unless hardware acceleration/manual soak cannot be verified automatically.

## Architecture boundaries

- Instrumentation observes but does not redefine server, simulator, HMI or connector authority.
- Protocol adapters remain boundaries and reconnect fail-closed.
- No recovery path fabricates telemetry, silently takes authority or writes from replay.

## Harness and implementation changes

- Add deterministic scenario seeds, workload profiles, sample windows, environment metadata and machine-readable results.
- Verify acceleration/renderer identity before labeling a run hardware-accelerated.
- Track timers, subscriptions, connections, GPU assets, heap, historian/Mongo growth and connector retry counters over time.
- Keep long manual runs optional in ordinary CI but document exact commands, prerequisites and acceptance thresholds.

## Failure and recovery matrix

- MongoDB unavailable/restart; orchestrator restart; simulator/HMI reload; SignalR interruption/reconnect storm.
- MQTT, OPC UA and Modbus disconnect/reconnect; external controller disappearance/authority loss.
- Historian write failure, retained/backpressure behavior and recovery.
- For each case define detected signal, user-visible degraded state, data-loss semantics, retry/backoff, authority/safety behavior and recovery proof.

## Backward compatibility

- Test harnesses and telemetry are additive/disableable and do not change production behavior by default.
- Existing metrics and dashboards remain readable or receive a documented version migration.

## Failure and degraded modes

- Unverified GPU/long-soak capability becomes an explicit manual/HUMAN_REQUIRED evidence gate, not a pass.
- A load limit produces bounded rejection/backpressure and actionable telemetry rather than silent loss.
- Recovery preserves correlation, tenant scope and control-authority rules.

## Testing strategy

- Unit tests for percentiles/budget evaluation/result schema and resource-leak detection logic.
- Deterministic 50-client and conditional 100-client SignalR/load tests with zero-loss expectations where specified.
- CI short soak with repeated scene loads/reconnects and leak assertions.
- Automated recovery cases using local fixtures; manual/reference checklist for genuine external dependencies.
- Regression suite and all applicable `QUALITY_GATES.md` checks.

## Performance requirements

- Budgets are adopted only after repeat runs establish variance and reference environment.
- Store raw/summary measurements with date, browser/runtime, renderer, resolution, quality profile and hardware class.
- Treat p95/p99 and sustained resource growth as first-class, not FPS average alone.

## Security considerations

- Load/soak tooling uses non-production credentials/data, bounds resource consumption and is disabled in deployed production images unless explicitly enabled.
- Diagnostic artifacts redact secrets, tokens and tenant/private data.

## Documentation changes

- Update performance/observability/runbooks with commands, environments, measured budgets, recovery matrix, manual soak procedure and limitations.

## Acceptance criteria

1. Each quality profile has reproducible hero-cell measurement procedures and honest acceleration classification.
2. The 50-client load passes; 100-client capability is measured where supported or explicitly bounded.
3. A CI short soak detects resource growth/reconnect leaks and a 4–8 hour reference procedure exists.
4. Every failure-matrix case has explicit expected behavior and automated evidence where fixtures suffice.
5. Regression budgets derive from recorded measurements and applicable gates pass.

## Evidence expected for completion

Record raw and summarized profile/load/soak results, renderer/hardware verification, recovery transcripts, resource-growth graphs/tables and all applicable gates. Manual/HUMAN_REQUIRED items must remain visibly unresolved until performed.

## Rollback and failure containment

Performance instrumentation remains disableable. Regressing optimizations are reverted independently; recovery changes must fail closed and retain audit/history rather than hiding data loss.

## Follow-up items

- Threat modeling, deployment and repository lifecycle hardening are S57.
