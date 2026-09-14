# Phase 10 — Audit Logging (Issues 181–200, plus 190A–190D)

Builds `packages/audit`: an append-only, tamper-evident audit trail that subscribes
to domain events across every prior context and exposes a query/export API.
Issue 190A adds an optional Stellar-backed external anchoring adapter on top
of the hash chain (Issue 190) — see `docs/adr/0003-stellar-audit-anchoring.md`.

---

### Issue 181 — `AuditEvent` domain model
**Description:** Define the `AuditEvent` value object/entity: `actorId` (nullable for system actions), `action` (string enum-like, e.g. `user.login.succeeded`), `resourceType`/`resourceId`, `timestamp`, `metadata` (JSON, schema-validated per action type), and `organizationId` for tenant scoping.
**Objective:** Establish a single, consistent shape for every auditable fact before wiring any producers.
**Acceptance Criteria:** `AuditEvent` immutable once constructed; metadata validated against a per-action Zod schema registry; unit tests cover construction and rejection of unregistered action types.
**Dependencies:** 004, 005, 006, 026
**Estimated Complexity:** M
**Files Affected:** `packages/audit/domain/entities/audit-event.ts`, `domain/value-objects/audit-action.ts`
**Tests Required:** Unit tests for construction, metadata schema validation, immutability.
**Documentation Required:** `docs/guides/domain-modeling.md` audit section.
**Educational Notes:** Why audit records should be modeled as immutable facts, not mutable rows — an audit log is a ledger, not a table you "update."
**Deliverables:** Tested `AuditEvent` model.

---

### Issue 182 — `AuditEventRepository` port
**Description:** Define the application-layer port for appending events and reading them back, deliberately excluding `update`/`delete` methods from the interface entirely.
**Objective:** Make the append-only constraint visible in the type system, not just convention.
**Acceptance Criteria:** Port exposes `append(event)` and query methods only; no mutation/deletion method exists anywhere in the port's type signature.
**Dependencies:** 181
**Estimated Complexity:** XS
**Files Affected:** `packages/audit/application/ports/audit-event-repository.ts`
**Tests Required:** Type-level test/compile check that no mutation method exists (documented convention + lint note).
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Designing ports that make invalid operations unrepresentable, rather than merely undocumented.
**Deliverables:** Append-only repository port.

---

