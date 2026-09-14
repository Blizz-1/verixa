# Phase 06 — Multi-Factor Authentication (Issues 101–120)

Builds `packages/mfa`: TOTP, backup codes, and WebAuthn/passkey second factors, an
enforcement policy engine, and the step-up/recovery flows that gate session issuance
from Phase 05 (`packages/sessions`, issues 081–100) behind a completed MFA challenge.

---

### Issue 101 — `MfaMethod` domain aggregate & method-type model
**Description:** `MfaMethod` aggregate (id, userId, type: `totp | webauthn | backup-codes`, status: `pending | active | disabled`, createdAt, lastUsedAt) representing one enrolled second factor, plus a `MfaMethodType` value object enumerating supported types.
**Objective:** Establish the shared shape every concrete method (TOTP, WebAuthn, backup codes) attaches to, before any credential-specific logic is written.
**Acceptance Criteria:** Aggregate exposes `activate`/`disable`/`recordUse` behavior; a user may hold multiple active methods; invariant enforced that `pending` methods cannot satisfy a challenge.
**Dependencies:** 004, 005, 006
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/domain/entities/mfa-method.ts`, `domain/value-objects/mfa-method-type.ts`
**Tests Required:** Unit tests for state transitions and the pending-cannot-challenge invariant.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Modeling MFA methods as a single aggregate family (rather than three unrelated tables) keeps enrollment/enforcement logic method-agnostic — new factor types (e.g. future hardware tokens) plug into the same lifecycle without touching enforcement code.
**Deliverables:** Tested `MfaMethod` aggregate and type enum.

---

### Issue 102 — TOTP secret generation & provisioning URI
**Description:** `TotpSecret` value object (CSPRNG-generated base32 secret) and a `TotpAlgorithm` domain service implementing RFC 6238 (HMAC-SHA1, 30s step, 6 digits) plus `otpauth://` provisioning-URI generation for QR display.
**Objective:** Produce a standards-compliant TOTP secret and code generator independent of any specific authenticator app.
**Acceptance Criteria:** Generated codes verify against known RFC 6238 test vectors; provisioning URI includes issuer/account label; secret never logged in plaintext.
**Dependencies:** 005, 101
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/domain/value-objects/totp-secret.ts`, `domain/services/totp-algorithm.ts`
**Tests Required:** Unit tests against RFC 6238 vectors.
**Documentation Required:** `docs/security/mfa-design.md` TOTP section.
**Educational Notes:** TOTP's security rests on a shared secret plus synchronized clocks, not secrecy of the algorithm — RFC 6238 test vectors are the standard way to prove an implementation is actually interoperable with real authenticator apps.
**Deliverables:** Tested TOTP secret/algorithm implementation.

---

### Issue 103 — Use case: `EnrollTotp`
**Description:** Generates a `TotpSecret`, creates a `pending` `MfaMethod`, and returns the provisioning URI/QR payload — the secret is not yet trusted until Issue 104 confirms the user's device.
**Objective:** Let a user begin adding a TOTP authenticator without immediately activating an unverified secret.
**Acceptance Criteria:** Creates exactly one `pending` TOTP method per call; secret returned once to the caller and never persisted in plaintext, only encrypted-at-rest.
**Dependencies:** 101, 102, 105
**Estimated Complexity:** S
**Files Affected:** `packages/mfa/application/use-cases/enroll-totp.ts`
**Tests Required:** Unit tests for pending-method creation and single-use secret exposure.
**Documentation Required:** `docs/security/mfa-design.md` enrollment section.
**Educational Notes:** Requiring a confirmation round-trip (Issue 104) before activation prevents a user from locking themselves out with a secret they never actually scanned successfully.
**Deliverables:** Tested TOTP enrollment use case.

---

### Issue 104 — Use case: `ConfirmTotpEnrollment`
**Description:** Verifies a user-submitted TOTP code against the `pending` method's secret; on success, transitions the method to `active`.
**Objective:** Prove device possession before a TOTP method can gate future logins.
**Acceptance Criteria:** Correct code activates the method; incorrect code leaves it `pending` and is rate-limited; already-active methods reject re-confirmation.
**Dependencies:** 102, 103
**Estimated Complexity:** S
**Files Affected:** `packages/mfa/application/use-cases/confirm-totp-enrollment.ts`
**Tests Required:** Unit tests for success, failure, and rate-limit paths.
**Documentation Required:** `docs/security/mfa-design.md` enrollment section.
**Educational Notes:** Rate-limiting confirmation attempts matters even at enrollment time — a 6-digit code has only 10^6 possibilities, so unthrottled guessing is feasible within a 30-second window.
**Deliverables:** Tested TOTP confirmation use case.

---

### Issue 105 — Use case: `VerifyTotpChallenge`
**Description:** Verifies a submitted TOTP code at login/step-up time against an `active` method, allowing a configurable ±1 time-step drift window and rejecting immediate code reuse within the same step.
**Objective:** Provide the login-time TOTP check, tolerant of minor clock skew but resistant to trivial replay.
**Acceptance Criteria:** Codes within the drift window verify; a code already consumed for the current step is rejected on replay; `lastUsedAt` updated on success.
**Dependencies:** 101, 102, 104
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/application/use-cases/verify-totp-challenge.ts`
**Tests Required:** Unit tests for drift tolerance, replay rejection, and expiry.
**Documentation Required:** `docs/security/mfa-design.md` verification section.
**Educational Notes:** Clock-drift tolerance is a usability necessity (phones and servers rarely agree to the second) but each extra step widens the guessable window — replay-within-step tracking closes the resulting reuse gap.
**Deliverables:** Tested TOTP challenge verification.

