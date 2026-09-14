# Phase 24 — Compliance & Data Privacy (Issues 461–480)

Builds `packages/compliance`: GDPR-style data export/erasure, data classification,
consent tracking, retention policy enforcement, and a privacy-by-design review
process, closing the loop Issue 054 opened and drawing on Phase 10's audit trail.

---

### Issue 461 — Data classification taxonomy & field-level tagging
**Description:** Define a `DataClassification` enum (`public`, `internal`, `sensitive`, `restricted`/PII) and a registry mapping each Prisma field across `identity`, `credentials`, `verification`, and `governance` schemas to a classification tag, loaded at startup and validated for completeness.
**Objective:** Give every later compliance workflow (export, erasure, retention) a single source of truth for which fields are personal data, rather than re-deriving it ad hoc per feature.
**Acceptance Criteria:** Every column in scoped Prisma models has an explicit classification; startup fails fast if a new column is added without one; registry is queryable by model+field.
**Dependencies:** 046, 052
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/domain/data-classification.ts`, `packages/compliance/infrastructure/classification-registry.ts`, `prisma/schema.prisma` (doc comments)
**Tests Required:** Unit tests for registry completeness check; a CI check that fails on unclassified new columns.
**Documentation Required:** `docs/privacy/data-classification.md`
**Educational Notes:** Why classification must be a first-class, machine-checkable artifact rather than tribal knowledge — GDPR/CCPA obligations attach to *personal data*, and you can't protect what you haven't identified.
**Deliverables:** Enforced, queryable data classification registry.

---

### Issue 462 — `DataSubject` aggregation across bounded contexts
**Description:** `DataSubjectResolver` that, given a user id, walks the classification registry (Issue 461) to enumerate every row across every context (identity, credentials, sessions, verification, governance, audit metadata) belonging to that person.
**Objective:** Provide the single traversal primitive that both export (463) and erasure (466) build on, so "find everything about this person" is solved once.
**Acceptance Criteria:** Resolver returns a complete, typed manifest of records per context; new contexts are picked up automatically once they register classified models; manifest generation is read-only (no side effects).
**Dependencies:** 461
**Estimated Complexity:** L
**Files Affected:** `packages/compliance/application/data-subject-resolver.ts`
**Tests Required:** Integration tests seeding data across multiple contexts and asserting a complete manifest.
**Documentation Required:** `docs/privacy/data-subject-resolution.md`
**Educational Notes:** The tension between bounded-context isolation and a cross-cutting subject-access requirement — resolved by driving traversal off a shared registry instead of granting compliance code direct access to every context's internals.
**Deliverables:** Tested cross-context data-subject resolver.

---

### Issue 463 — GDPR data export use case (Article 15/20)
**Description:** `ExportUserData` use case producing a structured, machine-readable (JSON) export of a data subject's records via Issue 462's resolver, respecting classification (excluding `restricted`-but-non-personal system fields like internal risk scores unless explicitly in scope).
**Objective:** Satisfy the right-to-access and data-portability obligations with a single, auditable code path.
**Acceptance Criteria:** Export includes all personal-data fields per the classification registry; excludes other users' data even in shared records (e.g. shared org resources); output is versioned/schema-stamped for future compatibility.
**Dependencies:** 462
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/application/use-cases/export-user-data.ts`
**Tests Required:** Unit tests (fakes) for inclusion/exclusion correctness; integration test for a multi-context user producing a complete export.
**Documentation Required:** `docs/privacy/data-export.md`
**Educational Notes:** GDPR Article 15 (access) vs. Article 20 (portability) — same underlying data, different legal purpose, and why the export format choice (structured JSON) matters for portability specifically.
**Deliverables:** Tested export use case.

---

