# Phase 05 — Auth: Sessions & Tokens (Issues 081–100)

Builds `packages/sessions`: session lifecycle, JWT access/refresh token issuance,
Redis-backed revocation, and the primitives Phase 06 (MFA step-up), Phase 11
(hardening), and Phase 15 (rate limiting) will all depend on.

---

### Issue 081 — `Session` domain entity & expiry policy
**Description:** `Session` aggregate (sessionId, userId, createdAt, lastSeenAt, expiresAt, revokedAt) plus a configurable `SessionExpiryPolicy` value object supporting both sliding (extend on activity) and absolute (hard cutoff) expiry modes.
**Objective:** Establish the core session concept before any token format or storage decision is made.
**Acceptance Criteria:** Entity exposes `isExpired`/`isRevoked`/`touch` behavior; sliding mode extends `expiresAt` on `touch`, absolute mode ignores it; unit tests cover both modes.
**Dependencies:** 004, 005, 006
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/domain/entities/session.ts`, `domain/value-objects/session-expiry-policy.ts`
**Tests Required:** Unit tests for expiry transitions under both policies.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Sliding vs. absolute expiry is a real security/UX tradeoff — sliding sessions feel seamless but can live forever under continuous activity; absolute expiry bounds worst-case exposure but forces re-login.
**Deliverables:** Tested `Session` entity with pluggable expiry policy.

---

### Issue 082 — `SessionRepository` port & in-memory fake
**Description:** Define `SessionRepository` port (`save`, `findById`, `findActiveByUserId`, `revoke`, `revokeAllForUser`) plus an in-memory fake following the Issue 031 contract-test pattern.
**Objective:** Let session use cases be written and tested before persistence exists.
**Acceptance Criteria:** Fake passes the shared contract test suite; port has no framework/Prisma types.
**Dependencies:** 031, 081
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/application/ports/session-repository.ts`, `infrastructure/fakes/in-memory-session-repository.ts`
**Tests Required:** Contract tests against the fake.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Reuse of the port/fake/contract-test pattern established in Issue 031 — consistency lowers onboarding cost for new contributors.
**Deliverables:** Tested port + fake.

---

### Issue 083 — `sessions` table & `PrismaSessionRepository`
**Description:** Prisma model for sessions (indexed on `userId`, `expiresAt`) and a `PrismaSessionRepository` implementing Issue 082's port, using the Issue 056 error-mapping pattern.
**Objective:** Persist sessions durably while keeping fast lookups for "active sessions per user" queries.
**Acceptance Criteria:** Contract tests (Issue 047 Testcontainers harness) pass against the real database; index verified via `EXPLAIN` in a comment or test assertion.
**Dependencies:** 046, 047, 052, 056, 082
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma`, `packages/sessions/infrastructure/persistence/prisma-session-repository.ts`
**Tests Required:** Contract tests against real Postgres.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Row-Level Security (Issue 052) applies here too — a session row must never be readable across tenant/org boundaries.
**Deliverables:** Tested Prisma-backed session persistence.

---

### Issue 084 — JWT access token design & signing service
**Description:** Define the access token's claim set (`sub`, `sid`, `orgId`, `iat`, `exp`, minimal role/permission hints) and a `TokenSigner` port + JWT (RS256) implementation.
**Objective:** Produce short-lived, stateless-verifiable access tokens that downstream services can validate without a database round trip.
**Acceptance Criteria:** Tokens sign/verify round-trip; tampered payloads and expired tokens rejected; claim set documented.
**Dependencies:** 005, 081
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/application/ports/token-signer.ts`, `infrastructure/jwt-token-signer.ts`
**Tests Required:** Unit tests for sign/verify, tamper-detection, expiry rejection.
**Documentation Required:** `docs/security/token-design.md`
**Educational Notes:** Why access tokens are short-lived and stateless (fast verification, no DB hit per request) while refresh tokens are long-lived and stateful (revocable); asymmetric (RS256) vs. symmetric (HS256) signing tradeoffs for a system that may later verify tokens in multiple services.
**Deliverables:** Tested access token signer.

---