---

### Issue 106 — `MfaMethodRepository` port & in-memory fake
**Description:** Define `MfaMethodRepository` port (`save`, `findById`, `findActiveByUserId`, `findPendingByUserId`, `delete`) plus an in-memory fake following the Issue 031 contract-test pattern.
**Objective:** Let MFA use cases be written and tested before persistence exists.
**Acceptance Criteria:** Fake passes the shared contract test suite; port has no framework/Prisma types.
**Dependencies:** 031, 101
**Estimated Complexity:** S
**Files Affected:** `packages/mfa/application/ports/mfa-method-repository.ts`, `infrastructure/fakes/in-memory-mfa-method-repository.ts`
**Tests Required:** Contract tests against the fake.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Reuse of the port/fake/contract-test pattern established in Issue 031 — consistency lowers onboarding cost for new contributors.
**Deliverables:** Tested port + fake.

---

### Issue 107 — `mfa_methods` table & `PrismaMfaMethodRepository`
**Description:** Prisma model for MFA methods (encrypted-at-rest TOTP secret column, indexed on `userId`), plus a `PrismaMfaMethodRepository` implementing Issue 106's port using the Issue 056 error-mapping pattern.
**Objective:** Persist enrolled methods durably with secrets encrypted at the storage layer, not merely hashed.
**Acceptance Criteria:** Contract tests (Issue 047 Testcontainers harness) pass against the real database; TOTP secret column verified encrypted, not plaintext, via a direct-row assertion in tests.
**Dependencies:** 046, 047, 052, 056, 106
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma`, `packages/mfa/infrastructure/persistence/prisma-mfa-method-repository.ts`
**Tests Required:** Contract tests against real Postgres, including a raw-row encryption assertion.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** TOTP secrets must be *decryptable* (the server needs the plaintext to compute codes), unlike passwords which are one-way hashed — this distinction changes the storage strategy entirely: symmetric encryption with a managed key, not a hash function.
**Deliverables:** Tested Prisma-backed MFA method persistence.

---

### Issue 108 — Backup codes generation & hashed storage
**Description:** `BackupCodeSet` domain service generating N (default 10) high-entropy, human-formatted single-use codes via CSPRNG; only per-code hashes are persisted, mirroring the Issue 061 password-hashing pattern.
**Objective:** Provide an offline recovery factor usable when TOTP/WebAuthn devices are unavailable.
**Acceptance Criteria:** Generated codes are unique within a set, sufficiently high-entropy to resist offline guessing, and only hashes are ever persisted; raw codes returned to the caller exactly once.
**Dependencies:** 061, 101
**Estimated Complexity:** S
**Files Affected:** `packages/mfa/domain/services/backup-code-set.ts`
**Tests Required:** Unit tests for entropy/uniqueness and hash-only persistence.
**Documentation Required:** `docs/security/mfa-design.md` backup-codes section.
**Educational Notes:** Backup codes are effectively low-entropy passwords and deserve the same hash-and-never-store-plaintext treatment as Issue 061's credential work — a second factor is only as strong as its weakest storage decision.
**Deliverables:** Tested backup-code generation service.

---

### Issue 109 — Use case: `GenerateBackupCodes`
**Description:** Issues a fresh set of backup codes for a user, invalidating any previously issued set outright (no mixing old/new codes), and creates/updates the corresponding `MfaMethod`.
**Objective:** Give users a self-service way to obtain or rotate their recovery codes.
**Acceptance Criteria:** Regenerating invalidates all prior codes atomically; returned raw codes are shown once and never retrievable again; action is audit-logged.
**Dependencies:** 108
**Estimated Complexity:** S
**Files Affected:** `packages/mfa/application/use-cases/generate-backup-codes.ts`
**Tests Required:** Unit tests for atomic invalidation-and-reissue.
**Documentation Required:** `docs/security/mfa-design.md` backup-codes section.
**Educational Notes:** Full-set invalidation on regeneration avoids the confusing and insecure alternative of an ever-growing pool of "maybe still valid" codes.
**Deliverables:** Tested backup-code issuance use case.

---

### Issue 110 — Use case: `ConsumeBackupCode`
**Description:** Verifies a submitted backup code against the stored hash set and marks that single code used, rejecting any subsequent reuse of the same code.
**Objective:** Provide the login-time/step-up-time backup-code check as a single-use credential.
**Acceptance Criteria:** Correct, unused code verifies and is marked consumed; reuse of a consumed code is rejected; exhaustion of all codes surfaces a "regenerate needed" signal to the caller.
**Dependencies:** 108, 109
**Estimated Complexity:** S
**Files Affected:** `packages/mfa/application/use-cases/consume-backup-code.ts`
**Tests Required:** Unit tests for consume-once semantics and exhaustion signaling.
**Documentation Required:** `docs/security/mfa-design.md` backup-codes section.
**Educational Notes:** Single-use consumption is what distinguishes a backup code from a second password — reuse must be structurally impossible, not merely discouraged.
**Deliverables:** Tested backup-code consumption use case.

---

### Issue 111 — `WebAuthnCredential` entity & repository
**Description:** `WebAuthnCredential` entity (credentialId, publicKey, signCounter, transports, attestationType, associated `MfaMethod`) plus a `WebAuthnCredentialRepository` port with an in-memory fake and a `PrismaWebAuthnCredentialRepository`.
**Objective:** Model the FIDO2/WebAuthn credential shape needed to verify future authentication ceremonies, independent of registration/assertion flow logic.
**Acceptance Criteria:** Entity stores only the public key (never a private key, which never leaves the authenticator); signCounter update path defined for clone-detection use in Issue 113; contract tests pass against both fake and Prisma-backed repository.
**Dependencies:** 031, 047, 056, 101, 106
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/domain/entities/webauthn-credential.ts`, `application/ports/webauthn-credential-repository.ts`, `infrastructure/persistence/prisma-webauthn-credential-repository.ts`
**Tests Required:** Contract tests against fake and real Postgres.
**Documentation Required:** `docs/security/mfa-design.md` WebAuthn section.
**Educational Notes:** WebAuthn's core security property is that the server only ever holds a public key — even a full database breach yields nothing usable to impersonate a user, unlike a stolen password hash which is at least offline-crackable.
**Deliverables:** Tested WebAuthn credential entity + repositories.

