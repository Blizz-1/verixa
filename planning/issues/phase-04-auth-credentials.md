# Phase 04 — Auth: Credentials & Passwords (Issues 061–080)

Builds `packages/credentials`: password hashing/policy, registration, login,
verification, and recovery flows on top of the identity context from Phases 02–03.

---

### Issue 061 — Password hashing service (argon2id)
**Description:** Implement `PasswordHasher` port + argon2id adapter with tuned cost parameters, in `packages/credentials`.
**Objective:** Establish a secure, upgradeable password hashing foundation before any credential flow is built.
**Acceptance Criteria:** `hash`/`verify` round-trip works; parameters configurable; known-weak algorithms (md5/sha1/plain bcrypt-only) rejected in code review checklist doc.
**Dependencies:** 007, 038
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/application/ports/password-hasher.ts`, `infrastructure/argon2-password-hasher.ts`
**Tests Required:** Unit tests for hash/verify, wrong-password rejection, timing not obviously short-circuited.
**Documentation Required:** `docs/security/password-storage.md`
**Educational Notes:** Why argon2id over bcrypt/scrypt in 2026; salt/pepper concepts; cost parameter tuning tradeoffs.
**Deliverables:** Tested password hasher.

---

### Issue 062 — Password policy value object
**Description:** `PasswordPolicy`/`RawPassword` value object enforcing minimum length, breach-list check hook (interface only, provider added later), rejecting known-weak patterns.
**Objective:** Centralize password strength rules instead of scattering regexes.
**Acceptance Criteria:** Policy configurable; unit tests for boundary cases (min length, common password rejection stub).
**Dependencies:** 006, 021
**Estimated Complexity:** S
**Files Affected:** `packages/credentials/domain/value-objects/raw-password.ts`
**Tests Required:** Unit tests per rule.
**Documentation Required:** `docs/security/password-storage.md` policy section.
**Educational Notes:** NIST 800-63B guidance: length over complexity rules, breach-list checks over forced rotation.
**Deliverables:** Tested password policy.

---

### Issue 063 — `Credential` entity & repository port
**Description:** `Credential` aggregate (userId, passwordHash, algorithm version, updatedAt) and `CredentialRepository` port, separate from `User` so identity and credentials remain independently replaceable (e.g. future SSO-only users have no credential).
**Objective:** Decouple "who a user is" from "how they prove it."
**Acceptance Criteria:** Entity constructed only via factory taking a hashed password (never raw); port defined with `findByUserId`/`save`.
**Dependencies:** 005, 061
**Estimated Complexity:** S
**Files Affected:** `packages/credentials/domain/entities/credential.ts`, `application/ports/credential-repository.ts`
**Tests Required:** Unit tests for factory invariants.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Separating identity from authentication method — why this pays off once SSO/passkeys arrive.
**Deliverables:** Tested `Credential` entity + port.

---

### Issue 064 — `credentials` table & Prisma repository
**Description:** Prisma model + `PrismaCredentialRepository`, contract-tested per the Phase 03 pattern. Password hash never selected by default query (explicit opt-in field selection).
**Objective:** Persist credentials safely, minimizing accidental hash exposure in logs/responses.
**Acceptance Criteria:** Default `findByUserId` used for auth excludes hash from any accidental serialization path in tests; contract tests pass.
**Dependencies:** 046, 056, 063
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma`, `packages/credentials/infrastructure/persistence/prisma-credential-repository.ts`
**Tests Required:** Contract tests + serialization-safety test.
**Documentation Required:** `docs/security/password-storage.md` update.
**Educational Notes:** Accidental secret exposure via `JSON.stringify`/logging — a recurring real-world bug class.
**Deliverables:** Tested credential persistence.

---

