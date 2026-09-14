# Phase 23 — Performance & Scalability (Issues 441–460)

Builds on the benchmark baseline from Issue 059 and the pooling configuration from
Issue 053 to systematically tune query performance, caching, connection handling,
and horizontal-scale readiness across every bounded context.

---

### Issue 441 — Query performance audit against Issue 059 baseline
**Description:** Run the Issue 059 benchmark script against every repository's `find`/`save` operations under current schema/query patterns, diffing results against the recorded baseline to surface regressions and slow outliers.
**Objective:** Establish where the system actually stands relative to its original performance baseline before optimizing anything.
**Acceptance Criteria:** Audit report lists every repository operation with p50/p95 vs. baseline delta; operations regressed >20% are flagged for follow-up issues.
**Dependencies:** 059
**Estimated Complexity:** S
**Files Affected:** `scripts/benchmark-repositories.ts`, `docs/performance/audit-441.md`
**Tests Required:** N/A (benchmark, not correctness test).
**Documentation Required:** `docs/performance/audit-441.md`
**Educational Notes:** Why performance work must start from measurement, not intuition — "it feels slow" is not an engineering input.
**Deliverables:** Regression audit report driving the rest of Phase 23.

---

### Issue 442 — Slow-query logging & Prisma query event capture
**Description:** Enable Prisma's query-event logging in non-production environments, capturing duration per query, and pipe queries exceeding a configurable threshold into structured logs for review.
**Objective:** Give engineers visibility into which queries are actually slow in practice, not just in synthetic benchmarks.
**Acceptance Criteria:** Queries over threshold (default 100ms) are logged with SQL, params (redacted for secrets), and duration; threshold configurable via Issue 007's config loader.
**Dependencies:** 007, 441
**Estimated Complexity:** S
**Files Affected:** `packages/config/schema.ts`, `apps/api/composition/prisma-client.ts`
**Tests Required:** Unit tests verifying threshold filtering and redaction of sensitive params.
**Documentation Required:** `docs/performance/query-logging.md`
**Educational Notes:** Sampling vs. full-capture tradeoffs for query logging overhead in production-like environments.
**Deliverables:** Configurable slow-query logging.

---

### Issue 443 — Index review: Identity & Credentials contexts
**Description:** Review all Prisma schema indexes for `packages/identity` and `packages/credentials` tables against the actual query patterns used by their repositories, adding missing composite indexes and removing unused ones.
**Objective:** Ensure the two highest-traffic contexts (every request touches identity/credentials) have indexes matched to real access patterns.
**Acceptance Criteria:** `EXPLAIN ANALYZE` on the top 10 queries per context shows index usage (no sequential scans on tables >1000 rows in test fixtures); migration adds/drops indexes accordingly.
**Dependencies:** 441, 442
**Estimated Complexity:** M
**Files Affected:** `packages/identity/infrastructure/persistence/schema.prisma`, `packages/credentials/infrastructure/persistence/schema.prisma`, `prisma/migrations/*_index_review_identity_credentials/`
**Tests Required:** Migration tests; `EXPLAIN`-based assertions in a scripted check.
**Documentation Required:** `docs/performance/index-review.md`
**Educational Notes:** Reading `EXPLAIN ANALYZE` output — sequential scan vs. index scan vs. bitmap heap scan, and when each is actually correct.
**Deliverables:** Tuned indexes for the two hottest contexts.

---

### Issue 444 — Index review: Sessions, Authorization, Audit contexts
**Description:** Same index-review methodology as Issue 443, applied to `packages/sessions`, `packages/authorization`, and `packages/audit`, with particular attention to the audit hash-chain's append-heavy, rarely-updated access pattern.
**Objective:** Extend index tuning to the remaining high-write-volume contexts.
**Acceptance Criteria:** Session lookup-by-token and permission-check queries use index scans; audit log append path shows no index bloat from unnecessary indexes on a write-heavy table.
**Dependencies:** 443
**Estimated Complexity:** M
**Files Affected:** `packages/sessions/infrastructure/persistence/schema.prisma`, `packages/authorization/infrastructure/persistence/schema.prisma`, `packages/audit/infrastructure/persistence/schema.prisma`, `prisma/migrations/*_index_review_sessions_authz_audit/`
**Tests Required:** Migration tests; `EXPLAIN`-based assertions.
**Documentation Required:** `docs/performance/index-review.md` update.
**Educational Notes:** Why over-indexing an append-heavy table (audit log) hurts write throughput even though it helps reads — the write-amplification tradeoff.
**Deliverables:** Tuned indexes for write-heavy and permission-check-heavy contexts.