---

### Issue 112 — Use case: `RegisterWebAuthnCredential`
**Description:** Implements the WebAuthn registration ceremony: issues a random challenge, verifies the returned attestation object's signature and origin/RP ID binding, and persists the resulting `WebAuthnCredential` as an `active` `MfaMethod`.
**Objective:** Let a user enroll a passkey or hardware security key as a second factor.
**Acceptance Criteria:** Registration succeeds only for a matching, unexpired challenge and correct RP ID/origin; malformed or origin-mismatched attestations are rejected; challenge is single-use.
**Dependencies:** 101, 111
**Estimated Complexity:** L
**Files Affected:** `packages/mfa/application/use-cases/register-webauthn-credential.ts`, `infrastructure/webauthn/attestation-verifier.ts`
**Tests Required:** Unit tests with recorded attestation fixtures covering success, origin mismatch, and expired-challenge cases.
**Documentation Required:** `docs/security/mfa-design.md` WebAuthn registration section.
**Educational Notes:** Origin/RP-ID binding is what makes WebAuthn phishing-resistant — a credential registered for `verixa.example` simply will not produce a valid assertion on a look-alike domain, unlike a TOTP code which a phished user can be tricked into relaying.
**Deliverables:** Tested WebAuthn registration use case.

---

### Issue 113 — Use case: `VerifyWebAuthnAssertion`
**Description:** Implements the WebAuthn authentication ceremony: issues a challenge, verifies the returned assertion's signature against the stored public key, checks the signature counter increased (clone-detection), and updates `lastUsedAt`.
**Objective:** Provide the login-time/step-up-time passkey check.
**Acceptance Criteria:** Valid assertion with an increased counter verifies; a non-increasing counter is flagged as suspected credential cloning and rejected with a security event emitted; challenge is single-use.
**Dependencies:** 111, 112
**Estimated Complexity:** L
**Files Affected:** `packages/mfa/application/use-cases/verify-webauthn-assertion.ts`, `domain/events/webauthn-clone-suspected.ts`
**Tests Required:** Unit tests for valid assertion, stale-counter rejection, and expired-challenge rejection.
**Documentation Required:** `docs/security/mfa-design.md` WebAuthn assertion section.
**Educational Notes:** The signature counter is FIDO2's built-in clone-detection mechanism — a cloned authenticator's counter will eventually diverge from the genuine device's, and a non-increasing value is a strong tamper signal worth escalating, not silently swallowing.
**Deliverables:** Tested WebAuthn assertion verification.

