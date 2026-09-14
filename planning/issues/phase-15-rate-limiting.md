# Phase 15 — Rate Limiting & Abuse Prevention (Issues 281–300)

Delivers the real `RateLimiter` implementation behind the port stubbed in Issue 074, plus
distributed abuse detection, CAPTCHA hooks, and audit-integrated abuse tracking across
Phases 04–06's endpoints.

---

### Issue 281 — Token-bucket rate-limit algorithm (domain)
**Description:** Implement a pure `TokenBucket` domain primitive (capacity, refill rate, current tokens, last-refill timestamp) with `tryConsume(n)` semantics, in a new `packages/rate-limiting` context.
**Objective:** Establish a well-understood, testable rate-limiting algorithm before wiring any storage or transport concerns to it.
**Acceptance Criteria:** Bucket refills proportionally to elapsed time; `tryConsume` returns remaining tokens and time-to-next-token; pure function with injectable clock (Issue 004's `Clock`).
**Dependencies:** 004, 006
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/domain/token-bucket.ts`
**Tests Required:** Unit tests for refill math, burst consumption, exhaustion, fractional-token edge cases.
**Documentation Required:** `docs/guides/rate-limiting.md`
**Educational Notes:** Token bucket vs. fixed-window vs. sliding-window-log algorithms — why token bucket tolerates bursts while smoothing sustained abuse.
**Deliverables:** Tested token-bucket primitive.

---

### Issue 282 — Redis-backed distributed counter store
**Description:** `RedisBucketStore` implementing atomic read-refill-consume via a Lua script (avoiding read-modify-write races across API instances), plus the Redis key schema (`ratelimit:{scope}:{key}`) and TTL policy.
**Objective:** Make token buckets consistent across horizontally scaled `apps/api` instances, not per-process.
**Acceptance Criteria:** Concurrent consumption from multiple simulated clients never over-grants tokens (verified with a race test); keys expire automatically when idle.
**Dependencies:** 281
**Estimated Complexity:** L
**Files Affected:** `packages/rate-limiting/infrastructure/redis-bucket-store.ts`, `infrastructure/lua/consume-bucket.lua`
**Tests Required:** Integration tests against real Redis (Testcontainers, per Issue 047 pattern) including a concurrency/race test.
**Documentation Required:** `docs/guides/rate-limiting.md` distributed-consistency section.
**Educational Notes:** Why naive "GET then SET" counters race under concurrency, and how Lua scripting gives Redis atomicity without distributed locks.
**Deliverables:** Tested distributed bucket store.

---

### Issue 283 — `RateLimiter` adapter satisfying Issue 074's port
**Description:** Implement the real `RedisRateLimiter` adapter conforming exactly to the `RateLimiter` port defined in `packages/shared-kernel/application/ports/rate-limiter.ts` (Issue 074), replacing the no-op used since Phase 04.
**Objective:** Deliver the concrete implementation the credential flows have been consulting through a stable seam since Phase 04.
**Acceptance Criteria:** Adapter passes the same contract test suite the no-op stub satisfied; swapping the DI binding from no-op to real adapter requires no changes to any use case.
**Dependencies:** 074, 282
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/infrastructure/redis-rate-limiter.ts`
**Tests Required:** Contract tests shared between no-op and real adapter; integration tests for allow/deny decisions.
**Documentation Required:** `docs/guides/rate-limiting.md` update.
**Educational Notes:** The payoff of Issue 074's seam design — a cross-cutting concern retrofitted with zero call-site churn.
**Deliverables:** Tested, port-conformant `RateLimiter` adapter.

---

### Issue 284 — Per-route rate-limit policy configuration
**Description:** `RateLimitPolicy` config (limit, window, algorithm params) keyed by route/operation, loaded via Issue 007's typed config loader, with distinct defaults for login, register, password-reset, and general API traffic.
**Objective:** Let stricter endpoints (login) have tighter limits than general read traffic without hardcoding numbers per call site.
**Acceptance Criteria:** Policies resolve by route name; missing route falls back to a documented general-API default; invalid config fails fast at startup (Zod-validated).
**Dependencies:** 007, 283
**Estimated Complexity:** S
**Files Affected:** `packages/rate-limiting/application/rate-limit-policy.ts`, `packages/config/schema.ts`
**Tests Required:** Unit tests for policy resolution and fallback; config validation tests.
**Documentation Required:** `docs/guides/rate-limiting.md` policy table.
**Educational Notes:** Why uniform rate limits across all endpoints under- or over-protect depending on endpoint sensitivity.
**Deliverables:** Configurable per-route policies.

---

### Issue 285 — IP-based limiting strategy
**Description:** `IpRateLimitStrategy` deriving the bucket key from client IP (respecting `X-Forwarded-For`/trusted-proxy config), consuming tokens per request against the resolved route policy.
**Objective:** Throttle high-volume single-source abuse (scripted attacks from one origin).
**Acceptance Criteria:** Correct IP extracted behind a configured trusted-proxy count; spoofed `X-Forwarded-For` from an untrusted hop ignored.
**Dependencies:** 284
**Estimated Complexity:** S
**Files Affected:** `packages/rate-limiting/application/strategies/ip-strategy.ts`
**Tests Required:** Unit tests for IP extraction with/without proxy headers, spoofing-resistance test.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Why trusting `X-Forwarded-For` blindly lets attackers bypass IP limits by forging headers.
**Deliverables:** Tested IP-based strategy.

---

### Issue 286 — Account-based limiting strategy
**Description:** `AccountRateLimitStrategy` deriving the bucket key from the target account identifier (email/userId) rather than the caller's IP.
**Objective:** Catch credential-stuffing attacks distributed across many IPs but targeting one account, which IP-based limiting alone misses.
**Acceptance Criteria:** Requests targeting the same account from different IPs are correctly throttled together; unrelated accounts unaffected.
**Dependencies:** 284
**Estimated Complexity:** S
**Files Affected:** `packages/rate-limiting/application/strategies/account-strategy.ts`
**Tests Required:** Unit tests simulating multi-IP single-account attack pattern.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Distributed credential-stuffing botnets defeat IP limits by design — account-scoped limiting closes that gap.
**Deliverables:** Tested account-based strategy.

---

### Issue 287 — Combined IP+account composite strategy
**Description:** `CompositeRateLimitStrategy` consulting both IP and account strategies, denying if either is exhausted, with independent policies per dimension.
**Objective:** Provide the actual production-grade limiter used on abuse-sensitive endpoints, combining both signals.
**Acceptance Criteria:** Request denied if either sub-strategy denies; response indicates which limit was hit (for logging, not necessarily the client-facing message).
**Dependencies:** 285, 286
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/application/strategies/composite-strategy.ts`
**Tests Required:** Unit tests for each denial combination (IP-only, account-only, both, neither).
**Documentation Required:** `docs/guides/rate-limiting.md` strategy-selection section.
**Educational Notes:** Defense in depth applied to rate limiting — no single dimension is sufficient alone.
**Deliverables:** Tested composite strategy, default for login/register/reset.

---

### Issue 288 — Rate-limit response headers
**Description:** Fastify hook adding `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` (on 429 responses) derived from the consulted `RateLimiter` result.
**Objective:** Give well-behaved clients (and the future SDK from Phase 17) the standard signals to back off gracefully.
**Acceptance Criteria:** Headers present on every rate-limited route; values match the underlying bucket state; 429 responses include `Retry-After` in seconds.
**Dependencies:** 283
**Estimated Complexity:** S
**Files Affected:** `apps/api/plugins/rate-limit-headers.ts`
**Tests Required:** Integration tests asserting header values across allow/deny cases.
**Documentation Required:** `docs/guides/rate-limiting.md` header reference.
**Educational Notes:** The IETF `RateLimit` header conventions and why standard headers reduce client-side guesswork/retry storms.
**Deliverables:** Tested header middleware.

---

### Issue 289 — Bypass/allowlist for trusted sources
**Description:** `RateLimitAllowlist` config (CIDR ranges/IPs, service-account tokens) exempting internal health checks, monitoring probes, and trusted service-to-service calls from rate limiting.
**Objective:** Prevent internal infrastructure (Phase 18's health checks, CI smoke tests) from tripping abuse limits meant for external traffic.
**Acceptance Criteria:** Allowlisted sources bypass all rate-limit checks; allowlist changes require config redeploy, not code changes; bypass events still logged (not silent).
**Dependencies:** 284
**Estimated Complexity:** S
**Files Affected:** `packages/rate-limiting/application/allowlist.ts`, `packages/config/schema.ts`
**Tests Required:** Unit tests for CIDR matching and bypass logging.
**Documentation Required:** `docs/guides/rate-limiting.md` allowlist section.
**Educational Notes:** Why bypass logic must be narrow and logged — allowlists are a common privilege-escalation target if overly broad.
**Deliverables:** Tested, audited allowlist.

---

### Issue 290 — CAPTCHA verification port + no-op adapter + trigger policy
**Description:** `CaptchaVerifier` port (hCaptcha/reCAPTCHA-shaped: token in, pass/fail out) with a no-op adapter for dev/test, plus a `CaptchaTriggerPolicy` deciding when a CAPTCHA challenge is required (e.g. after N consecutive failures from an IP or account).
**Objective:** Add a human-verification escalation path for abuse-sensitive endpoints without coupling the domain to a specific CAPTCHA vendor.
**Acceptance Criteria:** Port defined with a `verify(token): Result<void, CaptchaError>` shape; trigger policy consults the same failure counters as lockout (Issue 067) and rate limiting; no-op adapter always passes in dev/test.
**Dependencies:** 067, 287
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/application/ports/captcha-verifier.ts`, `infrastructure/noop-captcha-verifier.ts`, `application/captcha-trigger-policy.ts`
**Tests Required:** Unit tests for trigger-threshold logic and port contract.
**Documentation Required:** `docs/guides/rate-limiting.md` CAPTCHA section.
**Educational Notes:** CAPTCHA as a last-resort friction layer, not a primary defense — and why the port pattern lets a real vendor be swapped in without touching use cases (same seam pattern as Issue 074).
**Deliverables:** Tested CAPTCHA hook, ready for a real vendor adapter.

---

### Issue 291 — Anomaly detection: impossible-travel heuristic
**Description:** `ImpossibleTravelDetector` flagging (not blocking) logins where the geo-distance implied by two IPs for the same account, divided by elapsed time, exceeds a plausible travel speed. IP-to-geo resolution abstracted behind a port with a static/stub adapter (no external service dependency required).
**Objective:** Provide a cheap, explainable heuristic signal for likely account compromise, without building or depending on an ML pipeline.
**Acceptance Criteria:** Two logins from geographically distant IPs within an implausible window raise an `AnomalyFlag`; normal single-region usage never flags; detector is advisory only (does not block login).
**Dependencies:** 286
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/application/anomaly/impossible-travel-detector.ts`, `application/ports/geo-ip-resolver.ts`
**Tests Required:** Unit tests with fixed geo/time fixtures covering flag and no-flag cases.
**Documentation Required:** `docs/security/threat-model-rate-limiting.md` anomaly section.
**Educational Notes:** Why simple, explainable heuristics are often the right first step before reaching for ML-based anomaly detection — auditability matters for security tooling.
**Deliverables:** Tested impossible-travel heuristic.

---

### Issue 292 — Anomaly detection: unusual request volume heuristic
**Description:** `VolumeAnomalyDetector` comparing an account's/IP's recent request rate against its own rolling baseline (simple moving average + threshold multiplier), flagging sustained deviations.
**Objective:** Catch slow-drip or gradually-ramping abuse patterns that stay under fixed rate-limit thresholds.
**Acceptance Criteria:** A sudden multi-x spike over baseline raises an `AnomalyFlag`; gradual organic growth within the threshold multiplier does not; baseline window configurable.
**Dependencies:** 282, 291
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/application/anomaly/volume-anomaly-detector.ts`
**Tests Required:** Unit tests with synthetic time-series fixtures.
**Documentation Required:** `docs/security/threat-model-rate-limiting.md` update.
**Educational Notes:** Baseline-relative thresholds vs. fixed thresholds — why "10x your own normal" catches abuse that a global fixed limit misses.
**Deliverables:** Tested volume-anomaly heuristic.

---

### Issue 293 — Abuse audit trail integration
**Description:** Emit `RateLimitExceeded`, `CaptchaChallengeIssued`, and `AnomalyFlagged` events into Phase 10's append-only audit log via its event-ingestion port.
**Objective:** Make abuse signals part of the durable, tamper-evident audit history rather than transient logs only.
**Acceptance Criteria:** Each abuse event type appears in the audit log with actor (IP/account), route, and detector metadata; events participate in Phase 10's hash chain like any other audit event.
**Dependencies:** 190 (Phase 10 audit event ingestion), 289, 292
**Estimated Complexity:** S
**Files Affected:** `packages/rate-limiting/application/abuse-audit-emitter.ts`
**Tests Required:** Integration tests asserting events land in the audit store with correct shape.
**Documentation Required:** `docs/security/threat-model-rate-limiting.md` update.
**Educational Notes:** Why abuse signals belong in the durable audit trail, not just pino logs — logs rotate/expire, audit history is the forensic record.
**Deliverables:** Tested audit integration.

---

### Issue 294 — Retrofit: Phase 04 login/register/reset endpoints
**Description:** Replace the no-op `RateLimiter` binding from Issue 074 with the real composite strategy (Issue 287) plus CAPTCHA trigger (Issue 290) for `AuthenticateWithPassword` (066), `RegisterUserWithPassword` (065), and `RequestPasswordReset`/`ConfirmPasswordReset` (069/070).
**Objective:** Close the loop on the seam Phase 04 deliberately left open, without modifying those use cases' code.
**Acceptance Criteria:** All four flows consult the real limiter; rate-limit-exceeded responses return 429 with correct headers; existing Phase 04 unit tests still pass unmodified (only the DI binding changes).
**Dependencies:** 065, 066, 069, 070, 287, 290
**Estimated Complexity:** S
**Files Affected:** `apps/api/composition/rate-limiting.ts`
**Tests Required:** Integration tests hitting login/register/reset past their limits, asserting 429s.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** The retrofit validates the seam design from Issue 074 — a well-placed port makes a cross-cutting concern a pure composition-root change.
**Deliverables:** Rate-limited credential endpoints in production.

---

### Issue 295 — Retrofit: Phase 05 refresh-token endpoint
**Description:** Apply account-based rate limiting to the refresh-token exchange endpoint, preventing rapid-fire refresh-token guessing/replay attempts.
**Objective:** Extend the same protection to session/token issuance, a distinct abuse surface from initial login.
**Acceptance Criteria:** Refresh endpoint consults the `RateLimiter` before validating the refresh token; excessive attempts return 429 without revealing whether the token itself was valid.
**Dependencies:** 287, and Phase 05's refresh-token use case
**Estimated Complexity:** S
**Files Affected:** `packages/sessions/application/use-cases/refresh-session.ts`, `apps/api/composition/rate-limiting.ts`
**Tests Required:** Integration tests for refresh-endpoint throttling.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Token refresh endpoints are a frequently overlooked abuse surface — same enumeration/timing discipline as login applies here.
**Deliverables:** Rate-limited refresh flow.

---

### Issue 296 — Retrofit: Phase 06 MFA-verify endpoint
**Description:** Apply account-based rate limiting (tighter than general policy, since MFA codes are short and brute-forceable) to the MFA-verification endpoint.
**Objective:** Prevent brute-forcing of short numeric TOTP/backup codes via rapid repeated verification attempts.
**Acceptance Criteria:** MFA-verify endpoint consults the limiter keyed by account; policy default reflects the small code space (e.g. tighter limit than login); excessive attempts trigger lockout-style 429 and an audit event.
**Dependencies:** 287, and Phase 06's MFA-verify use case
**Estimated Complexity:** S
**Files Affected:** `packages/credentials/application/use-cases/verify-mfa-code.ts` (or Phase 06 equivalent path), `apps/api/composition/rate-limiting.ts`
**Tests Required:** Integration tests asserting throttling kicks in well before code space could be brute-forced.
**Documentation Required:** `docs/security/authentication-flows.md` update.
**Educational Notes:** Why a 6-digit TOTP code needs a much tighter rate limit than a password — the math of code-space size vs. attempt budget.
**Deliverables:** Rate-limited MFA verification.

---

### Issue 297 — Composition wiring & operational config
**Description:** Register the rate-limiting Fastify plugin, `RateLimiter` DI binding, allowlist config, and CAPTCHA adapter in `apps/api`'s composition root; add environment variables for Redis connection, default policies, and allowlist entries.
**Objective:** Make the entire Phase 15 subsystem a single, coherent composition-root concern, consistent with how prior phases wire in.
**Acceptance Criteria:** `apps/api` boots with rate limiting active by default in all environments except test (which uses the no-op or an in-memory bucket store); config validated at startup.
**Dependencies:** 283, 289, 290, 294, 295, 296
**Estimated Complexity:** S
**Files Affected:** `apps/api/composition/rate-limiting.ts`, `apps/api/app.ts`, `.env.example`
**Tests Required:** Startup smoke test verifying plugin registration.
**Documentation Required:** `docs/guides/rate-limiting.md` operations section.
**Educational Notes:** Composition-root wiring as the single place cross-cutting concerns become "real" — mirrors the pattern established across all prior phases.
**Deliverables:** Fully wired rate-limiting subsystem.

---

### Issue 298 — `packages/rate-limiting` coverage gate
**Description:** Apply the Issue 037 coverage-gate pattern to `packages/rate-limiting`.
**Objective:** Maintain test discipline for a security-critical, algorithmically dense package.
**Acceptance Criteria:** CI coverage gate active and passing for `packages/rate-limiting`.
**Dependencies:** 281–296
**Estimated Complexity:** XS
**Files Affected:** `packages/rate-limiting/vitest.config.ts`
**Tests Required:** N/A (meta-check).
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Repetition of the coverage-gate convention.
**Deliverables:** Enforced coverage gate.

---

### Issue 299 — Threat model: abuse & rate limiting
**Description:** STRIDE-based threat model for credential stuffing, brute force, account enumeration via timing, distributed botnets, and CAPTCHA/allowlist bypass, mapping each threat to the mitigating issue.
**Objective:** Document the reasoning behind Phase 15's layered defenses as a coherent whole.
**Acceptance Criteria:** Covers IP-based, account-based, and distributed attack patterns; every identified threat maps to a mitigating issue or an accepted-risk note.
**Dependencies:** 281–297
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-rate-limiting.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Threat modeling a cross-cutting defense layer that spans multiple bounded contexts.
**Deliverables:** Published threat model.

---

### Issue 300 — `packages/rate-limiting` public API surface & tutorial
**Description:** Curate `index.ts` exports applying the Issue 038 boundary pattern, and write `docs/guides/tutorials/designing-a-rate-limiter.md` walking through the token-bucket algorithm, distributed consistency via Redis+Lua, and the layered IP/account/CAPTCHA/anomaly defense built in this phase.
**Objective:** Encapsulate the package's internals and deliver the phase's educational artifact together, closing out Phase 15.
**Acceptance Criteria:** Only intended ports/use cases exported; deep-import lint rule extended; tutorial links every claim to real code/tests from Issues 281–299.
**Dependencies:** 038, 281–299
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/index.ts`, `.eslintrc.cjs`, `docs/guides/tutorials/designing-a-rate-limiter.md`
**Tests Required:** Lint rule verification.
**Documentation Required:** This issue's deliverable is the tutorial itself.
**Educational Notes:** N/A.
**Deliverables:** Curated public API and published tutorial.

---