### Issue 065 — Use case: `RegisterUserWithPassword`
**Description:** Orchestrates `RegisterUser` (Issue 030) + credential creation as one transactional use case, emitting `UserRegistered`.
**Objective:** First end-to-end registration flow combining identity + credentials contexts.
**Acceptance Criteria:** Weak password rejected before any persistence; success creates both `User` and `Credential` atomically.
**Dependencies:** 030, 062, 063, 064
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/application/use-cases/register-user-with-password.ts`
**Tests Required:** Unit tests (fakes) + integration test (real DB) for atomicity.
**Documentation Required:** `docs/guides/use-cases.md` cross-context orchestration section.
**Educational Notes:** Orchestrating across bounded contexts without contexts depending on each other's internals.
**Deliverables:** Tested registration use case.

---

### Issue 066 — Use case: `AuthenticateWithPassword`
**Description:** Verifies email+password against stored credential, using constant-time comparison and generic error messages (no user-enumeration).
**Objective:** Core login use case, security-reviewed for enumeration/timing issues.
**Acceptance Criteria:** Unknown email and wrong password return the *same* generic error and take comparable time (documented, not micro-benchmarked); correct credentials succeed.
**Dependencies:** 061, 064
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/application/use-cases/authenticate-with-password.ts`
**Tests Required:** Unit tests for unknown-user, wrong-password, success paths; enumeration-resistance test asserting identical error shape.
**Documentation Required:** `docs/security/authentication-flows.md`
**Educational Notes:** User enumeration as an OWASP-listed real vulnerability class; how "helpful" error messages leak info.
**Deliverables:** Tested authentication use case.

---

### Issue 067 — Account lockout on repeated failures
**Description:** Track failed login attempts per credential (counter + `lockedUntil`), lock temporarily after N failures, with exponential backoff.
**Objective:** Slow down credential-stuffing/brute-force attacks without permanently locking out legitimate users.
**Acceptance Criteria:** Nth consecutive failure locks the account for a configurable window; successful login resets the counter; locked-account login attempt returns a distinct (but still enumeration-safe) error.
**Dependencies:** 066
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/domain/entities/credential.ts` (lockout fields), `authenticate-with-password.ts`
**Tests Required:** Unit tests for lockout threshold, backoff, reset-on-success.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Brute-force mitigation tradeoffs: lockout vs. rate limiting vs. CAPTCHA (full rate-limiting in Phase 15).
**Deliverables:** Tested lockout behavior.

---

### Issue 068 — Email verification token flow
**Description:** `EmailVerificationToken` entity (hashed, expiring, single-use) + use cases `RequestEmailVerification` / `ConfirmEmailVerification`, transitioning `User` from `pending` to `active`.
**Objective:** Confirm email ownership before granting full account privileges.
**Acceptance Criteria:** Expired/used tokens rejected; successful confirmation activates the user and emits an event.
**Dependencies:** 023, 045 (pattern reuse), 065
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/domain/entities/email-verification-token.ts`, `application/use-cases/*.ts`
**Tests Required:** Unit + integration tests for expiry, single-use, activation.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Why email verification tokens must be single-use and short-lived, distinct from session tokens.
**Deliverables:** Tested email verification flow.

---

### Issue 069 — Password reset request flow
**Description:** `PasswordResetToken` entity + `RequestPasswordReset` use case, always returning a generic success response regardless of whether the email exists (enumeration-safe), delegating actual email send to a port implemented in Phase 14.
**Objective:** Start the reset flow securely, deferring only the delivery mechanism.
**Acceptance Criteria:** Response identical whether or not email exists; token generated only when it does (verified via internal event, not response).
**Dependencies:** 045, 066
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/domain/entities/password-reset-token.ts`, `application/use-cases/request-password-reset.ts`
**Tests Required:** Unit tests for enumeration-safety and token generation.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Same enumeration principle as Issue 066, applied to a different flow — pattern recognition for contributors.
**Deliverables:** Tested reset-request use case.

---

### Issue 070 — Password reset confirmation flow
**Description:** `ConfirmPasswordReset` use case validating the reset token, enforcing password policy, replacing the credential, and invalidating all existing sessions (interface call into Phase 05, stubbed until then).
**Objective:** Complete the reset flow safely, including the critical "kill existing sessions" security step.
**Acceptance Criteria:** Valid token + valid new password succeeds and marks token used; invalid/expired/reused token rejected.
**Dependencies:** 062, 069
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/application/use-cases/confirm-password-reset.ts`
**Tests Required:** Unit + integration tests for all rejection paths and the success path.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Why a password reset must invalidate existing sessions — a commonly missed step (attacker with a hijacked session survives a password change otherwise).
**Deliverables:** Tested reset-confirmation use case.