---

### Issue 445 — N+1 query detection & elimination in read models
**Description:** Audit application-layer query handlers (especially Phase 12/13's REST and GraphQL read paths) for N+1 patterns, replacing per-item lookups with batched `findMany`/`DataLoader`-style batching.
**Objective:** Eliminate the most common source of accidental quadratic database load in list-rendering endpoints.
**Acceptance Criteria:** Endpoints returning collections with related data issue a bounded number of queries regardless of collection size (verified via query-count assertions in integration tests).
**Dependencies:** 442, and Phase 12/13's read endpoints
**Estimated Complexity:** M
**Files Affected:** `apps/api/interface/rest/*`, `packages/*/interface/graphql/resolvers/*`
**Tests Required:** Integration tests asserting query count stays constant as fixture collection size grows.
**Documentation Required:** `docs/performance/n-plus-one.md`
**Educational Notes:** The N+1 problem explained with a concrete before/after query-count example, and why DataLoader-style batching fixes it without denormalizing data.
**Deliverables:** N+1-free list endpoints across REST and GraphQL.

---

### Issue 446 — Caching strategy design (cache-aside, key namespacing, invalidation)
**Description:** Design document and shared `packages/shared-kernel` caching contract (`CachePort` with `get`/`set`/`del`/`invalidatePattern`) defining a cache-aside pattern, Redis key namespacing convention (`cache:{context}:{entity}:{id}`), and default TTLs per data category (reference data, user profile, permission checks).
**Objective:** Establish one coherent caching approach before individual contexts start caching ad hoc, avoiding key collisions and inconsistent invalidation.
**Acceptance Criteria:** `CachePort` interface defined with a Redis adapter and an in-memory no-op for tests; key-namespacing convention documented and lint-checked where feasible; TTL table covers every planned cache category.
**Dependencies:** 053
**Estimated Complexity:** M
**Files Affected:** `packages/shared-kernel/application/ports/cache-port.ts`, `packages/shared-kernel/infrastructure/redis-cache.ts`, `docs/performance/caching-strategy.md`
**Tests Required:** Unit tests for the Redis adapter (TTL expiry, pattern invalidation) and no-op adapter contract parity.
**Documentation Required:** `docs/performance/caching-strategy.md`
**Educational Notes:** Cache-aside vs. write-through vs. read-through — why cache-aside is the right default for a system where correctness (auth data) matters more than always-warm caches.
**Deliverables:** Shared, reusable caching port and Redis adapter.

---

### Issue 447 — Permission-check result caching (Authorization context)
**Description:** Cache `Authorization` context's RBAC/ABAC decision results per (subject, resource, action) tuple using Issue 446's `CachePort`, with short TTL and explicit invalidation on role/policy change events.
**Objective:** Reduce the cost of the highest-frequency computation in the system — every authorized request re-evaluates permissions.
**Acceptance Criteria:** Repeated identical permission checks within TTL hit cache (verified by call-count assertions on the underlying policy evaluator); role/policy mutation events invalidate affected cache entries; cache never returns stale "allow" past a revocation (invalidation is synchronous with the mutating use case).
**Dependencies:** 446, Phase 07/08's policy evaluators
**Estimated Complexity:** L
**Files Affected:** `packages/authorization/infrastructure/cached-policy-evaluator.ts`
**Tests Required:** Unit tests for cache hit/miss behavior; integration tests confirming revocation invalidates cache immediately (no stale-allow window).
**Documentation Required:** `docs/performance/caching-strategy.md` authorization section.
**Educational Notes:** Why caching authorization decisions is dangerous if invalidation isn't synchronous — the security cost of a stale "allow" versus the correctness-neutral cost of a stale "deny."
**Deliverables:** Tested, safely-invalidated permission-check cache.

---

### Issue 448 — Reference/lookup data caching
**Description:** Cache rarely-changing reference data (role definitions, permission catalogs, notification templates) with long TTLs and manual invalidation hooks triggered by their respective admin-mutation use cases.
**Objective:** Remove repeated database round-trips for data that changes on the order of days/weeks, not per-request.
**Acceptance Criteria:** Reference-data reads hit cache after first load; admin updates to reference data invalidate the specific cached entry within the same request.
**Dependencies:** 446
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/infrastructure/cached-role-repository.ts`, `packages/notifications/infrastructure/cached-template-repository.ts`
**Tests Required:** Unit tests for cache population and invalidation-on-write.
**Documentation Required:** `docs/performance/caching-strategy.md` update.
**Educational Notes:** Matching TTL/invalidation strategy to data volatility — treating all data as equally cacheable wastes the opportunity this data category offers.
**Deliverables:** Cached reference-data repositories.

---

### Issue 449 — Cache stampede protection
**Description:** Add request-coalescing (single-flight) protection to `CachePort` consumers so that a cache-miss under concurrent load triggers one database fetch, not N simultaneous fetches, with the result shared among waiters.
**Objective:** Prevent a popular cache key's expiry from causing a thundering-herd spike against the database at TTL boundaries.
**Acceptance Criteria:** Simulated concurrent cache-miss requests for the same key result in exactly one underlying repository call (verified with a race/concurrency test); other waiters receive the shared result.
**Dependencies:** 446, 447
**Estimated Complexity:** M
**Files Affected:** `packages/shared-kernel/infrastructure/single-flight-cache.ts`
**Tests Required:** Concurrency test asserting single underlying fetch under simultaneous misses.
**Documentation Required:** `docs/performance/caching-strategy.md` stampede section.
**Educational Notes:** The thundering-herd problem at cache expiry and why single-flight coalescing (not just shorter TTLs) is the correct fix.
**Deliverables:** Stampede-safe cache wrapper.

---

### Issue 450 — Load testing harness (k6 scripts, scenario library)
**Description:** Build a k6-based load-testing harness with scenario scripts for login, registration, token refresh, permission-check-heavy admin listing, and MFA verification, parameterized by target RPS and duration.
**Objective:** Give the team a repeatable way to generate realistic load and observe system behavior under it, beyond single-query benchmarks.
**Acceptance Criteria:** Scenarios run against a local docker-compose stack; each scenario reports p50/p95/p99 latency and error rate; scripts are parameterized (no hardcoded target host).
**Dependencies:** 441, and the endpoints from Phases 04–06/12
**Estimated Complexity:** M
**Files Affected:** `scripts/load-testing/scenarios/*.js`, `scripts/load-testing/k6.config.js`
**Tests Required:** N/A (load-testing infra, not correctness test); a CI smoke run at low RPS to catch script breakage.
**Documentation Required:** `docs/performance/load-testing.md`
**Educational Notes:** Why load testing (sustained concurrent traffic) reveals failure modes (connection exhaustion, GC pauses, lock contention) that single-request benchmarks never surface.
**Deliverables:** Reusable k6 load-testing harness.

---

### Issue 451 — Load test: authentication flows under sustained concurrency
**Description:** Execute Issue 450's login/register/refresh/MFA scenarios at escalating RPS against a staging-like environment, recording the breaking point (error-rate inflection) and bottleneck (CPU, DB connections, Redis, event loop lag).
**Objective:** Learn the actual concurrent-user ceiling of the authentication flows most likely to see traffic spikes.
**Acceptance Criteria:** Report identifies RPS at which p95 latency or error rate crosses defined SLOs; root cause of the bottleneck identified (not just "it got slow").
**Dependencies:** 450, 294–296 (rate-limited auth endpoints)
**Estimated Complexity:** M
**Files Affected:** `docs/performance/load-test-results-auth.md`
**Tests Required:** N/A (result of a load-testing run).
**Documentation Required:** `docs/performance/load-test-results-auth.md`
**Educational Notes:** Reading resource-utilization graphs during a load test to distinguish CPU-bound, I/O-bound, and lock-contention bottlenecks.
**Deliverables:** Documented capacity ceiling for auth flows.

---

### Issue 452 — Load test: admin/governance listing & permission-heavy endpoints
**Description:** Execute load scenarios against Phase 16's admin listing endpoints, which combine pagination, filtering, and per-row permission checks — the most database- and authorization-intensive read path in the system.
**Objective:** Validate that Issue 447's permission-check caching and Issue 445's N+1 fixes hold up under realistic admin-console concurrency.
**Acceptance Criteria:** Report compares latency with caching/batching enabled vs. disabled (feature-flagged for the test), quantifying the improvement; SLO crossing point documented.
**Dependencies:** 445, 447, 450
**Estimated Complexity:** M
**Files Affected:** `docs/performance/load-test-results-admin.md`
**Tests Required:** N/A (result of a load-testing run).
**Documentation Required:** `docs/performance/load-test-results-admin.md`
**Educational Notes:** Quantifying an optimization's real-world payoff by A/B-style comparison rather than assuming it helped.
**Deliverables:** Validated, measured improvement from caching/batching work.

---

### Issue 453 — Connection pool sizing formula validation & retuning
**Description:** Revisit Issue 053's documented pool-sizing formula using real load-test data (Issues 451–452) instead of theoretical estimates, adjusting Prisma pool size and PgBouncer configuration accordingly.
**Objective:** Replace the placeholder formula from Issue 053 with an empirically validated one now that real load data exists.
**Acceptance Criteria:** Pool size recommendation cites specific load-test evidence; formula updated in docs; configuration changed if warranted, with before/after connection-exhaustion behavior documented.
**Dependencies:** 053, 451, 452
**Estimated Complexity:** S
**Files Affected:** `packages/config/schema.ts`, `docs/guides/database.md`
**Tests Required:** Load test re-run confirming no connection-exhaustion errors at target RPS post-retune.
**Documentation Required:** `docs/guides/database.md` pooling section update.
**Educational Notes:** The gap between a theoretical pool-sizing formula (Little's Law style reasoning) and observed behavior — why both matter, and why you validate the theory with data.
**Deliverables:** Empirically validated connection pool configuration.

---

### Issue 454 — PgBouncer transaction-mode compatibility audit
**Description:** Audit all Prisma usage (prepared statements, session-level features, advisory locks if any) for compatibility with PgBouncer's transaction pooling mode, since transaction mode is required at scale but breaks session-scoped Postgres features.
**Objective:** Catch pooling-mode incompatibilities before they cause production incidents under horizontal scale-out.
**Acceptance Criteria:** Audit lists every session-scoped feature in use (if any) and either eliminates it or documents an accepted exception; integration tests run against a PgBouncer-fronted database in transaction mode.
**Dependencies:** 453
**Estimated Complexity:** M
**Files Affected:** `infra/docker/pgbouncer.ini`, `docs/guides/database.md`
**Tests Required:** Integration test suite re-run against PgBouncer transaction-mode connection string.
**Documentation Required:** `docs/guides/database.md` PgBouncer compatibility section.
**Educational Notes:** Why PgBouncer's transaction pooling mode (needed for real connection multiplexing at scale) silently breaks prepared statements and session state, and how to design around it.
**Deliverables:** PgBouncer-transaction-mode-safe data access layer.

---

### Issue 455 — Stateless `apps/api` verification for horizontal scale-out
**Description:** Audit `apps/api` for any in-process state (in-memory caches, sticky-session assumptions, local file writes) that would break correctness when running multiple instances behind a load balancer, migrating any found state to Redis or the database.
**Objective:** Confirm the API layer is truly horizontally scalable, not just theoretically stateless.
**Acceptance Criteria:** Audit checklist covers session storage, rate-limit counters, caches, and any local file/temp usage; a two-instance docker-compose setup behind a load balancer passes the full integration suite with requests round-robined across instances.
**Dependencies:** 283 (distributed rate limiter), 446
**Estimated Complexity:** M
**Files Affected:** `apps/api/app.ts`, `infra/docker/docker-compose.scale-test.yml`
**Tests Required:** Integration suite re-run against the two-instance topology.
**Documentation Required:** `docs/performance/horizontal-scale-readiness.md`
**Educational Notes:** The difference between "runs without crashing" and "is actually stateless" — sticky-session bugs that only appear under real multi-instance load balancing.
**Deliverables:** Verified stateless API layer, documented scale-out readiness.

---

### Issue 456 — Graceful shutdown & zero-downtime deploy readiness
**Description:** Implement graceful shutdown handling in `apps/api` (drain in-flight requests, close DB/Redis connections cleanly, respect a shutdown timeout) so rolling deploys and autoscaling events don't drop requests.
**Objective:** Make horizontal scale-out and rolling deploys safe operationally, not just architecturally possible.
**Acceptance Criteria:** `SIGTERM` triggers a drain period where new requests are rejected at the load-balancer health check but in-flight requests complete; process exits cleanly within the configured timeout; forced-kill fallback if drain exceeds timeout.
**Dependencies:** 455
**Estimated Complexity:** M
**Files Affected:** `apps/api/app.ts`, `apps/api/shutdown.ts`
**Tests Required:** Integration test sending `SIGTERM` mid-request and asserting the in-flight request still completes successfully.
**Documentation Required:** `docs/performance/horizontal-scale-readiness.md` deploy section.
**Educational Notes:** Why naive process termination during a rolling deploy causes dropped requests, and how health-check/readiness-probe coordination with graceful shutdown fixes it.
**Deliverables:** Zero-downtime-safe shutdown handling.

---

### Issue 457 — Autoscaling readiness: health/readiness probe accuracy under load
**Description:** Refine Phase 18's health-check endpoint to distinguish "process alive" (liveness) from "able to serve traffic" (readiness — DB pool has headroom, Redis reachable, not mid-drain), so autoscalers and load balancers make correct routing decisions under load.
**Objective:** Prevent an overloaded instance from continuing to receive traffic just because its process hasn't crashed.
**Acceptance Criteria:** Readiness probe returns unhealthy when DB pool utilization exceeds a configurable threshold or Redis is unreachable; liveness probe remains independent (does not flap under load); both documented for load-balancer/orchestrator configuration.
**Dependencies:** 453, and Phase 18's health-check endpoint
**Estimated Complexity:** S
**Files Affected:** `apps/api/interface/rest/health.ts`
**Tests Required:** Integration tests simulating pool exhaustion and Redis unavailability, asserting readiness flips independently of liveness.
**Documentation Required:** `docs/performance/horizontal-scale-readiness.md` probes section.
**Educational Notes:** Liveness vs. readiness as distinct signals — conflating them causes either premature restarts or traffic sent to an overloaded instance.
**Deliverables:** Load-aware, autoscaler-friendly health probes.

---

### Issue 458 — Performance regression gate in CI
**Description:** Wire Issue 059's benchmark script and a subset of Issue 450's load-test scenarios into CI (on a schedule or label-triggered, not every PR, given cost), failing the build if p95 latency regresses beyond a documented threshold versus the last known-good baseline.
**Objective:** Prevent future changes from silently eroding the performance work done across Phase 23.
**Acceptance Criteria:** CI job runs benchmarks against a fresh database, compares to a stored baseline artifact, fails with a clear diff report on regression beyond threshold; baseline artifact update process documented.
**Dependencies:** 441, 450
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/performance-gate.yml`, `scripts/compare-benchmark-baseline.ts`
**Tests Required:** CI job dry-run verifying it correctly fails on an injected regression fixture.
**Documentation Required:** `docs/performance/performance-gate.md`
**Educational Notes:** Why performance, like correctness, needs a regression gate — without one, gains from Phase 23 decay silently over time.
**Deliverables:** Automated performance regression gate.

---

### Issue 459 — Threat/risk model: performance as an availability concern
**Description:** Document how performance failures (connection exhaustion, cache stampedes, N+1 explosions, unbounded queries) constitute availability risks, mapping each to its mitigating issue in this phase and to any accepted residual risk.
**Objective:** Frame Phase 23's work within the project's broader risk-documentation discipline (mirroring Phase 15's threat-model pattern) rather than treating performance as purely a UX concern.
**Acceptance Criteria:** Every major performance risk category maps to a mitigating issue (441–458) or an explicit accepted-risk note with rationale.
**Dependencies:** 441–458
**Estimated Complexity:** S
**Files Affected:** `docs/performance/availability-risk-model.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Performance degradation as a denial-of-service vector even absent malicious intent — slow queries can take down a system as effectively as an attack.
**Deliverables:** Published availability risk model for performance.

---

### Issue 460 — Performance & scalability tutorial and phase closeout
**Description:** Write `docs/guides/tutorials/scaling-verixa.md` walking through the full Phase 23 arc — baseline measurement, index tuning, caching strategy with stampede protection, load testing methodology, connection pool retuning, and horizontal scale-out readiness — linking every claim to real code, benchmarks, and load-test results from Issues 441–459.
**Objective:** Deliver the phase's educational capstone and confirm all Phase 23 deliverables are coherently connected.
**Acceptance Criteria:** Tutorial references concrete files/tests/results from this phase; a final full benchmark + load-test run is attached showing overall before/after improvement versus the Issue 441 audit.
**Dependencies:** 441–459
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/scaling-verixa.md`, `docs/performance/phase-23-summary.md`
**Tests Required:** N/A (documentation and summary run).
**Documentation Required:** This issue's deliverable is the tutorial and summary themselves.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial and phase closeout summary.

---
