# ADR 0005 — Server-side assessment authority

- Status: accepted
- Sprint: S44
- Supersedes: none
- Related: [0003](./0003-identity-and-rbac.md), [0004](./0004-organizations-and-tenancy.md)

## Context

S14/S29 produced rich training reports and deterministic trace-derived assessment entirely in the
browser. S40 added the historian and S42/S43 added identity and tenancy. Instructors need durable,
comparable evidence, and a browser-local score cannot be trusted as authoritative: it can be edited,
lost or fabricated, and it is not tied to a verified learner identity.

## Decision

1. **The server owns the authoritative training record and score.** Persisted `TrainingSession`
   documents and typed `TrainingActionRecord` evidence are the durable source of truth; the
   deterministic server-side `TrainingAssessmentEngine` computes the score.
2. **The simulator reports evidence, not scores.** A local score may remain for offline use and is
   explicitly labelled local (`assessmentAuthority: local`). The client cannot inject a score or a
   learner identity.
3. **Assessment is a pure, versioned function.** Identical evidence and the same
   `TrainingSchema.ScoringRuleVersion` always produce an identical result; rule changes bump the
   version, which is stored with every assessment.
4. **Assessment is immutable except through audited corrections.** A correction appends a versioned
   `TrainingCorrectionEntry`, updates only the effective score and records the correcting subject.
5. **Training data is tenant-scoped and learner-owned.** Tenant filters are enforced in repositories;
   only the owning learner reports evidence; instructors read within their organization.
6. **No certification claim.** Every report states its educational scope and never claims
   professional competence, safety qualification or industrial readiness.

## Consequences

- The local/offline experience is preserved; server sync is additive and feature-gated
  (`Training:Enabled`).
- A sync failure is explicit and retryable; the local report is never discarded.
- The score's meaning is reproducible only together with its rule version; changing rules without
  bumping the version is treated as a defect.
- Instructor dashboards (S45) build on this API rather than on client state.