---

### Issue 071 — Credential rotation / change-password use case
**Description:** `ChangePassword` use case for an authenticated user changing their own password, requiring current password re-entry.
**Objective:** Distinct from reset — a lower-friction flow for a logged-in user with a known current password.
**Acceptance Criteria:** Wrong current password rejected; success updates credential and emits `PasswordChanged`.
**Dependencies:** 066
**Estimated Complexity:** S
**Files Affected:** `packages/credentials/application/use-cases/change-password.ts`
**Tests Required:** Unit tests for wrong-current-password and success paths.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Re-authentication for sensitive actions ("step-up auth") as a general pattern, previewed for Phase 06 MFA step-up.
**Deliverables:** Tested change-password use case.

---

### Issue 072 — Password history / reuse prevention
**Description:** Store hashes of the last N passwords per credential; reject reuse on change/reset.
**Objective:** Prevent trivial "change and change back" bypasses of the reset flow.
**Acceptance Criteria:** Reusing one of the last N passwords rejected with a clear error; history capped at N entries.
**Dependencies:** 070, 071
**Estimated Complexity:** S
**Files Affected:** `packages/credentials/domain/entities/credential.ts`, migration
**Tests Required:** Unit tests for reuse rejection and history capping.
**Documentation Required:** `docs/security/password-storage.md` update.
**Educational Notes:** Balancing security theater vs. real value — NIST now deprioritizes forced rotation but still endorses reuse prevention.
**Deliverables:** Tested password-history enforcement.

---

### Issue 073 — Argon2 parameter migration-on-login
**Description:** On successful login, if the stored hash was created with outdated parameters, transparently re-hash with current parameters.
**Objective:** Allow hashing cost to increase over time (hardware gets faster) without a forced mass password reset.
**Acceptance Criteria:** Login with an outdated-parameter hash succeeds and results in an updated hash on next read.
**Dependencies:** 061, 066
**Estimated Complexity:** S
**Files Affected:** `packages/credentials/application/use-cases/authenticate-with-password.ts`
**Tests Required:** Unit test simulating an old-parameter hash and asserting migration.
**Documentation Required:** `docs/security/password-storage.md` update.
**Educational Notes:** Cost-parameter migration as an ongoing security maintenance task, not a one-time decision.
**Deliverables:** Transparent hash migration.

---

### Issue 074 — Rate-limited credential endpoints (interface stub)
**Description:** Define the `RateLimiter` port used by login/reset/register use cases and wire calls to it (no-op implementation until Phase 15).
**Objective:** Ensure abuse-sensitive use cases are rate-limit-aware from day one, even before the real limiter exists.
**Acceptance Criteria:** Each abuse-sensitive use case accepts/consults a `RateLimiter` port; no-op adapter used in tests.
**Dependencies:** 065, 066, 069
**Estimated Complexity:** S
**Files Affected:** `packages/shared-kernel/application/ports/rate-limiter.ts`
**Tests Required:** Unit test confirming the port is consulted (spy/mock).
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Designing seams for cross-cutting concerns before they're implemented — avoids a painful retrofit later.
**Deliverables:** Rate-limiter port wired into credential use cases.

---