### Issue 085 — Signing key management & rotation
**Description:** `SigningKeyProvider` port supporting multiple active keys (keyed by `kid`), with a current signing key and one or more verification-only retired keys, backed by config-driven key material.
**Objective:** Allow signing keys to be rotated without invalidating tokens issued moments before rotation.
**Acceptance Criteria:** Tokens signed with a retired-but-still-valid key still verify; tokens signed with an unknown `kid` are rejected; rotation procedure documented.
**Dependencies:** 084
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/infrastructure/signing-key-provider.ts`, `packages/config/`
**Tests Required:** Unit tests for multi-key verification and unknown-`kid` rejection.
**Documentation Required:** `docs/security/token-design.md` key-rotation section.
**Educational Notes:** The `kid` header pattern (also used by JWKS endpoints) is how production systems rotate signing keys with zero downtime — a frequently-skipped detail in tutorial-grade auth implementations.
**Deliverables:** Tested key rotation support.

---

### Issue 086 — Refresh token entity (opaque, hashed)
**Description:** `RefreshToken` entity storing only a hashed value (never the raw token) plus `familyId` (for reuse-detection chains, Issue 090), `sessionId`, and expiry, generated as a high-entropy opaque string rather than a JWT.
**Objective:** Keep refresh tokens revocable and unguessable, distinct in design from stateless access tokens.
**Acceptance Criteria:** Raw token generated with a CSPRNG of sufficient length; only its hash is persisted; factory rejects construction from a raw value directly.
**Dependencies:** 005, 061 (hash pattern reuse), 081
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/domain/entities/refresh-token.ts`
**Tests Required:** Unit tests for factory invariants and hash-only storage.
**Documentation Required:** `docs/security/token-design.md` update.
**Educational Notes:** Opaque tokens vs. JWTs for refresh tokens — opacity plus server-side hash storage means a leaked database dump alone doesn't yield usable tokens, mirroring password-hashing reasoning from Issue 061.
**Deliverables:** Tested refresh token entity.

---

### Issue 087 — Use case: `IssueSession`
**Description:** Orchestrates creating a `Session`, minting an access token (Issue 084) and refresh token (Issue 086), and persisting both — called by `AuthenticateWithPassword` (Issue 066) on successful login.
**Objective:** Provide the single entry point every login-succeeding flow (password, later MFA, later SSO) calls to obtain a token pair.
**Acceptance Criteria:** Returns an access/refresh pair plus session metadata; persists session and hashed refresh token atomically.
**Dependencies:** 066, 081, 083, 084, 086
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/application/use-cases/issue-session.ts`
**Tests Required:** Unit tests (fakes) + integration test for atomic persistence.
**Documentation Required:** `docs/guides/use-cases.md` cross-context orchestration section.
**Educational Notes:** Centralizing token issuance avoids subtly divergent session-creation logic as more login methods (MFA, SSO) are added in later phases.
**Deliverables:** Tested session-issuance use case.

---

### Issue 088 — Redis-backed revocation / deny-list adapter
**Description:** `RevocationList` port (`revoke(sessionId, ttl)`, `isRevoked(sessionId)`) with a Redis implementation using `sessionId` keys and TTLs matching access-token lifetime, checked on every access-token verification.
**Objective:** Let a revoked session's access tokens stop working immediately, despite access tokens otherwise being stateless.
**Acceptance Criteria:** Revoking a session causes subsequent `isRevoked` checks to return true until the entry naturally expires (bounded by original token TTL, keeping the deny-list small); Redis unavailability fails closed (documented decision).
**Dependencies:** 081, 083
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/application/ports/revocation-list.ts`, `infrastructure/redis-revocation-list.ts`
**Tests Required:** Integration tests against a real Redis instance (Testcontainers).
**Documentation Required:** `docs/security/token-design.md` revocation section.
**Educational Notes:** The classic stateless-JWT problem — "how do you revoke something you didn't store" — solved with a short-lived deny-list instead of a full session-store lookup on every request, bounding Redis memory by access-token TTL.
**Deliverables:** Tested Redis revocation adapter.

---

