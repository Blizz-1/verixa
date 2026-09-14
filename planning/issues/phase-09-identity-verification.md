# Phase 09 — Identity Verification (Issues 161–180)

Builds `packages/verification`: the KYC-style verification request lifecycle, evidence
submission and storage, a pluggable automated-provider adapter interface, and the
reviewer queue and status state machine that back a manual-review admin experience.

---

### Issue 161 — `VerificationRequest` domain entity & aggregate
**Description:** `VerificationRequest` aggregate (requestId, subjectUserId, orgId, verificationType e.g. `identity-document`/`address`/`liveness`, status, createdAt, decidedAt, decidedBy) as the root that evidence items and review decisions attach to.
**Objective:** Establish the single aggregate that owns state-transition invariants before evidence, providers, or review UI exist.
**Acceptance Criteria:** Entity constructible only via factory with valid initial state (`pending_evidence`); exposes behavior methods rather than public setters; unit tests cover construction invariants.
**Dependencies:** 004, 005, 006
**Estimated Complexity:** M
**Files Affected:** `packages/verification/domain/entities/verification-request.ts`, `domain/value-objects/verification-type.ts`
**Tests Required:** Unit tests for factory invariants and entity shape.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Modeling verification as an aggregate root (not a bag of fields on `User`) keeps identity-proofing state transitions auditable and independent of the core Identity context — a deliberate bounded-context separation per `ARCHITECTURE.md` §2.2.
**Deliverables:** Tested `VerificationRequest` entity.

---

### Issue 162 — Verification status state machine
**Description:** `VerificationStatus` value object and explicit transition table: `pending_evidence → submitted → in_review → (approved | rejected | needs_more_info)`, with `needs_more_info` looping back to `pending_evidence` and terminal states immutable thereafter.
**Objective:** Make illegal status jumps (e.g. `pending_evidence → approved`) a compile-/runtime-rejected impossibility rather than a convention.
**Acceptance Criteria:** `canTransitionTo(next)` enforced on every mutation path; attempting an illegal transition throws a domain error; terminal states reject any further transition; unit tests enumerate the full transition table including illegal edges.
**Dependencies:** 161
**Estimated Complexity:** M
**Files Affected:** `packages/verification/domain/value-objects/verification-status.ts`, `domain/errors/invalid-status-transition.ts`
**Tests Required:** Exhaustive transition-table unit tests (legal and illegal).
**Documentation Required:** `docs/guides/domain-modeling.md` state-machine diagram.
**Educational Notes:** Explicit state machines as a domain-modeling pattern — encoding the transition table once in the domain layer prevents every future use case and UI screen from re-deriving (and inevitably diverging on) "what states can follow what."
**Deliverables:** Tested status state machine.

---

### Issue 163 — `VerificationRequestRepository` port & in-memory fake
**Description:** Port (`save`, `findById`, `findBySubject`, `findByStatus`, `findQueueCandidates`) plus an in-memory fake following the Issue 031 contract-test pattern.
**Objective:** Let verification use cases be written and tested before persistence exists.
**Acceptance Criteria:** Fake passes the shared contract test suite; port has no framework/Prisma types; `findQueueCandidates` supports status + pagination filters used later by the reviewer queue.
**Dependencies:** 031, 161, 162
**Estimated Complexity:** S
**Files Affected:** `packages/verification/application/ports/verification-request-repository.ts`, `infrastructure/fakes/in-memory-verification-request-repository.ts`
**Tests Required:** Contract tests against the fake.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Reuse of the port/fake/contract-test pattern established in Issue 031 — a fourth context now shares this convention, reinforcing it as house style rather than one-off.
**Deliverables:** Tested port + fake.

---

