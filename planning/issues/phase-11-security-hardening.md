# Phase 11 — Security Hardening (Issues 201–220)

Applies platform-wide security controls — headers, CORS/CSRF, secrets management,
dependency scanning, and brute-force protection — that extend the per-context threat
models from Issues 077 and 195 into a single, defensible security posture.

---

### Issue 201 — Threat modeling template & cross-context register
**Description:** Formalize the ad-hoc STRIDE format used in Issues 077 and 195 into a reusable `docs/security/threat-model-template.md`, and create a master register (`docs/security/threat-register.md`) indexing every threat identified so far across contexts with status (mitigated/accepted-risk/open).
**Objective:** Stop threat modeling from being a one-off per-phase exercise and make it a maintained, queryable artifact as the platform grows.
**Acceptance Criteria:** Template covers actor/entry-point/STRIDE-category/mitigation/status fields; register lists every threat from Issues 077 and 195 with no gaps.
**Dependencies:** 077, 195
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-template.md`, `docs/security/threat-register.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Threat modeling as a living process, not a one-time deliverable — the register is what turns individual STRIDE exercises into institutional memory.
**Deliverables:** Published template and threat register.

---

### Issue 202 — Platform-wide threat model: transport & infrastructure layer
**Description:** STRIDE-based threat model for the layer no single bounded context owns: network transport, the Fastify process boundary, container runtime, and inter-service trust assumptions (single modular monolith today, service-ready seams per ARCHITECTURE.md §7).
**Objective:** Close the gap between per-context threat models (credentials, audit) and the infrastructure they all run on top of.
**Acceptance Criteria:** Threat model covers eavesdropping, process compromise, container escape, and misconfigured trust boundaries; every threat maps to a mitigating issue in this phase or an accepted-risk note.
**Dependencies:** 201
**Estimated Complexity:** M
**Files Affected:** `docs/security/threat-model-infrastructure.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Threat modeling infrastructure separately from application logic — attackers don't respect architectural layer boundaries even when defenders do.
**Deliverables:** Published infrastructure threat model.

---

### Issue 203 — Security headers middleware
**Description:** Fastify plugin (`@fastify/helmet`-based) setting `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security` (see Issue 213), and a baseline Content-Security-Policy, applied globally at the composition root.
**Objective:** Establish safe-by-default HTTP response headers before any route is publicly reachable.
**Acceptance Criteria:** All routes return the configured header set; header values documented with the specific attack each mitigates; no route opts out without a documented reason.
**Dependencies:** 202
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/plugins/security-headers.ts`, `apps/api/src/app.ts`
**Tests Required:** Integration test asserting header presence/values on a sample route.
**Documentation Required:** `docs/security/http-security-headers.md`
**Educational Notes:** Each header maps to a concrete attack class (clickjacking, MIME-sniffing, referrer leakage) — headers as cheap, high-leverage defense in depth.
**Deliverables:** Tested global security-headers plugin.

---

### Issue 204 — CORS policy
**Description:** Explicit CORS configuration (`@fastify/cors`) with an allowlist of trusted origins per environment, credentialed-request handling scoped narrowly, and no wildcard origin when credentials are allowed.
**Objective:** Prevent unauthorized cross-origin browser clients from making authenticated requests against the API.
**Acceptance Criteria:** Requests from non-allowlisted origins rejected; allowlist configurable per environment via `packages/config`; wildcard-plus-credentials misconfiguration impossible by construction (fails fast at startup if attempted).
**Dependencies:** 203
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/plugins/cors.ts`
**Tests Required:** Integration tests for allowed origin, disallowed origin, and credentialed-request behavior.
**Documentation Required:** `docs/security/cors-policy.md`
**Educational Notes:** Same-origin policy as the browser's core security boundary, and why CORS is an explicit relaxation of it that must never combine wildcard origins with credentials.
**Deliverables:** Tested CORS plugin.

---

### Issue 205 — CSRF protection for cookie-based sessions
**Description:** Double-submit-cookie or synchronizer-token CSRF protection applied to state-changing routes when session authentication uses cookies (per Phase 05's session design), with an explicit exemption path for API-key/bearer-token clients (Issue 234) which are not CSRF-vulnerable.
**Objective:** Protect cookie-authenticated browser sessions from cross-site request forgery without penalizing token-authenticated machine clients.
**Acceptance Criteria:** State-changing request without a valid CSRF token from a cookie-authenticated session is rejected; bearer/API-key-authenticated requests are unaffected; decision to scope CSRF protection to cookie auth only is documented with rationale.
**Dependencies:** 204, Phase 05 session cookie design
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/plugins/csrf.ts`
**Tests Required:** Integration tests for missing/invalid/valid token on cookie sessions, and pass-through for bearer auth.
**Documentation Required:** `docs/security/csrf-protection.md`
**Educational Notes:** Why CSRF is a cookie-specific problem — bearer tokens in an `Authorization` header aren't automatically attached by browsers to cross-site requests, so the attack doesn't apply the same way.
**Deliverables:** Tested CSRF protection scoped correctly by auth method.