### Issue 089 — Use case: `RefreshAccessToken` (rotation)
**Description:** Exchanges a valid refresh token for a new access token *and* a new refresh token, immediately invalidating the presented refresh token (rotate-on-use).
**Objective:** Limit the lifetime of any single refresh token's usefulness to an attacker who intercepts one.
**Acceptance Criteria:** Successful refresh issues a new pair and marks the old refresh token used; reusing an already-rotated token is rejected (full behavior specified in Issue 090).
**Dependencies:** 084, 086, 087, 088
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/application/use-cases/refresh-access-token.ts`
**Tests Required:** Unit tests for rotation success and old-token rejection.
**Documentation Required:** `docs/security/token-design.md` rotation section.
**Educational Notes:** Refresh-token rotation as the standard mitigation for long-lived-credential theft — each use narrows the attacker's window instead of granting indefinite replay.
**Deliverables:** Tested refresh-rotation use case.

---

### Issue 090 — Refresh-token reuse detection (theft detection)
**Description:** When a refresh token that has already been rotated (superseded) is presented again, treat it as evidence of theft: revoke the entire token family (`familyId`) and the associated session, and emit a `RefreshTokenReuseDetected` security event.
**Objective:** Turn rotation (Issue 089) into an active theft-detection mechanism, not just a hygiene measure.
**Acceptance Criteria:** Reusing a superseded token revokes all tokens sharing its `familyId` and the underlying session; legitimate concurrent client retries within a defined grace window are documented as a known tradeoff.
**Dependencies:** 086, 088, 089
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/application/use-cases/refresh-access-token.ts`, `domain/events/refresh-token-reuse-detected.ts`
**Tests Required:** Unit tests simulating stolen-and-reused-token scenarios.
**Documentation Required:** `docs/security/token-design.md` theft-detection section.
**Educational Notes:** Reuse detection via token families is the technique that turns silent token theft into an observable, actionable security event — feeds directly into the audit trail built in Phase 10.
**Deliverables:** Tested reuse-detection behavior.

---

### Issue 091 — Use case: `Logout`
**Description:** Revokes the current session (Redis deny-list entry + refresh token invalidation) given a valid access or refresh token.
**Objective:** Provide the baseline single-session termination flow.
**Acceptance Criteria:** Post-logout, the access token fails `isRevoked` checks and the refresh token can no longer be used to refresh.
**Dependencies:** 088, 089
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/application/use-cases/logout.ts`
**Tests Required:** Unit tests confirming both token types are neutralized.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Logout must invalidate both the stateless access token (via deny-list) and the stateful refresh token — invalidating only one leaves a live credential behind.
**Deliverables:** Tested logout use case.

---

### Issue 092 — Use case: `LogoutEverywhere` (revoke all sessions)
**Description:** Revokes every active session for a given user, used by "log out all devices," password-change flows (Issue 070), and admin-initiated account lockdown.
**Objective:** Provide the blunt-force session-invalidation tool needed whenever a user's account may be compromised.
**Acceptance Criteria:** All active sessions for the user become unusable immediately; new logins after the call are unaffected.
**Dependencies:** 082, 088, 091
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/application/use-cases/logout-everywhere.ts`
**Tests Required:** Unit + integration tests with multiple concurrent sessions.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** This closes the loop referenced back in Issue 070 ("password reset must invalidate existing sessions") — that issue's stub now has a real implementation to call.
**Deliverables:** Tested logout-everywhere use case.

---

### Issue 093 — Session metadata capture (device/IP/user-agent)
**Description:** Extend `Session` with metadata (parsed user-agent, device label, IP address, geolocation hint if available) captured at issuance and updated on refresh.
**Objective:** Give users and admins enough context to recognize (or flag) a session as theirs.
**Acceptance Criteria:** Metadata populated on issuance; IP/user-agent changes across a refresh are recorded, not silently dropped, for later anomaly review.
**Dependencies:** 081, 087
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/domain/entities/session.ts`, `application/use-cases/issue-session.ts`
**Tests Required:** Unit tests for metadata capture and update-on-refresh.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Session metadata is the raw material for future anomaly detection (impossible-travel checks, new-device alerts) — captured now even though the analysis logic isn't built until later phases.
**Deliverables:** Sessions carrying device/IP metadata.

---

### Issue 094 — Concurrent session limit enforcement
**Description:** Optional per-user/org configurable cap on simultaneous active sessions; when exceeded, the oldest (or least-recently-active) session is evicted on new login.
**Objective:** Bound the blast radius of accumulated forgotten sessions without requiring manual cleanup.
**Acceptance Criteria:** Logging in past the configured limit revokes the oldest session; limit of `0`/unset disables enforcement; eviction is logged.
**Dependencies:** 082, 087, 093
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/application/use-cases/issue-session.ts`, `packages/config/`
**Tests Required:** Unit tests for eviction-at-limit and disabled-limit behavior.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Concurrent-session limits are a usability/security tradeoff seen in banking and enterprise SaaS apps — worth making configurable rather than hardcoded given Verixa's multi-tenant audience.
**Deliverables:** Tested session-limit enforcement.

---