### Issue 183 — `audit_events` Prisma table & append-only Postgres repository
**Description:** Prisma model for `audit_events` with indexed columns for `actorId`, `resourceType`+`resourceId`, `organizationId`, and `timestamp`; `PrismaAuditEventRepository` implementing only `append`/query methods. Database-level `REVOKE UPDATE, DELETE` on the table for the application's role, enforced via migration.
**Objective:** Enforce append-only-ness at both the application layer and the database layer, so a bug or compromised app credential can't silently rewrite history.
**Acceptance Criteria:** Migration revokes UPDATE/DELETE grants for the app DB role; contract tests confirm inserts succeed and manual UPDATE/DELETE attempts (via raw SQL in test) are rejected by Postgres.
**Dependencies:** 046, 052, 182
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma`, `prisma/migrations/*_audit_events_append_only.sql`, `packages/audit/infrastructure/persistence/prisma-audit-event-repository.ts`
**Tests Required:** Contract tests + a negative test asserting DB-level rejection of UPDATE/DELETE.
**Documentation Required:** `docs/security/audit-log-integrity.md`
**Educational Notes:** Defense in depth: application-layer discipline is not enough on its own — database grants are the harder-to-bypass backstop.
**Deliverables:** Tested append-only persistence with DB-enforced grants.

---

### Issue 184 — `RecordAuditEvent` use case
**Description:** Application-layer use case that validates an incoming event payload, stamps it with a server-side timestamp (never client-supplied), and persists it via the repository.
**Objective:** Provide a single, controlled entry point for writing audit events, rather than letting every producer write directly to the repository.
**Acceptance Criteria:** Client-supplied timestamps ignored/overwritten; invalid metadata rejected before persistence; success returns the persisted event's id.
**Dependencies:** 182, 183
**Estimated Complexity:** S
**Files Affected:** `packages/audit/application/use-cases/record-audit-event.ts`
**Tests Required:** Unit tests (fakes) for timestamp stamping and validation rejection.
**Documentation Required:** `docs/guides/use-cases.md` audit section.
**Educational Notes:** Why timestamps must be server-assigned — client clocks are untrusted input, same principle as never trusting client-supplied IDs.
**Deliverables:** Tested `RecordAuditEvent` use case.

---

### Issue 185 — Domain event subscriber: identity & credentials
**Description:** Subscribe to identity/credentials domain events (`UserRegistered`, `EmailVerified`, `PasswordChanged`, `AccountLocked`, etc. from Phases 02–04) via the in-process publisher (Issue 026) and translate each into an `AuditEvent` through Issue 184's use case.
**Objective:** Begin populating the audit trail from the first two contexts without those contexts knowing audit exists.
**Acceptance Criteria:** Each subscribed identity/credentials event produces exactly one correctly-shaped `AuditEvent`; subscriber failures are logged, not thrown back into the publisher.
**Dependencies:** 026, 030, 065, 066, 067, 068, 069, 070, 071, 184
**Estimated Complexity:** M
**Files Affected:** `packages/audit/infrastructure/event-handlers/identity-credentials-audit-subscriber.ts`
**Tests Required:** Integration tests publishing each event type and asserting the resulting audit record.
**Documentation Required:** `docs/guides/domain-events.md` audit subscriber section.
**Educational Notes:** Event-driven observability — audit as a downstream consumer keeps the producing contexts fully decoupled from audit's existence.
**Deliverables:** Tested identity/credentials audit subscriber.

---

### Issue 186 — Domain event subscriber: sessions & RBAC
**Description:** Subscribe to session lifecycle events (`SessionCreated`, `SessionRevoked` from Phase 05) and RBAC events (`RoleAssigned`, `PermissionGranted` from Phase 07), mapping each to an `AuditEvent`.
**Objective:** Extend audit coverage to authentication-session and authorization-change events, both high-value for security review.
**Acceptance Criteria:** Same correctness bar as Issue 185, applied to the sessions and RBAC event sets.
**Dependencies:** 184, 185, Phase 05 session events, Phase 07 RBAC events
**Estimated Complexity:** S
**Files Affected:** `packages/audit/infrastructure/event-handlers/sessions-rbac-audit-subscriber.ts`
**Tests Required:** Integration tests per event type.
**Documentation Required:** `docs/guides/domain-events.md` update.
**Educational Notes:** N/A (pattern reuse from Issue 185, generalized to a third and fourth context).
**Deliverables:** Tested sessions/RBAC audit subscriber.

---

### Issue 187 — Audit query API: filter by actor/resource/date range
**Description:** `QueryAuditEvents` use case supporting filters on `actorId`, `resourceType`/`resourceId`, `organizationId`, and an inclusive date range, with keyset (cursor-based) pagination.
**Objective:** Make the audit trail actually useful for investigation, not just a write-only sink.
**Acceptance Criteria:** Combined filters apply correctly (AND semantics); pagination cursor is stable under concurrent inserts; empty result set handled without error.
**Dependencies:** 183, 184
**Estimated Complexity:** M
**Files Affected:** `packages/audit/application/use-cases/query-audit-events.ts`
**Tests Required:** Integration tests for each filter combination and pagination stability.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Why keyset pagination beats offset pagination for an append-heavy, high-volume table.
**Deliverables:** Tested query use case.

---

### Issue 188 — Query result indexing & performance tuning
**Description:** Add composite indexes matching the query patterns from Issue 187 (`(organizationId, timestamp)`, `(actorId, timestamp)`, `(resourceType, resourceId, timestamp)`); document `EXPLAIN ANALYZE` results for representative queries at seeded scale.
**Objective:** Ensure the query API stays fast as the append-only table grows unboundedly.
**Acceptance Criteria:** Seeded-scale (100k+ rows) query benchmarks documented; each Issue 187 filter path uses an index (verified via `EXPLAIN`, no sequential scans on the hot paths).
**Dependencies:** 187
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma` (indexes), `docs/performance/audit-query-benchmarks.md`
**Tests Required:** Performance test script (not part of CI gate) producing benchmark numbers.
**Documentation Required:** `docs/performance/audit-query-benchmarks.md`
**Educational Notes:** Index design driven by actual query shapes rather than guessing — reading `EXPLAIN ANALYZE` output.
**Deliverables:** Indexed, benchmarked query path.

---

### Issue 189 — Export API: CSV and JSON compliance export
**Description:** `ExportAuditEvents` use case streaming filtered results (reusing Issue 187's filters) to CSV or JSON, suitable for compliance/audit requests, with streaming to avoid loading the full result set into memory.
**Objective:** Support compliance workflows that need a portable export, not just an in-app query view.
**Acceptance Criteria:** Export streams rather than buffers (verified via memory-bounded test on a large fixture); CSV correctly escapes metadata fields; JSON export is valid newline-delimited or array JSON per a documented choice.
**Dependencies:** 187
**Estimated Complexity:** M
**Files Affected:** `packages/audit/application/use-cases/export-audit-events.ts`
**Tests Required:** Integration tests for both formats + a memory-bound streaming test.
**Documentation Required:** `docs/guides/use-cases.md` export section.
**Educational Notes:** Streaming vs. buffering for large exports — a common production memory-exhaustion bug avoided by design.
**Deliverables:** Tested CSV/JSON export.

---

### Issue 190 — Tamper-evident hash chaining
**Description:** Each `AuditEvent`, on append, includes `previousEventHash` (hash of the prior event in its organization's chain) and `eventHash` (hash of this event's canonical serialization plus `previousEventHash`), forming a per-organization hash chain analogous to a lightweight blockchain/Merkle chain. Hash computed inside the same transaction as the insert to prevent race conditions on chain order.
**Objective:** Make undetected retroactive tampering or silent deletion of audit records cryptographically detectable, even by an attacker with direct database access (short of also recomputing the entire chain).
**Acceptance Criteria:** Concurrent appends to the same organization serialize correctly (no two events claim the same `previousEventHash`); chain is verifiable end-to-end; unit tests cover canonical serialization stability (field ordering) so hashes are reproducible.
**Dependencies:** 183, 184
**Estimated Complexity:** L
**Files Affected:** `packages/audit/domain/services/hash-chain.ts`, `packages/audit/application/use-cases/record-audit-event.ts`, migration adding `previous_event_hash`/`event_hash` columns
**Tests Required:** Unit tests for canonical serialization + hash computation; integration tests for concurrent-append serialization and chain continuity.
**Documentation Required:** `docs/security/audit-log-integrity.md` hash-chain design section.
**Educational Notes:** Hash chaining as a practical, low-overhead tamper-evidence mechanism — the same core idea behind blockchains and Merkle trees, applied without any of the distributed-consensus machinery, since a single trusted writer already exists.
**Deliverables:** Tested, race-safe hash-chained audit log.

---

### Issue 190A — Stellar external audit-anchoring adapter

**Description:** Add `AuditAnchorPort` (application layer) and a
`StellarAuditAnchor` adapter (infrastructure layer) that periodically
submits the current hash-chain tip (Issue 190) as a Stellar transaction
memo, recording the resulting transaction hash against the anchored event
range. Anchoring is optional and off by default; enabling it requires a
funded Stellar account.
**Objective:** Close the one real gap hash chaining alone leaves open: it
proves internal consistency, but can't by itself distinguish real history
from a fully-rewritten-but-self-consistent fake in the hands of an attacker
with database access. External anchoring on a public, append-only ledger
gives an independently-checkable commitment outside Verixa's own trust
boundary. See `docs/adr/0003-stellar-audit-anchoring.md` for the full
decision, alternatives considered, and why Stellar specifically (sub-5s
finality, negligible fees, a memo field sized for a hash — no
smart-contract layer needed).
**Acceptance Criteria:** `AuditAnchorPort` has no Stellar-specific types
(same port/adapter discipline as every repository in this codebase);
`StellarAuditAnchor` submits a hash and returns a verifiable transaction
reference; anchoring interval is configurable; disabled by default with
zero effect on core audit-logging behavior when off.
**Dependencies:** 190, 191
**Estimated Complexity:** M
**Files Affected:** `packages/audit/application/ports/audit-anchor.ts`,
`packages/audit/infrastructure/anchoring/stellar-audit-anchor.ts`
**Tests Required:** Unit tests against a fake `AuditAnchorPort`
implementation; integration test submitting a real testnet transaction and
confirming the memo round-trips.
**Documentation Required:** `docs/security/audit-log-integrity.md`
anchoring section.
**Educational Notes:** External anchoring as the general fix for
"tamper-evident within a trust boundary" vs. "tamper-evident, full stop" —
the same pattern behind certificate transparency logs and RFC 3161 trusted
timestamping, applied here with a public ledger instead of a trusted third
party.
**Deliverables:** Optional, tested Stellar anchoring adapter with
independently-verifiable audit-chain commitments.

---

### Issue 191 — Chain verification use case & CLI tool
**Description:** `VerifyAuditChain` use case that walks a chain (per organization or globally) recomputing hashes and comparing against stored values, reporting the first point of divergence if any; exposed as a `pnpm audit:verify-chain` script.
**Objective:** Turn tamper-evidence into an actionable, runnable check rather than a theoretical property.
**Acceptance Criteria:** Verification passes on an untampered chain; a manually corrupted record (test fixture) is detected and its position reported; tool runs against a real database via the Testcontainers harness in tests. If Issue 190A's anchoring is enabled, verification optionally confirms an anchored range's hash against its recorded Stellar transaction — independently checkable without trusting Verixa's own database.
**Dependencies:** 190, 190A (optional, for anchor verification)
**Estimated Complexity:** M
**Files Affected:** `packages/audit/application/use-cases/verify-audit-chain.ts`, `packages/audit/infrastructure/cli/verify-chain.ts`, `package.json` script
**Tests Required:** Integration tests for clean-chain pass and corrupted-chain detection.
**Documentation Required:** `docs/security/audit-log-integrity.md` verification section.
**Educational Notes:** Detection vs. prevention — hash chaining doesn't stop tampering, it makes it provable after the fact, which is the realistic goal for an audit log.
**Deliverables:** Tested chain-verification use case and CLI tool.

---

### Issue 192 — Retention policy hook
**Description:** Define a `RetentionPolicy` port and a scheduled-job stub (`ApplyAuditRetentionPolicy` use case) that identifies events older than a configurable retention window for archival/deletion, without implementing actual deletion — deletion mechanics and legal-hold rules are deferred to Phase 24 (compliance).
**Objective:** Establish the seam for retention now, since it affects schema and query design, while deferring the compliance-sensitive deletion policy itself.
**Acceptance Criteria:** Port defined; use case identifies (but does not delete) events past the configured window in tests; documented forward-reference to Phase 24.
**Dependencies:** 187, 188
**Estimated Complexity:** S
**Files Affected:** `packages/audit/application/ports/retention-policy.ts`, `packages/audit/application/use-cases/apply-audit-retention-policy.ts`
**Tests Required:** Unit tests identifying correct records without deleting them.
**Documentation Required:** `docs/security/audit-log-integrity.md` retention section, cross-referencing Phase 24.
**Educational Notes:** Tension between append-only tamper evidence and legally-required data deletion (e.g. GDPR erasure) — previewed here, resolved in Phase 24.
**Deliverables:** Retention-policy seam, no destructive behavior yet.

---

### Issue 193 — High-volume write performance: batching & backpressure
**Description:** Add optional batched-append support to the repository (accumulate events briefly, insert in a single statement) and a backpressure strategy (bounded in-memory queue with overflow logging) for bursts of domain events exceeding sustainable write throughput.
**Objective:** Keep the audit subscriber from becoming a throughput bottleneck or memory-leak risk under load, given every other context's events flow through it.
**Acceptance Criteria:** Load test demonstrates batched inserts outperform per-event inserts at documented volumes; overflow beyond the bounded queue is logged with a metric, not silently dropped or an unbounded memory grower.
**Dependencies:** 185, 186, 190
**Estimated Complexity:** M
**Files Affected:** `packages/audit/infrastructure/persistence/batched-audit-writer.ts`
**Tests Required:** Load test (documented, not part of default CI) + unit tests for overflow logging behavior.
**Documentation Required:** `docs/performance/audit-write-throughput.md`
**Educational Notes:** Backpressure as a first-class design concern for any component sitting downstream of an event bus — silent drops and unbounded queues are the two failure modes to avoid.
**Deliverables:** Tested batched writer with bounded backpressure.

---

### Issue 194 — Composition wiring: audit subscribers registered at startup
**Description:** Wire all audit event subscribers (Issues 185, 186) into `apps/api`'s composition root, ensuring subscription happens before any other context's use cases can run and publish events.
**Objective:** Make audit logging actually active in the running application, not just testable in isolation.
**Acceptance Criteria:** Application startup registers every audit subscriber; a smoke test performs a real login through the composed app and asserts an audit record is written.
**Dependencies:** 185, 186
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/composition/register-audit-subscribers.ts`, `apps/api/src/app.ts`
**Tests Required:** End-to-end smoke test via the composed application.
**Documentation Required:** `docs/guides/composition-root.md` audit section.
**Educational Notes:** Composition-root ordering concerns — subscribers must exist before publishers can fire, a subtle startup-sequencing bug class.
**Deliverables:** Audit subscribers wired into the running app.

---

### Issue 195 — Threat model: audit log tampering and deletion
**Description:** STRIDE-based threat model covering log tampering, silent deletion, subscriber failure/event loss, and log-injection (malicious data in event metadata), cross-referencing which issues in this phase mitigate each threat.
**Objective:** Document the security reasoning behind the append-only + hash-chain design as a coherent whole.
**Acceptance Criteria:** All STRIDE categories relevant to an audit subsystem addressed; each threat maps to a mitigating issue or an accepted-risk note (e.g. subscriber-failure event loss is accepted-risk with a documented rationale).
**Dependencies:** 183, 190, 191, 193
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-audit.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Threat-modeling an append-only system — the threat surface shifts from "prevent writes" (typical CRUD threat models) to "prevent undetected rewrites/deletes."
**Deliverables:** Published threat model.

---

### Issue 196 — Log-injection hardening
**Description:** Ensure audit metadata fields are stored and exported as structured JSON (never string-concatenated into logs or CSV in a way that allows injection), and that pino log output referencing audit events is similarly structured, per the redaction pattern from Issue 008.
**Objective:** Prevent an attacker from injecting fake log lines or breaking CSV structure via crafted input in fields that eventually reach an audit record.
**Acceptance Criteria:** Fixture with newline/CSV-delimiter/control-character-laden metadata round-trips safely through storage, query, export, and structured logging without corrupting output.
**Dependencies:** 008, 189, 195
**Estimated Complexity:** S
**Files Affected:** `packages/audit/domain/value-objects/audit-metadata.ts`, `packages/audit/application/use-cases/export-audit-events.ts`
**Tests Required:** Unit tests with adversarial metadata fixtures.
**Documentation Required:** `docs/security/audit-log-integrity.md` update.
**Educational Notes:** Log injection as an underrated vulnerability class — structured logging/serialization as the general fix, applicable well beyond audit.
**Deliverables:** Injection-hardened metadata handling.

---

### Issue 197 — `packages/audit` unit test coverage gate
**Description:** Apply the Phase 02 coverage-gate pattern (Issue 037) to `packages/audit`.
**Objective:** Maintain test discipline for a context with unusually strict correctness requirements (append-only, hash chain).
**Acceptance Criteria:** CI coverage gate active and passing for `packages/audit`.
**Dependencies:** 181–194
**Estimated Complexity:** XS
**Files Affected:** `packages/audit/vitest.config.ts`
**Tests Required:** N/A (meta-check).
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Repetition of the coverage-gate pattern as a convention.
**Deliverables:** Enforced coverage gate.

---

### Issue 198 — `packages/audit` public API surface
**Description:** Curate `index.ts` exports for the audit package, applying the boundary-enforcement pattern from Issue 038 — exposing query/export use cases and the chain-verification tool, but not internal hash-chain implementation details.
**Objective:** Keep audit's internals encapsulated as it's consumed by `apps/api` (Phase 12) and admin tooling (Phase 13).
**Acceptance Criteria:** Only intended use cases/types exported; deep-import lint rule extended to this package.
**Dependencies:** 038, 181–194
**Estimated Complexity:** XS
**Files Affected:** `packages/audit/index.ts`, `.eslintrc.cjs`
**Tests Required:** Lint rule verification.
**Documentation Required:** None beyond existing guide.
**Educational Notes:** N/A (pattern reuse).
**Deliverables:** Curated public API.

---

### Issue 199 — Audit query/export authorization review
**Description:** Ensure the query and export use cases (Issues 187, 189) require an explicit permission (previewing Phase 07/08's RBAC/ABAC), reject cross-organization access by default, and are themselves logged as audit-worthy actions (querying/exporting audit logs is itself sensitive).
**Objective:** Prevent the audit trail from becoming its own data-leak vector — reading audit logs is a privileged action, not a public one.
**Acceptance Criteria:** Cross-organization query attempt rejected; a successful export is itself recorded as an `AuditEvent`; permission check documented pending full RBAC wiring in Phase 07/12.
**Dependencies:** 187, 189, 195
**Estimated Complexity:** S
**Files Affected:** `packages/audit/application/use-cases/query-audit-events.ts`, `export-audit-events.ts`
**Tests Required:** Unit tests for cross-org rejection and self-audit-logging.
**Documentation Required:** `docs/security/audit-log-integrity.md` update.
**Educational Notes:** "Who audits the auditors" — recursive logging of access to sensitive logs, a real compliance expectation (e.g. SOC 2).
**Deliverables:** Access-controlled, self-logging query/export path.

---

### Issue 200 — Audit logging educational walkthrough
**Description:** Write `docs/guides/tutorials/build-tamper-evident-audit-log.md`, a from-scratch narrative covering why append-only matters, how hash chaining provides tamper evidence, and how the query/export API balances usability against integrity guarantees, using this phase's code as the worked example.
**Objective:** Deliver the flagship "how to build a trustworthy audit trail" educational artifact for this phase.
**Acceptance Criteria:** Walkthrough covers append-only enforcement, hash-chain mechanics, verification tooling, and export streaming, linking every claim to real code/tests in the repo.
**Dependencies:** 181–199
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-tamper-evident-audit-log.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.

---

---

### Issue 190B — Stellar anchoring key management (mainnet readiness)
**Description:** Replace the plain `STELLAR_ANCHOR_SECRET_KEY` environment variable with a KMS/HSM-backed signing path, so the anchoring account's secret key is never held in application memory or configuration in production.
**Objective:** Make mainnet anchoring operationally safe. The anchoring key signs real transactions that spend real XLM; a key in an env var is readable by anything that can read the process environment, a crash dump, or a misconfigured log.
**Acceptance Criteria:** Signing goes through an interface with a KMS-backed implementation and a local dev implementation; the raw secret never appears in config, logs, or error output; a documented rotation procedure exists.
**Dependencies:** 190A
**Estimated Complexity:** M
**Files Affected:** `packages/stellar-anchor/application/ports/transaction-signer.ts`, `infrastructure/kms-transaction-signer.ts`
**Tests Required:** Unit tests against a fake signer; a test asserting the secret is absent from serialized config and error output.
**Documentation Required:** `docs/security/stellar-key-management.md`
**Educational Notes:** Why "it's in an environment variable" is not key management, and what an attacker gets from each disclosure path (env, crash dump, log, backup).
**Deliverables:** KMS-backed signing path plus rotation runbook.

---

### Issue 190C — Stellar account funding monitor and alerting
**Description:** Monitor the anchoring account's XLM balance and alert before it can no longer pay transaction fees; define the behavior when anchoring cannot proceed.
**Objective:** Anchoring silently stopping is worse than anchoring never existing — the audit log would appear protected while no longer being anchored, and nobody would know until an integrity check failed months later.
**Acceptance Criteria:** Balance exposed as a metric; alert fires below a configurable threshold; an unfundable anchor attempt surfaces as a loud, recorded failure rather than a swallowed error.
**Dependencies:** 190A, 190B
**Estimated Complexity:** S
**Files Affected:** `packages/stellar-anchor/infrastructure/balance-monitor.ts`, observability wiring
**Tests Required:** Tests for threshold breach and for the unfundable-anchor failure path.
**Documentation Required:** `docs/guides/stellar-anchoring.md` operations section.
**Educational Notes:** Silent degradation as a failure mode — a security control that stops working without announcing it is worse than one that was never installed, because it carries the same assurance with none of the protection.
**Deliverables:** Balance monitoring, alerting, and a defined failure behavior.

---

### Issue 190D — Stellar testnet-to-mainnet migration runbook
**Description:** Document and script the cutover from testnet to mainnet: account creation and funding, network passphrase configuration, a verification procedure proving anchors land on the public network, and a rollback path.
**Objective:** Make the cutover a rehearsed procedure rather than an improvised one. Everything to date is testnet-only, where mistakes cost nothing; on mainnet they cost real funds and produce permanent public ledger entries.
**Acceptance Criteria:** Runbook covers account setup, config changes, a dry run, verification that a known hash is retrievable from the public ledger, and what to do if anchoring must be disabled mid-flight.
**Dependencies:** 190B, 190C
**Estimated Complexity:** S
**Files Affected:** `docs/runbooks/stellar-mainnet-cutover.md`
**Tests Required:** N/A — the deliverable is a rehearsed procedure; the dry run is the test.
**Documentation Required:** This issue's deliverable is the runbook.
**Educational Notes:** Why "it worked on testnet" is not evidence for mainnet: different fees, different congestion, real irreversibility, and an account that must stay funded indefinitely.
**Deliverables:** Cutover runbook, rehearsed at least once against testnet.