### Issue 075 — Credential deletion on account deletion
**Description:** Ensure `Credential`, verification tokens, and reset tokens are deleted/invalidated when a `User` is soft-deleted (Issue 054).
**Objective:** Prevent orphaned, still-valid credentials for a "deleted" account.
**Acceptance Criteria:** Deleting a user invalidates all outstanding tokens and marks the credential unusable; login attempt post-deletion fails safely.
**Dependencies:** 054, 064, 068, 069
**Estimated Complexity:** S
**Files Affected:** `packages/credentials/application/use-cases/handle-user-deleted.ts` (event handler)
**Tests Required:** Integration test: delete user, attempt login, assert failure.
**Documentation Required:** `docs/guides/domain-events.md` cross-context event-handling section.
**Educational Notes:** Event-driven cross-context consistency — credentials reacting to identity events instead of identity knowing about credentials.
**Deliverables:** Tested cleanup handler.

---

### Issue 076 — Credential context contract & unit test coverage gate
**Description:** Apply the Phase 02 coverage-gate pattern (Issue 037) to `packages/credentials`.
**Objective:** Maintain test discipline as a second full context is completed.
**Acceptance Criteria:** CI coverage gate active and passing for `packages/credentials`.
**Dependencies:** 061–075
**Estimated Complexity:** XS
**Files Affected:** `packages/credentials/vitest.config.ts`
**Tests Required:** N/A (meta-check).
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Repetition of the coverage-gate pattern as a convention, not a one-off.
**Deliverables:** Enforced coverage gate.

---

### Issue 077 — Threat model: credential flows
**Description:** Write a threat model (STRIDE-based) for registration/login/reset/change flows, covering enumeration, brute force, token theft, and credential stuffing, cross-referencing which issues mitigate each threat.
**Objective:** Document *why* the security choices in Phase 04 were made as a coherent whole, not just issue-by-issue.
**Acceptance Criteria:** Threat model covers all STRIDE categories relevant to auth; each identified threat maps to a mitigating issue or an accepted-risk note.
**Dependencies:** 061–075
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-credentials.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** How to run a lightweight STRIDE threat-modeling session, worked example included.
**Deliverables:** Published threat model.

---

### Issue 078 — `packages/credentials` public API surface
**Description:** Curate `index.ts` exports for the credentials package, applying the boundary-enforcement pattern from Issue 038.
**Objective:** Keep the credentials context's internals encapsulated as it's consumed by `apps/api` in Phase 12.
**Acceptance Criteria:** Only intended use cases/types exported; deep-import lint rule extended to this package.
**Dependencies:** 038, 061–075
**Estimated Complexity:** XS
**Files Affected:** `packages/credentials/index.ts`, `.eslintrc.cjs`
**Tests Required:** Lint rule verification.
**Documentation Required:** None beyond existing guide.
**Educational Notes:** N/A (pattern reuse).
**Deliverables:** Curated public API.

---

### Issue 079 — OWASP ASVS self-assessment for credential flows
**Description:** Run through relevant OWASP Application Security Verification Standard (ASVS) V2 (authentication) checklist items against Phase 04's implementation, documenting pass/fail/N-A with rationale.
**Objective:** Validate the credential flows against an industry-standard checklist, not just internal judgment.
**Acceptance Criteria:** Checklist completed for all V2 items; any failing item has a linked follow-up issue.
**Dependencies:** 077
**Estimated Complexity:** S
**Files Affected:** `docs/security/asvs-self-assessment.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Introduces ASVS as a practical standard contributors can use on their own projects.
**Deliverables:** Published ASVS self-assessment (credentials section).

---

### Issue 080 — Credential flows educational walkthrough
**Description:** Write `docs/guides/tutorials/build-secure-authentication.md`, a from-scratch narrative of designing registration/login/reset with security reasoning at each step, using Phase 04 code as the example.
**Objective:** Deliver the flagship "how to build auth correctly" educational artifact the project's mission centers on.
**Acceptance Criteria:** Walkthrough covers hashing choice, enumeration resistance, lockout, token design, and links every claim to real code/tests in the repo.
**Dependencies:** 061–079
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-secure-authentication.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.