### Issue 164 — `verification_requests` table & `PrismaVerificationRequestRepository`
**Description:** Prisma model (indexed on `subjectUserId`, `status`, `orgId`) and a `PrismaVerificationRequestRepository` implementing Issue 163's port, using the Issue 056 error-mapping pattern.
**Objective:** Persist verification requests durably with fast lookups for both "my verification history" and "queue of pending reviews" access patterns.
**Acceptance Criteria:** Contract tests (Issue 047 Testcontainers harness) pass against real Postgres; composite index on `(status, createdAt)` verified for queue-ordering queries.
**Dependencies:** 046, 047, 052, 056, 163
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma`, `packages/verification/infrastructure/persistence/prisma-verification-request-repository.ts`
**Tests Required:** Contract tests against real Postgres.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Row-Level Security (Issue 052) applies here — verification requests contain sensitive PII-adjacent metadata and must never be readable across org boundaries, even by another org's reviewers.
**Deliverables:** Tested Prisma-backed verification persistence.

---

### Issue 165 — `Evidence` domain entity & type taxonomy
**Description:** `Evidence` entity (evidenceId, requestId, evidenceType e.g. `government-id-front`/`government-id-back`/`selfie`/`proof-of-address`, storageRef, checksum, uploadedAt) attached to a `VerificationRequest`, with a closed enum of evidence types per verification type.
**Objective:** Model evidence as first-class, independently auditable artifacts rather than opaque file uploads bolted onto the request.
**Acceptance Criteria:** Entity rejects evidence types not valid for the parent request's `verificationType`; storageRef never holds raw file bytes (pointer-only); unit tests cover valid/invalid type pairings.
**Dependencies:** 005, 161
**Estimated Complexity:** S
**Files Affected:** `packages/verification/domain/entities/evidence.ts`, `domain/value-objects/evidence-type.ts`
**Tests Required:** Unit tests for type-pairing invariants.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Keeping the domain entity as a pointer (storageRef + checksum) rather than the file itself is a deliberate boundary — the domain layer must never hold binary blobs or know about S3/filesystem specifics.
**Deliverables:** Tested `Evidence` entity.

---

### Issue 166 — `EvidenceStorage` port & encrypted-at-rest adapter
**Description:** `EvidenceStorage` port (`put`, `getSignedUrl`, `delete`) abstracting where evidence bytes live, plus a concrete adapter (local-disk for dev, S3-compatible for prod) that encrypts at rest and returns only short-lived signed URLs, never public paths.
**Objective:** Isolate the highest-sensitivity data in this phase (government ID scans, selfies) behind a narrow, swappable interface.
**Acceptance Criteria:** `put` returns an opaque storage reference, never a public URL; `getSignedUrl` URLs expire within a configurable short window; adapter never logs file contents or full paths.
**Dependencies:** 005, 165
**Estimated Complexity:** M
**Files Affected:** `packages/verification/application/ports/evidence-storage.ts`, `infrastructure/storage/s3-evidence-storage.ts`, `infrastructure/storage/local-evidence-storage.ts`
**Tests Required:** Integration tests against a local/mock storage backend; unit tests for signed-URL expiry.
**Documentation Required:** `docs/security/evidence-handling.md`
**Educational Notes:** Signed, short-lived URLs instead of durable public links is the standard mitigation for accidental exposure of sensitive documents — a link that leaks into logs or browser history becomes useless within minutes rather than forever.
**Deliverables:** Tested evidence storage adapter.

---

### Issue 167 — Use case: `SubmitVerificationRequest`
**Description:** Creates a new `VerificationRequest` for a subject user/org, validating there is no other non-terminal request of the same `verificationType` already open for that subject.
**Objective:** Provide the single entry point that starts a verification workflow, preventing duplicate concurrent requests.
**Acceptance Criteria:** Rejects a new request while an open one of the same type exists; returns the created request's id and initial status; unit + integration tests cover the duplicate-rejection path.
**Dependencies:** 161, 162, 163
**Estimated Complexity:** S
**Files Affected:** `packages/verification/application/use-cases/submit-verification-request.ts`
**Tests Required:** Unit tests (fakes) + integration test against real persistence.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Enforcing "one open request per type per subject" at the use-case boundary avoids a whole class of duplicate-queue-entry bugs that would otherwise need cleanup logic downstream in the reviewer queue.
**Deliverables:** Tested request-submission use case.

---

### Issue 168 — Use case: `SubmitEvidence`
**Description:** Attaches one or more `Evidence` items to an existing `VerificationRequest`, delegating byte storage to `EvidenceStorage` (Issue 166), and transitions the request from `pending_evidence` to `submitted` once all required evidence types for its `verificationType` are present.
**Objective:** Drive the state machine forward automatically as evidence completeness is reached, rather than requiring a separate manual "submit" step.
**Acceptance Criteria:** Partial evidence keeps status at `pending_evidence`; completing the required set transitions to `submitted`; rejects evidence types invalid for the request's type (Issue 165); unit tests cover partial vs. complete submission.
**Dependencies:** 162, 165, 166, 167
**Estimated Complexity:** M
**Files Affected:** `packages/verification/application/use-cases/submit-evidence.ts`
**Tests Required:** Unit tests (fakes) for completeness-driven transitions; integration test for storage + persistence together.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Deriving the transition from evidence completeness (a computed fact) rather than a client-asserted flag closes off a class of client-trust bugs where a UI could otherwise mark a request "submitted" with missing documents.
**Deliverables:** Tested evidence-submission use case.

---

### Issue 169 — Evidence validation pipeline (type/size/scan hook)
**Description:** Pre-storage validation chain run inside `SubmitEvidence`: MIME-type allowlist, max file size, and a pluggable `MalwareScanner` port (no-op fake by default, real AV integration deferred) invoked before bytes reach `EvidenceStorage`.
**Objective:** Reject obviously invalid or unsafe uploads before they ever reach durable storage.
**Acceptance Criteria:** Disallowed MIME types and oversized files are rejected with a specific validation error, not a generic failure; `MalwareScanner` is called for every upload and a positive result blocks storage; unit tests cover each rejection path independently.
**Dependencies:** 166, 168
**Estimated Complexity:** S
**Files Affected:** `packages/verification/application/services/evidence-validator.ts`, `application/ports/malware-scanner.ts`
**Tests Required:** Unit tests for each validation rule and scanner integration point.
**Documentation Required:** `docs/security/evidence-handling.md` update.
**Educational Notes:** Validating untrusted user uploads (type, size, content) before they touch storage or downstream provider APIs is a baseline defense against both storage abuse and supply-chain-style attacks via malicious file uploads.
**Deliverables:** Tested evidence-validation pipeline.

---

### Issue 170 — `VerificationProvider` adapter port
**Description:** Port (`checkDocument(evidence): ProviderCheckResult`, `checkLiveness(evidence): ProviderCheckResult`) abstracting third-party automated identity-verification vendors, with `ProviderCheckResult` as a normalized outcome (`passed`/`failed`/`inconclusive`, confidenceScore, providerRawRef).
**Objective:** Let Verixa plug in any automated verification vendor (or none) without the domain or application layers depending on a specific provider's API shape.
**Acceptance Criteria:** Port has no vendor-specific types leaking into its signature; `ProviderCheckResult` is provider-agnostic; interface documented with the exact contract adapters must fulfill.
**Dependencies:** 005, 165
**Estimated Complexity:** M
**Files Affected:** `packages/verification/application/ports/verification-provider.ts`, `application/dtos/provider-check-result.ts`
**Tests Required:** Type-level/contract tests defining the expected port shape.
**Documentation Required:** `docs/guides/verification-provider-integration.md`
**Educational Notes:** The Adapter pattern applied to third-party KYC vendors — Verixa is infrastructure meant to be reused across projects, so hardcoding one vendor's SDK into the application layer would violate the hexagonal dependency rule and lock every consumer into that vendor.
**Deliverables:** Documented, tested provider port.

---

### Issue 171 — Manual-review provider adapter (default implementation)
**Description:** Concrete `VerificationProvider` implementation that always returns `inconclusive`, deferring every check to human review — the shipped default so Verixa works fully out of the box without any paid third-party vendor.
**Objective:** Guarantee the verification workflow is usable and testable without requiring a real KYC vendor contract, while conforming to Issue 170's port for a drop-in vendor adapter later.
**Acceptance Criteria:** Adapter satisfies the port contract test suite; always routes to manual review; documented as the reference implementation for anyone writing a real vendor adapter.
**Dependencies:** 170
**Estimated Complexity:** S
**Files Affected:** `packages/verification/infrastructure/providers/manual-review-provider.ts`
**Tests Required:** Contract tests against the port; unit tests for always-inconclusive behavior.
**Documentation Required:** `docs/guides/verification-provider-integration.md` update.
**Educational Notes:** Shipping a "null object" adapter as the default is what keeps the open-source project self-contained — a contributor can run the full verification flow end-to-end without signing up for a commercial API key.
**Deliverables:** Tested default provider adapter.

---

### Issue 172 — Use case: `RunAutomatedCheck`
**Description:** Invokes the configured `VerificationProvider` for a `submitted` request's evidence, records the `ProviderCheckResult` against the request, and transitions status to `in_review` regardless of outcome (automated results inform but never auto-decide in this phase).
**Objective:** Wire the provider adapter into the workflow while keeping the human reviewer as the sole decision-maker for this phase's scope.
**Acceptance Criteria:** Provider result persisted alongside the request; status always lands in `in_review` after the check completes (pass, fail, or inconclusive); provider timeouts/errors are caught and also route to `in_review` with an error annotation rather than crashing the workflow.
**Dependencies:** 168, 170, 171
**Estimated Complexity:** M
**Files Affected:** `packages/verification/application/use-cases/run-automated-check.ts`
**Tests Required:** Unit tests (fake provider) for pass/fail/inconclusive/error paths.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Deliberately not auto-approving/rejecting on provider signal alone in v1 is a conservative, defensible design choice for identity verification — false positives/negatives in automated KYC have real consequences, so human-in-the-loop stays authoritative until the system earns more trust.
**Deliverables:** Tested automated-check use case.

---

### Issue 173 — Reviewer queue domain concept & assignment model
**Description:** `ReviewAssignment` value object/entity (requestId, reviewerId, assignedAt, claimExpiresAt) representing a reviewer's temporary claim on a request in the queue, preventing two reviewers from working the same case simultaneously.
**Objective:** Model queue contention explicitly instead of leaving "who owns this case right now" as an implicit, race-prone concept.
**Acceptance Criteria:** A request can have at most one active (non-expired) assignment at a time; `claimExpiresAt` auto-releases a stale claim back to the queue; unit tests cover claim, expiry, and re-claim.
**Dependencies:** 161, 162
**Estimated Complexity:** M
**Files Affected:** `packages/verification/domain/entities/review-assignment.ts`
**Tests Required:** Unit tests for claim lifecycle and expiry-driven release.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Time-bounded claims (an optimistic lease rather than a permanent lock) are the standard pattern for human work queues — they prevent both double-work and permanently stuck cases when a reviewer's session dies mid-review.
**Deliverables:** Tested review-assignment concept.

---

### Issue 174 — Use case: `ClaimNextReviewCase`
**Description:** Atomically assigns the oldest unclaimed `in_review` request to the calling reviewer, using the persistence layer's locking (`SELECT ... FOR UPDATE SKIP LOCKED` or equivalent) to avoid two reviewers claiming the same case under concurrency.
**Objective:** Give reviewers a fair, race-free "next case" mechanism rather than a shared list they browse and hope not to collide on.
**Acceptance Criteria:** Concurrent calls from two reviewers never return the same request; a reviewer with an existing active claim cannot claim a second case (configurable one-at-a-time policy); integration test simulates concurrent claim attempts.
**Dependencies:** 164, 173
**Estimated Complexity:** M
**Files Affected:** `packages/verification/application/use-cases/claim-next-review-case.ts`, `infrastructure/persistence/prisma-verification-request-repository.ts`
**Tests Required:** Integration tests for concurrent-claim race safety.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** `SKIP LOCKED`-style queue claiming is the standard Postgres pattern for "many workers, one queue, no double-processing" — directly transferable knowledge beyond identity verification (job queues, task assignment systems generally).
**Deliverables:** Tested, race-safe claim use case.

---

### Issue 175 — Use cases: `ApproveVerification` / `RejectVerification`
**Description:** Reviewer-decision use cases that transition a claimed, `in_review` request to `approved` or `rejected`, recording `decidedBy`, `decidedAt`, and a required rationale note, and emitting a `VerificationDecided` domain event.
**Objective:** Provide the terminal decision points of the workflow, with every decision attributable and reasoned.
**Acceptance Criteria:** Only the reviewer holding the active claim may decide; rationale note is mandatory and non-empty; illegal-transition attempts (e.g. deciding an unclaimed or already-terminal request) are rejected via Issue 162's state machine; domain event carries enough data for the audit trail (Phase 10) to consume without a follow-up query.
**Dependencies:** 162, 173, 174, 176
**Estimated Complexity:** M
**Files Affected:** `packages/verification/application/use-cases/approve-verification.ts`, `application/use-cases/reject-verification.ts`, `domain/events/verification-decided.ts`
**Tests Required:** Unit tests for authorization-to-decide, mandatory-rationale, and illegal-transition rejection.
**Documentation Required:** `docs/security/authentication-flows.md` cross-reference; `docs/guides/use-cases.md` update.
**Educational Notes:** Requiring a rationale note on every terminal decision is a governance/compliance pattern, not just UX polish — identity-verification denials are exactly the kind of decision that later needs to be explained (to the subject, to an auditor, to a regulator).
**Deliverables:** Tested approve/reject use cases.

---

### Issue 176 — `needs_more_info` transition & requester re-submission loop
**Description:** Use case `RequestMoreInformation` (reviewer-initiated, `in_review → needs_more_info` with a note describing what's missing) and the corresponding re-entry path where a subsequent `SubmitEvidence` call (Issue 168) transitions `needs_more_info → pending_evidence → submitted` again.
**Objective:** Support the realistic non-linear case where evidence is insufficient without forcing a full new verification request.
**Acceptance Criteria:** `needs_more_info` requires a note visible to the subject; re-submission correctly re-enters the evidence-completeness flow; a request can cycle through `needs_more_info` multiple times without losing prior evidence or decision history.
**Dependencies:** 162, 168, 173
**Estimated Complexity:** S
**Files Affected:** `packages/verification/application/use-cases/request-more-information.ts`
**Tests Required:** Unit tests for the full request → needs-more-info → re-submit → in-review cycle.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Supporting a cyclical (non-strictly-forward) state in an otherwise linear-looking workflow is a common real-world requirement that pure "happy path" state machines miss — Issue 162's transition table was designed with this loop in mind from the start.
**Deliverables:** Tested more-information loop.

---

### Issue 177 — Query use case: `ListReviewQueue`
**Description:** Paginated, filterable (by status, verificationType, assigned/unassigned) read model over `in_review`/`submitted` requests, shaped for the reviewer queue UI, excluding raw evidence bytes and returning signed evidence URLs only on demand.
**Objective:** Provide the queue-listing read path the manual-review UI (Issue 178) is built against.
**Acceptance Criteria:** Supports pagination and the documented filters; response shape omits sensitive fields not needed for a queue list view (full evidence detail is a separate detail-fetch); unit tests cover filter combinations.
**Dependencies:** 163, 164, 173
**Estimated Complexity:** S
**Files Affected:** `packages/verification/application/use-cases/list-review-queue.ts`
**Tests Required:** Unit tests for filtering/pagination and output shape.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Same read-model-shaped-for-consumer principle as Issue 095 — a queue list view needs summary fields, not full evidence payloads, and expressing that at the use-case boundary keeps the eventual API response lean by default.
**Deliverables:** Tested queue-listing use case.

---

### Issue 178 — Manual review UI-facing API (interface layer)
**Description:** Fastify routes under `/verification` and `/verification/review-queue` exposing: submit request, submit evidence (multipart upload), get own request status, list review queue, claim next case, approve/reject/request-more-info — each backed by the corresponding Phase 09 use case, authorized per Phase 04's RBAC (reviewer role required for queue/decision routes).
**Objective:** Give the frontend/admin console the concrete, documented HTTP surface needed to build the manual-review experience.
**Acceptance Criteria:** OpenAPI schema generated for every route; Zod request/response validation on all inputs/outputs; reviewer-only routes reject non-reviewer callers with 403; evidence upload routes enforce Issue 169's validation pipeline before invoking the use case.
**Dependencies:** 043 (RBAC middleware pattern), 167, 168, 174, 175, 176, 177
**Estimated Complexity:** L
**Files Affected:** `packages/verification/interface/routes/verification.routes.ts`, `interface/routes/review-queue.routes.ts`, `interface/schemas/`
**Tests Required:** Supertest integration tests for each route, including authorization-boundary tests.
**Documentation Required:** OpenAPI spec regenerated; `docs/guides/api-overview.md` update.
**Educational Notes:** The interface layer is intentionally the thinnest layer — routes translate HTTP concerns (auth context, multipart parsing, status codes) into use-case calls and back, with zero business logic living in a route handler.
**Deliverables:** Tested, documented manual-review HTTP API.

---

### Issue 179 — Composition-root wiring & `packages/verification` public API surface
**Description:** Register all Phase 09 use cases, the Prisma repository, evidence storage adapter, and default provider adapter in `apps/api/src/composition-root.ts`; curate `packages/verification/index.ts` exports applying the Issue 038/078/099 boundary-enforcement pattern.
**Objective:** Make the verification context consumable by the rest of the application with internals (storage keys, provider raw responses) kept encapsulated.
**Acceptance Criteria:** Composition root resolves all verification use cases with real adapters in a local/dev boot smoke test; only intended use cases/types exported from the package; deep-import lint rule extended to this package.
**Dependencies:** 050, 164, 166, 171, 172, 174, 175, 177
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/composition-root.ts`, `packages/verification/index.ts`, `.eslintrc.cjs`
**Tests Required:** Boot smoke test; lint rule verification.
**Documentation Required:** `docs/guides/composition-root.md` update.
**Educational Notes:** Fifth repetition of the composition-root and public-API-surface conventions — by this phase the pattern should be recognizable enough that a new contributor can wire up a sixth context unassisted.
**Deliverables:** Verification package wired and boundary-enforced.