---

### Issue 114 — MFA enforcement policy engine
**Description:** `MfaEnforcementPolicy` value object/service resolving, per organization and per user, whether MFA is `required`, `optional`, or `disabled`, and which method types are permitted, driven by config (Issue 023-style typed config) with org-level overrides.
**Objective:** Let administrators mandate MFA (e.g. for admin roles or an entire org) rather than leaving it perpetually opt-in.
**Acceptance Criteria:** Policy resolution is deterministic given user/org/role inputs; a `required` policy with zero enrolled methods blocks login until enrollment (behavior specified in Issue 116); unit tests cover override precedence (user > role > org > global default).
**Dependencies:** 101, 106
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/domain/services/mfa-enforcement-policy.ts`, `packages/config/`
**Tests Required:** Unit tests for precedence and required-but-unenrolled resolution.
**Documentation Required:** `docs/security/mfa-design.md` enforcement-policy section.
**Educational Notes:** Making enforcement configurable rather than a global on/off switch mirrors real organizational needs — a bank might mandate MFA org-wide while a hobby project leaves it opt-in per user, and admin roles often need stricter defaults than regular users.
**Deliverables:** Tested enforcement policy engine.

---

### Issue 115 — Pending-MFA challenge token & session-issuance gate
**Description:** `MfaChallenge` entity representing a short-lived, single-use "password verified, MFA pending" state (distinct from a full `Session`, Issue 081), returned by password authentication when the resolved enforcement policy (Issue 114) requires a second factor, and consumed by `IssueSession` (Issue 087) only after a method-specific verification use case succeeds.
**Objective:** Bridge Phase 05's session issuance to Phase 06's MFA verification without granting a real session on password success alone.
**Acceptance Criteria:** `MfaChallenge` cannot itself authorize API access; it expires quickly (e.g. 5 minutes); successful verification against it calls `IssueSession` exactly once; expired or already-consumed challenges are rejected.
**Dependencies:** 084, 087, 101, 114
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/domain/entities/mfa-challenge.ts`, `packages/sessions/application/use-cases/issue-session.ts`
**Tests Required:** Unit tests for challenge expiry, single-use consumption, and correct downstream `IssueSession` invocation.
**Documentation Required:** `docs/security/mfa-design.md` and `docs/security/token-design.md` cross-reference.
**Educational Notes:** Separating "password verified" from "session issued" by an intermediate, deliberately weak, single-purpose token is what prevents a bug in the MFA check from accidentally granting a full session on password alone — a real vulnerability class in tutorial-grade MFA implementations that bolt verification on after the fact.
**Deliverables:** Tested MFA-challenge-gated session issuance.