### Issue 095 — Use case: `ListActiveSessions`
**Description:** Returns a user's active sessions (with metadata from Issue 093, excluding sensitive token material) so a self-service "manage your devices" experience can be built on top in Phase 12.
**Objective:** Give users visibility into and control over their own active sessions.
**Acceptance Criteria:** Returns only the requesting user's own sessions unless called with admin scope; excludes token hashes/raw values from output shape.
**Dependencies:** 082, 093
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/application/use-cases/list-active-sessions.ts`
**Tests Required:** Unit tests for scoping and output shape.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Read models should be shaped for their consumer, not simply the raw entity — excluding sensitive fields at the use-case boundary rather than trusting every future caller to remember to redact them.
**Deliverables:** Tested session-listing use case.

---

### Issue 096 — Composition-root wiring for `packages/sessions`
**Description:** Register session use cases, the Prisma/Redis adapters, and the token signer/key provider in `apps/api/src/composition-root.ts`, reading signing keys and Redis connection details from `packages/config`.
**Objective:** Make the sessions context consumable by the rest of the application ahead of Phase 12's route wiring.
**Acceptance Criteria:** Composition root resolves all sessions-package use cases with real (non-fake) adapters in a local/dev boot smoke test.
**Dependencies:** 050, 083, 088, 089, 090
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/composition-root.ts`
**Tests Required:** Boot smoke test asserting successful resolution.
**Documentation Required:** `docs/guides/composition-root.md` update.
**Educational Notes:** Composition-root wiring as a repeated checkpoint per context — catches missing config or circular-dependency issues early, before route handlers exist to mask them.
**Deliverables:** Sessions package wired into the composition root.

---

### Issue 097 — `packages/sessions` contract & unit test coverage gate
**Description:** Apply the Issue 037/076 coverage-gate pattern to `packages/sessions`.
**Objective:** Hold session/token logic — among the highest-stakes code in the system — to the same enforced coverage bar as prior contexts.
**Acceptance Criteria:** CI coverage gate active and passing for `packages/sessions`.
**Dependencies:** 081–096
**Estimated Complexity:** XS
**Files Affected:** `packages/sessions/vitest.config.ts`
**Tests Required:** N/A (meta-check).
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Repetition of the coverage-gate convention, now on a third context.
**Deliverables:** Enforced coverage gate.

---

### Issue 098 — Threat model: session & token flows
**Description:** STRIDE-based threat model for session issuance, refresh, revocation, and logout, covering token theft, replay, fixation, and revocation-bypass, cross-referencing which issues mitigate each threat.
**Objective:** Document the security reasoning behind Phase 05 as a coherent whole, feeding directly into Phase 11's hardening review and Phase 15's rate-limiting priorities.
**Acceptance Criteria:** Threat model covers all STRIDE categories relevant to session management; each identified threat maps to a mitigating issue or an accepted-risk note.
**Dependencies:** 081–096
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-sessions.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Session/token threat modeling as a distinct discipline from credential threat modeling (Issue 077) — different attacker capabilities (network interception vs. credential guessing) demand different mitigations.
**Deliverables:** Published threat model.

---

### Issue 099 — `packages/sessions` public API surface
**Description:** Curate `index.ts` exports for the sessions package, applying the boundary-enforcement pattern from Issue 038/078.
**Objective:** Keep session internals (raw token generation, Redis key formats) encapsulated from consumers in Phase 06 and Phase 12.
**Acceptance Criteria:** Only intended use cases/types exported; deep-import lint rule extended to this package.
**Dependencies:** 038, 078, 081–096
**Estimated Complexity:** XS
**Files Affected:** `packages/sessions/index.ts`, `.eslintrc.cjs`
**Tests Required:** Lint rule verification.
**Documentation Required:** None beyond existing guide.
**Educational Notes:** N/A (pattern reuse).
**Deliverables:** Curated public API.

---

### Issue 100 — Sessions & tokens educational walkthrough
**Description:** Write `docs/guides/tutorials/build-session-management.md`, a from-scratch narrative covering access/refresh token design, rotation, reuse detection, and revocation, using Phase 05 code as the worked example.
**Objective:** Deliver the flagship "how JWT sessions actually work in production" educational artifact, correcting common tutorial-grade mistakes (storing JWTs as if they were revocable by default, skipping rotation).
**Acceptance Criteria:** Walkthrough covers stateless-vs-stateful token tradeoffs, rotation, theft detection, and revocation, linking every claim to real code/tests in the repo.
**Dependencies:** 081–099
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-session-management.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.

---