---

### Issue 206 — Secrets management policy & loader hardening
**Description:** Formalize secrets handling: no secrets in source control or logs (extends Issue 008's redaction), typed secret loading via `packages/config` with startup-time validation that required secrets are present and non-default, and a documented rotation procedure for each secret class (DB credentials, JWT signing keys, API keys).
**Objective:** Turn "don't leak secrets" from a convention into an enforced, documented practice.
**Acceptance Criteria:** App refuses to start if a required secret is missing or matches a known placeholder value; rotation procedure documented per secret class; secret values never appear in structured log output (tested).
**Dependencies:** 008, 202
**Estimated Complexity:** M
**Files Affected:** `packages/config/src/secrets.ts`, `docs/security/secrets-management.md`
**Tests Required:** Unit tests for startup validation failure on missing/placeholder secrets; log-redaction test for secret-shaped config values.
**Documentation Required:** `docs/security/secrets-management.md`
**Educational Notes:** Fail-fast startup validation as a security control — catching a misconfigured secret at deploy time is far cheaper than discovering it via an incident.
**Deliverables:** Hardened secret loading with documented rotation procedures.

---

### Issue 207 — Dependency scanning in CI
**Description:** Wire `npm audit`/`osv-scanner` (per ARCHITECTURE.md's stated static-analysis stack) into GitHub Actions, failing the build on new high/critical vulnerabilities in production dependencies, with a documented exception process for accepted-risk findings.
**Objective:** Catch known-vulnerable dependencies automatically instead of relying on manual review.
**Acceptance Criteria:** CI job runs on every PR and scheduled nightly; high/critical findings fail the build unless listed in a maintained exceptions file with justification and review date.
**Dependencies:** None
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/dependency-scan.yml`, `infra/ci/security-exceptions.json`
**Tests Required:** CI workflow test (intentionally vulnerable fixture dependency) confirming the gate fires.
**Documentation Required:** `docs/security/dependency-scanning.md`
**Educational Notes:** Supply-chain security basics — most real-world breaches exploit known, already-patched vulnerabilities in dependencies, not novel exploits.
**Deliverables:** Enforced dependency-scanning CI gate.

---

### Issue 208 — Static analysis: security-focused lint rules
**Description:** Add `eslint-plugin-security` (or equivalent) rules to the existing ESLint config, targeting patterns like unsafe regex, `eval`-equivalents, non-literal `fs`/child-process calls, and object-injection sinks; tune to the project's actual code shape to minimize false positives.
**Objective:** Catch common vulnerability patterns at commit time rather than in review or production.
**Acceptance Criteria:** Security lint ruleset runs in the existing lint CI job; a deliberately vulnerable fixture snippet is caught by each enabled rule (documented in a test fixture directory, not committed as real code).
**Dependencies:** 207
**Estimated Complexity:** S
**Files Affected:** `.eslintrc.cjs`, `infra/ci/lint-security-fixtures/`
**Tests Required:** Lint-rule fixture tests confirming each rule fires on its target pattern.
**Documentation Required:** `docs/security/static-analysis.md`
**Educational Notes:** Static analysis as shift-left security — the earlier a vulnerability class is caught in the development loop, the cheaper it is to fix.
**Deliverables:** Enforced security lint ruleset.

---

### Issue 209 — Platform-wide brute-force protection policy
**Description:** Generalize the account-lockout pattern from Issue 067 into a reusable `BruteForcePolicy` applied to every credential-adjacent endpoint (login, MFA verification, password reset confirmation, API-key validation), coordinating with the rate-limiter port from Issue 074 (real implementation lands in Phase 15) so lockout and rate limiting compose rather than conflict.
**Objective:** Ensure brute-force protection isn't unique to password login but covers every guessable-secret verification point in the platform.
**Acceptance Criteria:** Policy applied and documented for each in-scope endpoint; lockout and rate-limit signals composed without either silently overriding the other; unit tests per endpoint category.
**Dependencies:** 067, 074
**Estimated Complexity:** M
**Files Affected:** `packages/shared-kernel/application/services/brute-force-policy.ts`
**Tests Required:** Unit tests per protected endpoint category (login, MFA, reset).
**Documentation Required:** `docs/security/brute-force-protection.md`
**Educational Notes:** Generalizing a security control from one flow to a policy applied consistently — inconsistent application of a control is a common real-world gap attackers find.
**Deliverables:** Tested, generalized brute-force policy.

---

### Issue 210 — Injection hardening review: SQL, NoSQL, and command injection
**Description:** Audit every raw SQL usage (Prisma `$queryRaw`/`$executeRaw` call sites, e.g. Issue 183's grant-revocation migration) and any shell/command invocation in the codebase for injection risk; document the safe-parameterization pattern as a contributor guideline and add a lint rule flagging string-concatenated raw queries.
**Objective:** Confirm Prisma's default parameterization isn't silently bypassed anywhere, and prevent future bypasses.
**Acceptance Criteria:** Every raw-query call site reviewed and documented as safe or fixed; lint rule added flagging string-concatenated raw SQL/shell calls; no findings left unresolved.
**Dependencies:** 183, 208
**Estimated Complexity:** M
**Files Affected:** `.eslintrc.cjs`, `docs/security/injection-hardening.md`
**Tests Required:** Adversarial-input integration test against at least one raw-query call site.
**Documentation Required:** `docs/security/injection-hardening.md`
**Educational Notes:** Why an ORM reduces but doesn't eliminate injection risk — raw-query escape hatches are exactly where old vulnerability classes creep back in.
**Deliverables:** Reviewed, documented, lint-guarded raw-query usage.

---

### Issue 211 — Vulnerability disclosure policy & security.txt
**Description:** Publish `SECURITY.md` and a `/.well-known/security.txt` route describing how to responsibly report a vulnerability, expected response times, and scope (in/out of scope targets for an open-source project without a live production deployment yet).
**Objective:** Give security researchers a clear, low-friction reporting channel before the project has real users to protect.
**Acceptance Criteria:** `SECURITY.md` present at repo root; `security.txt` route returns a valid RFC 9116-formatted response; contact channel tested end-to-end (a submitted test report reaches the maintainer).
**Dependencies:** None
**Estimated Complexity:** XS
**Files Affected:** `SECURITY.md`, `apps/api/src/routes/well-known/security-txt.ts`
**Tests Required:** Integration test asserting the route's content-type and required fields.
**Documentation Required:** `SECURITY.md`
**Educational Notes:** Responsible disclosure as a practice worth establishing before it's urgently needed — many projects only add this after their first uncoordinated disclosure.
**Deliverables:** Published disclosure policy and route.

---

### Issue 212 — Content Security Policy for served documentation/admin surfaces
**Description:** Tighten the baseline CSP from Issue 203 for any HTML-serving surfaces (Swagger UI in Issue 237, future admin-facing pages), using nonce-based script-src rather than `unsafe-inline`, with a documented process for adding new script sources.
**Objective:** Reduce XSS blast radius on the platform's few HTML-rendering surfaces.
**Acceptance Criteria:** CSP for HTML routes contains no `unsafe-inline`/`unsafe-eval`; nonce generated per-request and threaded into rendered templates; CSP violation reports collected via a report-uri endpoint in a test.
**Dependencies:** 203
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/plugins/security-headers.ts`, `apps/api/src/routes/csp-report.ts`
**Tests Required:** Integration test asserting nonce presence and absence of unsafe directives.
**Documentation Required:** `docs/security/http-security-headers.md` update.
**Educational Notes:** Nonce-based CSP as the modern approach to script allowlisting — why `unsafe-inline` defeats most of CSP's XSS protection.
**Deliverables:** Tested nonce-based CSP for HTML surfaces.

---

### Issue 213 — TLS enforcement & HSTS
**Description:** Document and enforce HTTPS-only operation: reverse-proxy/TLS-termination assumptions, `Strict-Transport-Security` header with `includeSubDomains` and a documented preload decision, and an HTTP-to-HTTPS redirect for any direct HTTP exposure in deployment configs.
**Objective:** Ensure credentials, session cookies, and tokens are never transmitted in cleartext in any supported deployment topology.
**Acceptance Criteria:** HSTS header present with correct `max-age`; deployment guide documents the required TLS-termination point; local dev documented as an explicit HTTP exception, not a silent gap.
**Dependencies:** 203
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/plugins/security-headers.ts`, `docs/security/tls-enforcement.md`
**Tests Required:** Integration test asserting HSTS header value.
**Documentation Required:** `docs/security/tls-enforcement.md`
**Educational Notes:** HSTS preload tradeoffs — a powerful but hard-to-reverse commitment, worth understanding before opting in.
**Deliverables:** Documented, header-enforced TLS posture.

---

### Issue 214 — Secure cookie configuration
**Description:** Audit and standardize cookie attributes across every cookie-setting code path (sessions, CSRF token from Issue 205): `Secure`, `HttpOnly`, `SameSite=Lax` or `Strict` per cookie purpose, scoped `Path`/`Domain`, and no sensitive data stored client-readable.
**Objective:** Ensure cookies can't be read by JavaScript or leaked over insecure channels or unintended origins.
**Acceptance Criteria:** Every cookie-setting call site reviewed; session cookies are `HttpOnly`+`Secure`+`SameSite`; CSRF cookie's necessarily-JS-readable exception documented explicitly.
**Dependencies:** 205, 213
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/infrastructure/http/cookie-config.ts`
**Tests Required:** Integration tests asserting cookie attribute values on session-issuing responses.
**Documentation Required:** `docs/security/secure-cookies.md`
**Educational Notes:** `SameSite` as a second, browser-enforced layer of CSRF defense alongside the token-based approach in Issue 205 — defense in depth, not redundancy.
**Deliverables:** Standardized, tested cookie configuration.

---

### Issue 215 — Software Bill of Materials (SBOM) & lockfile integrity
**Description:** Generate an SBOM (CycloneDX format) as a CI artifact on release builds, and add a CI check that `pnpm-lock.yaml` is committed and matches `package.json` (no unlocked/floating installs in CI).
**Objective:** Give downstream users and auditors a machine-readable inventory of exactly what's shipped, and prevent supply-chain drift between declared and installed dependencies.
**Acceptance Criteria:** SBOM generated and attached to release artifacts; CI fails if the lockfile is out of sync with manifests; SBOM format validated against the CycloneDX schema.
**Dependencies:** 207
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/release.yml`, `infra/ci/generate-sbom.ts`
**Tests Required:** CI workflow test with an intentionally drifted lockfile fixture.
**Documentation Required:** `docs/security/sbom.md`
**Educational Notes:** SBOMs as an emerging standard practice (and increasingly a compliance requirement) for understanding transitive supply-chain exposure.
**Deliverables:** Generated SBOM and enforced lockfile-integrity gate.

---

### Issue 216 — Container security hardening
**Description:** Harden the Dockerfiles referenced in ARCHITECTURE.md's infra layout: non-root `USER`, minimal base image (distroless or slim + explicit package pruning), multi-stage build excluding dev dependencies and source maps from the final image, and a `docker scan`/Trivy step in CI.
**Objective:** Reduce the attack surface and blast radius of the container images the platform ships.
**Acceptance Criteria:** Final image runs as non-root; image scan step in CI fails on high/critical OS-package vulnerabilities; final image size and contents documented (no dev dependencies present, verified by a build test).
**Dependencies:** 207
**Estimated Complexity:** M
**Files Affected:** `infra/docker/Dockerfile`, `.github/workflows/container-scan.yml`
**Tests Required:** Build-time test asserting non-root user and absence of dev dependencies in the final image.
**Documentation Required:** `docs/security/container-hardening.md`
**Educational Notes:** Minimizing the runtime image's attack surface — every unnecessary binary or package in a container is a potential post-compromise tool for an attacker.
**Deliverables:** Hardened, scanned container image.

---

### Issue 217 — Penetration-test checklist & internal exercise
**Description:** Compile a structured pen-test checklist (OWASP Testing Guide-aligned: auth, session management, input validation, business logic, API-specific checks) and run an internal exercise against a staging deployment of the platform as it stands at this phase, logging findings as tracked follow-up issues.
**Objective:** Validate the platform's actual security posture with adversarial testing, not just checklist review.
**Acceptance Criteria:** Checklist covers all major OWASP Testing Guide categories relevant to the platform; exercise completed against a running instance; every finding filed as a follow-up issue with severity.
**Dependencies:** 209, 210, 214, 216
**Estimated Complexity:** L
**Files Affected:** `docs/security/pen-test-checklist.md`, `docs/security/pen-test-findings-2026.md`
**Tests Required:** None (manual/exploratory exercise by design).
**Documentation Required:** `docs/security/pen-test-checklist.md`, findings report.
**Educational Notes:** Why automated scanning and static analysis (Issues 207–208) don't substitute for adversarial, business-logic-aware manual testing — different vulnerability classes require different techniques.
**Deliverables:** Published checklist and findings report with tracked follow-ups.

---

### Issue 218 — Security incident response runbook
**Description:** Write an incident-response runbook: severity classification, initial-response steps (contain, assess, notify), roles/responsibilities for an open-source project without a formal security team, and a post-incident review template.
**Objective:** Ensure the project has a documented plan before an incident forces one to be improvised under pressure.
**Acceptance Criteria:** Runbook covers detection through post-incident review; severity levels defined with example scenarios; a tabletop walkthrough of one hypothetical incident (credential-stuffing wave) documented as a worked example.
**Dependencies:** 217
**Estimated Complexity:** M
**Files Affected:** `docs/security/incident-response-runbook.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Incident response as a predictable process, not improvisation — the value of a runbook is entirely in having been written and reviewed calmly, before it's needed.
**Deliverables:** Published incident-response runbook.

---

### Issue 219 — Platform-wide OWASP ASVS self-assessment
**Description:** Extend the credentials-scoped ASVS assessment from Issue 079 to the full applicable ASVS surface (V3 session management, V4 access control, V5 validation/encoding, V7 error handling/logging, V9 communications, V14 configuration), covering everything built through Phase 10 plus this phase's controls.
**Objective:** Produce a single, current, platform-wide standards-based security assessment rather than one scoped only to authentication.
**Acceptance Criteria:** All applicable ASVS chapters assessed pass/fail/N-A with rationale; every failing item has a linked follow-up issue; Issue 079's credentials-only assessment is superseded/merged, not duplicated.
**Dependencies:** 079, 203, 204, 205, 206, 209, 214
**Estimated Complexity:** L
**Files Affected:** `docs/security/asvs-self-assessment.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Scaling a standards-based assessment from a single flow to an entire platform — the same ASVS discipline, applied at the system level.
**Deliverables:** Published platform-wide ASVS self-assessment.

---

### Issue 220 — Security hardening educational walkthrough
**Description:** Write `docs/guides/tutorials/hardening-a-web-api.md`, a from-scratch narrative covering headers, CORS/CSRF, secrets management, dependency scanning, and brute-force protection as a coherent defense-in-depth story, using this phase's code and the pen-test findings as worked examples.
**Objective:** Deliver the flagship "how to harden a production API" educational artifact for this phase.
**Acceptance Criteria:** Walkthrough covers every control introduced in this phase, explains how they compose into defense in depth, and links every claim to real code/tests/docs in the repo.
**Dependencies:** 201–219
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/hardening-a-web-api.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.

---