---

### Issue 116 — Integrate MFA challenge into `AuthenticateWithPassword`
**Description:** Modify the Phase 05/04 login flow (`AuthenticateWithPassword`, Issue 066) to branch: on successful password verification, if the resolved policy (Issue 114) requires MFA or the user has active methods, return an `MfaChallenge` (Issue 115) instead of a session; if no methods are enrolled and policy is `required`, return an enrollment-required response instead of a challenge.
**Objective:** Make MFA a real gate in the primary login path rather than a side feature nothing actually calls.
**Acceptance Criteria:** Users with no active MFA methods and an `optional`/`disabled` policy log in unchanged; users with active methods always receive a challenge; `required`-but-unenrolled users are routed to enrollment, never granted a session.
**Dependencies:** 066, 114, 115
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/application/use-cases/authenticate-with-password.ts`, `packages/mfa/application/use-cases/*`
**Tests Required:** Unit tests for all three branches (no-MFA, challenge-issued, enrollment-required).
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** This is the seam where two bounded contexts (Credentials and MFA) must cooperate without either depending on the other's internals directly — the login use case orchestrates across ports rather than the MFA package reaching backward into credential logic.
**Deliverables:** MFA-integrated password login flow.

---

### Issue 117 — Use case: `StepUpAuthentication`
**Description:** Requires re-verification of an active MFA method for an already-authenticated user before allowing a sensitive action (e.g. changing email, disabling MFA, admin operations), issuing a short-lived `stepUpVerifiedAt` claim scoped narrowly in time rather than re-issuing a full session.
**Objective:** Provide defense-in-depth for high-risk actions beyond baseline session possession, without forcing a full re-login.
**Acceptance Criteria:** Sensitive-action endpoints can require a fresh step-up assertion (configurable max age, e.g. 5 minutes); step-up verification reuses the same TOTP/WebAuthn/backup-code verification use cases rather than duplicating logic; expired step-up state is rejected.
**Dependencies:** 084, 105, 110, 113
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/application/use-cases/step-up-authentication.ts`, `packages/sessions/domain/entities/session.ts`
**Tests Required:** Unit tests for fresh-verification success, staleness rejection, and reuse of underlying verification use cases.
**Documentation Required:** `docs/security/mfa-design.md` step-up section.
**Educational Notes:** Step-up auth addresses the reality that a long-lived session token is a weaker guarantee than "the user is present right now" — banking and cloud-console UIs re-prompt for a second factor before irreversible actions precisely because session possession alone (e.g. via a stolen laptop left unlocked) isn't sufficient evidence.
**Deliverables:** Tested step-up authentication use case.

---

### Issue 118 — MFA recovery flow (lost-all-methods)
**Description:** Admin-assisted (or, where configured, identity-re-verification-assisted) recovery use case for a user who has lost access to all enrolled MFA methods and exhausted backup codes: disables the user's existing methods after strong out-of-band verification, forces immediate re-enrollment on next login, and revokes all active sessions (Issue 092) as a precaution.
**Objective:** Provide a safe last-resort path that doesn't become an MFA-bypass backdoor.
**Acceptance Criteria:** Recovery requires an elevated admin action (or documented equivalent) that is itself audit-logged with actor identity; recovery immediately revokes all active sessions and clears (not silently reactivates) existing MFA methods; the flow cannot be self-triggered by an unauthenticated attacker.
**Dependencies:** 092, 101, 114
**Estimated Complexity:** M
**Files Affected:** `packages/mfa/application/use-cases/recover-mfa-access.ts`
**Tests Required:** Unit tests for authorization gating, session revocation, and method-clearing behavior.
**Documentation Required:** `docs/security/mfa-design.md` recovery section, `docs/security/authentication-flows.md` update.
**Educational Notes:** Every MFA recovery path is a potential MFA bypass in disguise — the classic real-world attack is social-engineering a support agent into "helping" an attacker recover access, so this flow deliberately requires a strongly authorized, audit-logged action rather than a convenient self-service reset.
**Deliverables:** Tested, audit-logged recovery flow.

---

### Issue 119 — Composition-root wiring, public API surface & coverage gate for `packages/mfa`
**Description:** Register MFA use cases and adapters (Prisma repositories, WebAuthn verifier) in `apps/api/src/composition-root.ts`; curate `packages/mfa/index.ts` exports applying the Issue 038/078 boundary-enforcement pattern; apply the Issue 037/076/097 coverage-gate pattern to `packages/mfa`.
**Objective:** Make the MFA context consumable, encapsulated, and held to the same quality bar as prior contexts ahead of Phase 12's route wiring.
**Acceptance Criteria:** Composition root resolves all MFA use cases with real adapters in a local/dev boot smoke test; only intended use cases/types exported with deep-import lint rule extended; CI coverage gate active and passing.
**Dependencies:** 050, 097, 101–118
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/composition-root.ts`, `packages/mfa/index.ts`, `packages/mfa/vitest.config.ts`, `.eslintrc.cjs`
**Tests Required:** Boot smoke test; lint rule verification.
**Documentation Required:** `docs/guides/composition-root.md` update.
**Educational Notes:** Bundling wiring, boundary enforcement, and coverage gating into one checkpoint issue is a deliberate repetition of a now-familiar pattern — recognizing the pattern is itself the teaching point by this point in the codebase.
**Deliverables:** Wired, encapsulated, coverage-gated `packages/mfa`.

---

### Issue 120 — Threat model & educational walkthrough: MFA flows
**Description:** STRIDE-based threat model for enrollment, challenge verification, step-up, and recovery (covering phishing, credential/secret theft, replay, clone detection, and recovery-flow abuse), plus `docs/guides/tutorials/build-mfa.md`, a from-scratch narrative using Phase 06 code as the worked example.
**Objective:** Document Phase 06's security reasoning as a coherent whole and deliver the "how MFA actually works, and how it actually fails" educational artifact, cross-referencing Phase 05's session threat model (Issue 098).
**Acceptance Criteria:** Threat model covers all STRIDE categories relevant to MFA, each mapped to a mitigating issue or accepted-risk note; walkthrough covers TOTP, backup codes, WebAuthn, enforcement, step-up, and recovery, linking every claim to real code/tests in the repo.
**Dependencies:** 098, 101–119
**Estimated Complexity:** M
**Files Affected:** `docs/security/threat-model-mfa.md`, `docs/guides/tutorials/build-mfa.md`
**Tests Required:** None.
**Documentation Required:** These issue deliverables are the docs themselves.
**Educational Notes:** Phishing resistance is the single biggest practical difference between MFA methods — TOTP and backup codes can be relayed by a phishing site, WebAuthn structurally cannot — and this is the flagship place in the codebase to make that distinction explicit and testable rather than folklore.
**Deliverables:** Published threat model and tutorial.

---