### Issue 464 — Export request API, async job & delivery
**Description:** Fastify endpoint accepting an authenticated export request, enqueuing an async job (given export size/latency), and delivering the completed export via a time-limited signed download link (reusing Phase 11's token/notification patterns where applicable).
**Objective:** Make export practically usable at production scale rather than a synchronous blocking call.
**Acceptance Criteria:** Endpoint returns a request id immediately; job processes asynchronously; download link expires after a configured window; requester identity re-verified before download.
**Dependencies:** 463, and Phase 05 session verification
**Estimated Complexity:** M
**Files Affected:** `apps/api/routes/compliance/export.ts`, `packages/compliance/infrastructure/jobs/export-job.ts`
**Tests Required:** Integration tests for request→job→download flow, including expiry and re-auth.
**Documentation Required:** `docs/privacy/data-export.md` API section.
**Educational Notes:** Why large personal-data exports shouldn't be synchronous HTTP responses — job queues, backpressure, and secure delivery of a sensitive payload.
**Deliverables:** Tested export request/delivery flow.

---

### Issue 465 — Erasure eligibility & legal-hold checks
**Description:** `ErasureEligibilityPolicy` evaluating whether a data subject's erasure request can proceed immediately, given active legal holds, open disputes, or records under a mandatory retention period (Issue 470), returning either "eligible," "deferred until <date>," or "denied with reason."
**Objective:** Prevent Issue 054's soft-delete from being treated as sufficient GDPR erasure when legal retention obligations conflict with an erasure request — this is the reconciliation Issue 054 explicitly foreshadowed.
**Acceptance Criteria:** Records under an active retention/legal hold block immediate erasure with a clear reason; eligible requests pass through unblocked; policy decisions are themselves logged.
**Dependencies:** 054, 470
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/application/erasure-eligibility-policy.ts`
**Tests Required:** Unit tests for each outcome (eligible/deferred/denied) with fixture holds.
**Documentation Required:** `docs/privacy/erasure.md` eligibility section.
**Educational Notes:** GDPR Article 17(3) exemptions (legal compliance, legal claims) — the right to erasure is not absolute, and this policy is where that nuance lives in code instead of being handled ad hoc by support staff.
**Deliverables:** Tested eligibility policy.

---

### Issue 466 — Hard-erasure use case for eligible records
**Description:** `EraseUserData` use case that, for eligible requests, performs true irreversible deletion or field-level anonymization (per classification) across every context identified by Issue 462's resolver, upgrading Issue 054's soft-delete to real erasure once eligibility clears.
**Objective:** Deliver the "real erasure eventually" that Issue 054 deferred, now that retention/legal-hold context exists to gate it safely.
**Acceptance Criteria:** All classified personal-data fields for an eligible subject are deleted or irreversibly anonymized; non-personal referential data (e.g. an order's total amount) is preserved with the subject reference anonymized, not cascade-deleted; operation is transactional per context with a rollback-safe checkpoint.
**Dependencies:** 462, 465
**Estimated Complexity:** L
**Files Affected:** `packages/compliance/application/use-cases/erase-user-data.ts`, `packages/identity/infrastructure/persistence/prisma-user-repository.ts`
**Tests Required:** Integration tests verifying irreversible deletion, referential integrity preservation, and rejection of ineligible requests.
**Documentation Required:** `docs/privacy/erasure.md` execution section.
**Educational Notes:** Anonymization vs. deletion as two flavors of "erasure" — why preserving an anonymized referential row is often required (financial/audit obligations) even when the person's identity must be unrecoverable.
**Deliverables:** Tested hard-erasure use case.

---

### Issue 467 — Erasure request API & confirmation workflow
**Description:** Fastify endpoints for submitting an erasure request, viewing its eligibility status, and a final confirmation step (re-authentication + explicit confirmation) before Issue 466 executes, plus an admin override path for governance staff handling exemption cases.
**Objective:** Give data subjects a self-service erasure path with the friction appropriate to an irreversible action, and give admins a path for the deferred/denied cases from Issue 465.
**Acceptance Criteria:** Erasure requires re-authentication immediately before execution; denied/deferred requests surface the reason to the requester; admin override requires elevated permission (Phase 07 RBAC) and is itself audited.
**Dependencies:** 465, 466, and Phase 07 RBAC
**Estimated Complexity:** M
**Files Affected:** `apps/api/routes/compliance/erasure.ts`
**Tests Required:** Integration tests for the full request→confirm→execute flow and the admin-override path.
**Documentation Required:** `docs/privacy/erasure.md` API section.
**Educational Notes:** Confirmation friction as a deliberate UX/security tradeoff for irreversible operations — same principle as destructive-action confirmation elsewhere, applied to a legal-consequence action.
**Deliverables:** Tested erasure request workflow.

---

### Issue 468 — Erasure audit trail & tombstone record
**Description:** On erasure execution, emit an `AuditEvent` (Phase 10) containing the erasure request id, timestamp, eligibility decision, and a non-identifying tombstone summary (counts of records erased per context) — never the erased data itself.
**Objective:** Prove erasure happened, for regulatory accountability, without recreating the very personal-data record that was just erased.
**Acceptance Criteria:** Audit event contains no personal-data fields; tombstone is queryable by request id; audit event survives even though the underlying user record does not.
**Dependencies:** 184, 466
**Estimated Complexity:** S
**Files Affected:** `packages/compliance/application/erasure-audit-emitter.ts`
**Tests Required:** Integration test asserting audit event shape post-erasure and absence of PII in it.
**Documentation Required:** `docs/privacy/erasure.md` accountability section.
**Educational Notes:** The paradox of proving deletion happened without retaining what was deleted — solved by recording metadata about the event, not the erased content.
**Deliverables:** Tested erasure audit/tombstone mechanism.

---

### Issue 469 — Retention policy domain model
**Description:** `RetentionPolicy` value object per data category (classification tag + optional context override) defining a retention period, trigger event (e.g. "account closure," "last activity"), and post-expiry action (`anonymize` | `hard-delete` | `flag-for-review`).
**Objective:** Make retention rules explicit, versioned configuration rather than scattered magic numbers in cleanup scripts.
**Acceptance Criteria:** Policies resolve per classification tag with context-level override; policy set is Zod-validated at startup; conflicting/overlapping policies fail validation with a clear error.
**Dependencies:** 461
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/domain/retention-policy.ts`, `packages/config/schema.ts`
**Tests Required:** Unit tests for policy resolution, override precedence, and validation failures.
**Documentation Required:** `docs/privacy/retention-policies.md`
**Educational Notes:** Retention as a two-sided compliance obligation — data must be kept *at least* as long as legal/business need requires, and *no longer* than privacy law permits, and both bounds live in the same policy object.
**Deliverables:** Tested retention policy model.

---

### Issue 470 — Retention enforcement scheduled job
**Description:** A scheduled job (reusing Phase 18's job-scheduling infrastructure if present, else a documented cron entry point) that scans records against Issue 469's policies and applies the post-expiry action, respecting Issue 465's legal-hold gate.
**Objective:** Turn retention policy from documentation into an enforced, ongoing system behavior instead of a manual cleanup task.
**Acceptance Criteria:** Expired records are anonymized/deleted/flagged per policy; records under legal hold are skipped and re-queued; job is idempotent and safe to re-run.
**Dependencies:** 465, 469
**Estimated Complexity:** L
**Files Affected:** `packages/compliance/infrastructure/jobs/retention-enforcement-job.ts`
**Tests Required:** Integration tests covering each post-expiry action, legal-hold skip, and idempotent re-run.
**Documentation Required:** `docs/privacy/retention-policies.md` enforcement section.
**Educational Notes:** Idempotency as a requirement for any scheduled data-mutating job — a retry after a partial failure must not double-anonymize or error on already-processed records.
**Deliverables:** Tested, scheduled retention enforcement.

---

### Issue 471 — Legal-hold management
**Description:** `LegalHold` entity and CRUD use cases (create/release, scoped to a data subject or resource) that Issue 465's eligibility policy and Issue 470's enforcement job both consult, restricted to governance-role admins.
**Objective:** Give compliance/legal staff an operational lever to suspend erasure/retention enforcement for records under litigation or investigation, without code changes.
**Acceptance Criteria:** Only governance-permitted roles can create/release holds; active holds are visible in admin tooling; hold creation/release is audited; expired holds without explicit release do not silently lapse (require explicit action or documented auto-expiry).
**Dependencies:** 465, and Phase 07 RBAC
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/domain/legal-hold.ts`, `packages/compliance/application/use-cases/manage-legal-hold.ts`
**Tests Required:** Unit tests for permission gating; integration tests for hold lifecycle and its effect on eligibility/enforcement.
**Documentation Required:** `docs/privacy/legal-holds.md`
**Educational Notes:** Legal holds as a cross-cutting override on otherwise-automated data lifecycle rules — a real-world example of automation needing an explicit, audited human-in-the-loop escape hatch.
**Deliverables:** Tested legal-hold management.

---

### Issue 472 — Consent domain model & versioned consent records
**Description:** `ConsentRecord` entity capturing subject id, consent purpose (enum: marketing, analytics, third-party sharing, etc.), granted/withdrawn state, timestamp, and the specific policy-document version consented to.
**Objective:** Model consent as an auditable, versioned fact — not a single boolean flag on the user row — so changes to a privacy policy don't retroactively misrepresent historical consent.
**Acceptance Criteria:** Each consent action creates a new immutable record rather than mutating a prior one; current state is derivable as "latest record per purpose"; policy-version reference is required, not optional.
**Dependencies:** 461
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/domain/entities/consent-record.ts`, `packages/compliance/domain/value-objects/consent-purpose.ts`
**Tests Required:** Unit tests for immutability, state derivation, and rejection of a consent record missing a policy version.
**Documentation Required:** `docs/privacy/consent.md`
**Educational Notes:** Why consent, like audit events (Phase 10), should be modeled as an append-only ledger — you need to prove what a user agreed to *at the time*, not just what's true now.
**Deliverables:** Tested consent domain model.

---

### Issue 473 — `RecordConsent` / `WithdrawConsent` use cases
**Description:** Application use cases for granting and withdrawing consent per purpose, each appending a new `ConsentRecord` (Issue 472) and emitting a domain event for audit subscription.
**Objective:** Provide the single controlled entry point for consent state changes, mirroring Issue 184's pattern for audit events.
**Acceptance Criteria:** Withdrawal is always possible regardless of current state (no "already withdrawn" error blocking idempotent calls); consent changes for purposes tied to active features trigger the dependent-feature check from Issue 475.
**Dependencies:** 472
**Estimated Complexity:** S
**Files Affected:** `packages/compliance/application/use-cases/record-consent.ts`, `application/use-cases/withdraw-consent.ts`
**Tests Required:** Unit tests (fakes) for grant/withdraw, idempotency, and event emission.
**Documentation Required:** `docs/guides/use-cases.md` consent section.
**Educational Notes:** Idempotent withdrawal as a user-rights requirement — a user revoking consent should never be blocked by a confusing "nothing to withdraw" error.
**Deliverables:** Tested consent use cases.

---

### Issue 474 — Consent audit integration & query API
**Description:** Subscribe consent domain events into Phase 10's audit log (mirroring Issue 185's pattern), and expose a `QueryConsentHistory` use case returning a subject's full consent timeline per purpose.
**Objective:** Make consent history reconstructable for both the data subject ("what did I agree to and when") and compliance review.
**Acceptance Criteria:** Every consent grant/withdrawal produces a corresponding audit event; query returns a correctly time-ordered timeline per purpose.
**Dependencies:** 184, 473
**Estimated Complexity:** S
**Files Affected:** `packages/compliance/infrastructure/event-handlers/consent-audit-subscriber.ts`, `application/use-cases/query-consent-history.ts`
**Tests Required:** Integration tests for event-to-audit mapping and timeline query correctness.
**Documentation Required:** `docs/privacy/consent.md` audit section.
**Educational Notes:** Reuse of the Phase 10 event-subscriber pattern across a fifth context — evidence the seam generalizes rather than needing bespoke wiring each time.
**Deliverables:** Tested consent audit integration and query API.

---

### Issue 475 — Consent-gated feature enforcement middleware
**Description:** A reusable guard (Fastify hook or use-case decorator) that checks current consent state (via Issue 472/473) before allowing execution of a consent-dependent operation (e.g. sending a marketing notification through Phase 09's dispatcher), denying with a clear reason if consent is absent or withdrawn.
**Objective:** Ensure consent isn't just recorded but actually enforced at the point where a consent-dependent action would otherwise occur.
**Acceptance Criteria:** A withdrawn-consent subject is blocked from the gated operation on the very next attempt (no caching staleness beyond a documented short TTL); ungated operations are unaffected.
**Dependencies:** 473
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/application/guards/consent-guard.ts`, `apps/api/plugins/consent-guard.ts`
**Tests Required:** Integration tests for grant-then-allow and withdraw-then-deny sequences, including the notifications dispatch path.
**Documentation Required:** `docs/privacy/consent.md` enforcement section.
**Educational Notes:** Recorded consent without enforcement is a compliance illusion — the guard is what makes the consent record operationally meaningful rather than a paper trail nobody checks.
**Deliverables:** Tested consent enforcement guard, wired to at least one real feature.

---

### Issue 476 — Privacy-by-design review checklist & PR gate
**Description:** A structured `docs/privacy/privacy-by-design-checklist.md` (data minimization, purpose limitation, classification tagging, retention assignment, consent requirement) plus a lightweight CI check flagging PRs that add new personal-data fields without a corresponding classification-registry (461) entry.
**Objective:** Shift privacy review left, catching missing classification/retention/consent wiring at PR time instead of during an audit.
**Acceptance Criteria:** Checklist covers each compliance dimension built in this phase; CI check reliably flags an unclassified new Prisma field in a test PR fixture; checklist linked from `CONTRIBUTING.md`.
**Dependencies:** 461, 469, 472
**Estimated Complexity:** S
**Files Affected:** `docs/privacy/privacy-by-design-checklist.md`, `infra/ci/privacy-check.yml`, `CONTRIBUTING.md`
**Tests Required:** CI check tested against a fixture PR diff (positive and negative case).
**Documentation Required:** This issue's deliverable is the checklist itself.
**Educational Notes:** "Privacy by design" (GDPR Article 25) as an engineering process requirement, not just a legal phrase — the value is in catching gaps before merge, when they're cheap to fix.
**Deliverables:** Published checklist and enforced CI gate.

---

### Issue 477 — Data Protection Impact Assessment (DPIA) template & worked example
**Description:** A reusable DPIA template plus one worked example applying it to Verixa's identity-verification workflow (Phase 09), covering risk identification, mitigation, and residual-risk sign-off.
**Objective:** Give contributors a concrete, filled-in reference for when and how to conduct a DPIA, rather than an abstract template nobody knows how to apply.
**Acceptance Criteria:** Template covers processing description, necessity/proportionality, risk assessment, and mitigations; worked example references real Phase 09 data flows and existing mitigating controls (encryption, retention, consent).
**Dependencies:** 469, 472, and Phase 09 verification workflows
**Estimated Complexity:** S
**Files Affected:** `docs/privacy/dpia-template.md`, `docs/privacy/dpia-identity-verification.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the documents themselves.
**Educational Notes:** DPIAs as GDPR Article 35's mechanism for high-risk processing — why identity verification (biometric-adjacent, document evidence) is a textbook case requiring one.
**Deliverables:** Published DPIA template and worked example.

---

### Issue 478 — Compliance admin dashboard API
**Description:** Read-oriented endpoints aggregating open export/erasure requests, active legal holds, retention-job run history, and consent-withdrawal trends, for governance-role admins (building on Phase 07 RBAC and Phase 08 ABAC where fine-grained scoping is needed).
**Objective:** Give compliance staff operational visibility into this phase's subsystems without querying the database directly.
**Acceptance Criteria:** Endpoints require governance role/permission; each panel's data matches underlying use-case state; no personal data beyond what's needed for triage (e.g. request status, not full export contents) is exposed in list views.
**Dependencies:** 464, 467, 470, 471, 474
**Estimated Complexity:** M
**Files Affected:** `apps/api/routes/compliance/admin-dashboard.ts`
**Tests Required:** Integration tests for permission gating and data accuracy per panel.
**Documentation Required:** `docs/privacy/admin-dashboard.md`
**Educational Notes:** Minimizing exposure even in admin tooling — "authorized to manage compliance" is not the same as "needs to see raw personal data," and list views should reflect that.
**Deliverables:** Tested compliance admin API.

---

### Issue 479 — `packages/compliance` coverage gate
**Description:** Apply the Issue 037 coverage-gate pattern to `packages/compliance`.
**Objective:** Maintain test discipline for a legally consequential package where bugs carry regulatory risk, not just functional risk.
**Acceptance Criteria:** CI coverage gate active and passing for `packages/compliance`.
**Dependencies:** 461–478
**Estimated Complexity:** XS
**Files Affected:** `packages/compliance/vitest.config.ts`
**Tests Required:** N/A (meta-check).
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Repetition of the coverage-gate convention, notably applied here to a package where an untested edge case could mean an unlawful data retention or a failed erasure.
**Deliverables:** Enforced coverage gate.

---

### Issue 480 — `packages/compliance` public API surface & tutorial
**Description:** Curate `index.ts` exports applying the Issue 038 boundary pattern, and write `docs/guides/tutorials/building-gdpr-compliance.md` walking through data classification, cross-context subject resolution, export/erasure, retention, and consent as one coherent system built in this phase.
**Objective:** Encapsulate the package's internals and deliver the phase's educational artifact together, closing out Phase 24.
**Acceptance Criteria:** Only intended ports/use cases exported; deep-import lint rule extended; tutorial links every claim to real code/tests from Issues 461–479 and explicitly connects back to Issue 054 and Phase 10.
**Dependencies:** 038, 461–479
**Estimated Complexity:** M
**Files Affected:** `packages/compliance/index.ts`, `.eslintrc.cjs`, `docs/guides/tutorials/building-gdpr-compliance.md`
**Tests Required:** Lint rule verification.
**Documentation Required:** This issue's deliverable is the tutorial itself.
**Educational Notes:** N/A.
**Deliverables:** Curated public API and published tutorial.

---