---

### Issue 180 — Threat model & educational walkthrough: identity verification
**Description:** STRIDE-based threat model for the verification workflow (evidence tampering, reviewer-decision spoofing, evidence exfiltration, provider-response forgery, queue-claim races) cross-referenced to mitigating issues, plus `docs/guides/tutorials/build-identity-verification.md` narrating the request → evidence → automated-check → review → decision flow using Phase 09 code as the worked example.
**Objective:** Close Phase 09 with both the security-reasoning artifact and the flagship educational writeup, mirroring the closing pattern of Phase 05 (Issues 098/100).
**Acceptance Criteria:** Threat model covers all STRIDE categories relevant to evidence handling and review decisions, each with a mitigating issue or accepted-risk note; tutorial links every claim to real code/tests in the repo and explains the provider-adapter and state-machine design decisions.
**Dependencies:** 161–179
**Estimated Complexity:** M
**Files Affected:** `docs/security/threat-model-verification.md`, `docs/guides/tutorials/build-identity-verification.md`
**Tests Required:** None.
**Documentation Required:** Both documents are this issue's deliverables.
**Educational Notes:** Identity verification handles some of the most sensitive data in the whole platform (government ID images, liveness selfies) — its threat model deliberately extends beyond credential/session threats (Issues 077/098) into data-exfiltration and third-party-vendor trust boundaries.
**Deliverables:** Published threat model and tutorial.

---
