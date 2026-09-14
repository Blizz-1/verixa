# Phase 21 — Testing Infrastructure (Issues 401–420)

Formalizes testing practice across the monorepo — conventions, shared test utilities, an
end-to-end suite, cross-adapter contract tests, workspace-wide coverage gates, and a mutation-testing
spike — building on the Vitest setup (Issue 014), the Supertest harness (Issue 015), and the
Testcontainers pattern (Issue 047).

---

### Issue 401 — Unit test conventions & style guide
**Description:** Write `docs/guides/testing/unit-test-conventions.md` codifying naming (`describe`/`it` phrasing), the Arrange-Act-Assert structure, one-behavior-per-test discipline, when to use `test.each`, and forbidden patterns (testing implementation details, sleeping instead of fake timers).
**Objective:** Give every future issue's "Tests Required" section a shared vocabulary and standard to be written and reviewed against, instead of each package inventing its own style.
**Acceptance Criteria:** Doc covers naming, structure, fixture placement, mocking boundaries, and anti-patterns with before/after code samples; linked from `CONTRIBUTING.md`.
**Dependencies:** 014
**Estimated Complexity:** S
**Files Affected:** `docs/guides/testing/unit-test-conventions.md`, `CONTRIBUTING.md`
**Tests Required:** None (documentation issue); a follow-up ESLint rule enforcing `describe`/`it` naming is tracked separately if adopted.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Consistent test structure (AAA) lowers the cost of reading someone else's test six months later — tests are read far more often than written, so their prose quality matters as much as production code's.
**Deliverables:** Published unit test conventions guide.

---

### Issue 402 — Shared fixture & object-mother utilities
**Description:** `packages/testing-kit` package exporting reusable entity/value-object factories (`makeUser()`, `makeSession()`, etc.) built on the domain constructors from each context, with sensible defaults and override params.
**Objective:** Stop each package hand-rolling ad hoc fixture objects, reducing duplication and the risk of fixtures drifting out of sync with real constructors.
**Acceptance Criteria:** Factories exist for the core entities introduced through Phase 20; overriding any field works via a partial-options object; factories always produce domain-valid objects (no bypassing invariants).
**Dependencies:** 014
**Estimated Complexity:** M
**Files Affected:** `packages/testing-kit/factories/*.ts`, `packages/testing-kit/index.ts`
**Tests Required:** Unit tests asserting factories produce invariant-valid objects and respect overrides.
**Documentation Required:** `docs/guides/testing/unit-test-conventions.md` fixtures section.
**Educational Notes:** The "object mother" pattern — centralizing test-data construction — trades a small indirection cost for large gains in test readability and resilience to constructor changes.
**Deliverables:** Published `testing-kit` factory library.

---

### Issue 403 — In-memory fake adapter registry convention
**Description:** Catalogue and standardize the in-memory fake adapters already scattered across packages (fake repositories, no-op rate limiter, no-op captcha) into a discoverable `packages/testing-kit/fakes/` namespace with a documented naming convention (`InMemory<Port>`).
**Objective:** Make it obvious, for any port introduced in future phases, where its test double should live and how it should behave, instead of re-deriving the pattern per package.
**Acceptance Criteria:** Existing fakes relocated/re-exported from `testing-kit`; a written checklist describes what a compliant fake must do (deterministic, stateful within a test, resettable between tests).
**Dependencies:** 402
**Estimated Complexity:** S
**Files Affected:** `packages/testing-kit/fakes/*.ts`
**Tests Required:** Contract tests (Issue 409) run against each relocated fake to confirm behavior didn't change during the move.
**Documentation Required:** `docs/guides/testing/unit-test-conventions.md` test-double section.
**Educational Notes:** Distinguishing fakes (working, simplified implementations) from mocks (behavior assertions) and stubs (canned answers) — using the right kind for the job keeps tests both fast and meaningful.
**Deliverables:** Consolidated, documented fake-adapter registry.

---

### Issue 404 — Deterministic clock & randomness test utilities
**Description:** `FixedClock` and `SeededRandom` test utilities in `testing-kit`, plus a documented convention that any code depending on `Date.now()` or randomness must accept the Issue 004 `Clock` port or an injectable RNG.
**Objective:** Eliminate flaky, time- or randomness-dependent test failures by making non-determinism explicit and controllable everywhere it's used.
**Acceptance Criteria:** `FixedClock` supports set/advance; `SeededRandom` produces reproducible sequences from a given seed; a lint/review checklist item flags direct `Date.now()`/`Math.random()` usage in application code.
**Dependencies:** 004, 402
**Estimated Complexity:** S
**Files Affected:** `packages/testing-kit/fixed-clock.ts`, `packages/testing-kit/seeded-random.ts`
**Tests Required:** Unit tests for advance/reset semantics and seeded reproducibility.
**Documentation Required:** `docs/guides/testing/unit-test-conventions.md` determinism section.
**Educational Notes:** Flaky tests erode trust in the whole suite faster than any other failure mode — controlling time and randomness at the boundary is the single highest-leverage fix for non-determinism.
**Deliverables:** Tested determinism utilities, adopted convention.

---

### Issue 405 — End-to-end test suite scaffolding
**Description:** `tests/e2e/` harness that boots the full `apps/api` process (real Fastify server, real Postgres/Redis via Testcontainers per Issue 047) and drives it exclusively through HTTP, as opposed to the in-process Supertest harness from Issue 015.
**Objective:** Catch integration failures that only manifest with a real network boundary and real process startup — config loading, plugin registration order, connection pooling — which in-process tests can mask.
**Acceptance Criteria:** Suite starts the app as a child process against ephemeral containers, waits for a health-check-ready signal, runs HTTP requests against it, and tears everything down cleanly even on failure.
**Dependencies:** 015, 047
**Estimated Complexity:** L
**Files Affected:** `tests/e2e/setup.ts`, `tests/e2e/harness/boot-app.ts`, `tests/e2e/vitest.config.ts`
**Tests Required:** A smoke E2E test (health-check round trip) verifying the harness itself works before other E2E tests depend on it.
**Documentation Required:** `docs/guides/testing/e2e-suite.md`
**Educational Notes:** The test pyramid — unit tests (many, fast) at the base, integration tests in the middle, E2E tests (few, slow, high-confidence) at the top — E2E tests exist to catch what the layers below structurally cannot see.
**Deliverables:** Working, documented E2E harness.

---

### Issue 406 — E2E: identity & authentication critical journeys
**Description:** E2E tests for register → verify email → login → refresh → logout, and login → forgot password → reset → login, run against the real HTTP boundary from Issue 405.
**Objective:** Guarantee the platform's single most business-critical flow works end-to-end, across real process boundaries, before every release.
**Acceptance Criteria:** Both journeys pass against a clean database per run; each step's response shape and status code asserted; suite runs in CI on every PR touching `packages/identity`, `packages/credentials`, or `packages/sessions`.
**Dependencies:** 405
**Estimated Complexity:** M
**Files Affected:** `tests/e2e/journeys/registration-and-login.e2e.test.ts`, `tests/e2e/journeys/password-reset.e2e.test.ts`
**Tests Required:** The journeys themselves are the tests; no further unit coverage needed for this issue.
**Documentation Required:** `docs/guides/testing/e2e-suite.md` journey catalogue.
**Educational Notes:** "Critical user journey" testing prioritizes coverage by business risk rather than code-path count — a handful of well-chosen E2E tests protect the flows that matter most to users and revenue.
**Deliverables:** Two passing, CI-gated E2E journeys.

---

### Issue 407 — E2E: authorization & RBAC journeys
**Description:** E2E tests exercising role assignment, permission checks on protected routes, and access-denied paths, spanning `packages/authorization` and at least one protected resource route.
**Objective:** Verify the authorization layer's enforcement actually holds at the HTTP boundary, not just in isolated policy-engine unit tests.
**Acceptance Criteria:** Tests cover an allowed-access case, a denied-access case (wrong role), and a role-change-takes-effect case; assertions check both status code and that no data leaks in denied responses.
**Dependencies:** 405, and Phase covering `packages/authorization`'s RBAC implementation
**Estimated Complexity:** M
**Files Affected:** `tests/e2e/journeys/authorization.e2e.test.ts`
**Tests Required:** The journey tests themselves.
**Documentation Required:** `docs/guides/testing/e2e-suite.md` journey catalogue.
**Educational Notes:** Authorization bugs are uniquely dangerous because they fail silently (wrong data returned) rather than loudly (crash) — E2E coverage here is a deliberate defense-in-depth layer on top of unit-tested policy logic.
**Deliverables:** Passing, CI-gated authorization E2E suite.

---

### Issue 408 — E2E test data seeding & isolation strategy
**Description:** A documented, code-enforced strategy for E2E test data: per-test-file database reset (via Testcontainers' fresh container or transactional rollback), deterministic seed data builders reusing Issue 402's factories, and no shared mutable fixtures across test files.
**Objective:** Prevent E2E test pollution and ordering-dependent flakiness, the most common failure mode of large E2E suites.
**Acceptance Criteria:** Running the E2E suite in random order and in parallel produces identical results; no test depends on another test's side effects; teardown runs even when a test fails mid-way.
**Dependencies:** 402, 405
**Estimated Complexity:** M
**Files Affected:** `tests/e2e/harness/reset-database.ts`, `tests/e2e/harness/seed.ts`
**Tests Required:** A meta-test running the suite twice in different random orders in CI and diffing results.
**Documentation Required:** `docs/guides/testing/e2e-suite.md` isolation section.
**Educational Notes:** Test isolation is a correctness property of the test suite itself, not just the code under test — shared mutable state between tests is the same class of bug as shared mutable state in production concurrency.
**Deliverables:** Enforced, verified test isolation.

---

### Issue 409 — Contract test framework for ports
**Description:** `packages/testing-kit/contract-test.ts` exporting a generic `defineContractTests<Port>(implementations)` helper that runs one shared assertion suite against every adapter claiming to satisfy a given port (extending the pattern used ad hoc in Issue 283 for `RateLimiter`).
**Objective:** Guarantee that every real adapter and every fake adapter for the same port behave identically from the caller's perspective, catching drift between "the fake I test against" and "the real thing that ships."
**Acceptance Criteria:** Helper accepts a list of `{ name, factory }` implementations and a shared spec; running it against two conformant implementations passes identically; an intentionally non-conformant fake fails clearly.
**Dependencies:** 403
**Estimated Complexity:** M
**Files Affected:** `packages/testing-kit/contract-test.ts`
**Tests Required:** Meta-tests: a passing pair of conformant fakes, and one deliberately broken fake that must fail.
**Documentation Required:** `docs/guides/testing/contract-tests.md`
**Educational Notes:** Contract tests operationalize the Liskov Substitution Principle for hexagonal-architecture ports — if two adapters implement the same interface, a single shared test suite is the mechanical proof that they're truly interchangeable.
**Deliverables:** Reusable contract-test framework.

---

### Issue 410 — Contract tests: repository ports across bounded contexts
**Description:** Apply Issue 409's framework to every repository port with more than one implementation (in-memory fake + Prisma-backed) across `packages/identity`, `packages/credentials`, `packages/sessions`, and `packages/authorization`.
**Objective:** Retroactively verify that existing fakes used throughout earlier phases' unit tests have never silently diverged from their real Prisma-backed counterparts.
**Acceptance Criteria:** Every repository port with 2+ implementations has a contract-test file; all pass; any discovered fake/real behavioral drift is fixed as part of this issue.
**Dependencies:** 047, 409
**Estimated Complexity:** L
**Files Affected:** `packages/identity/domain/ports/*.contract.test.ts`, equivalents in `credentials`, `sessions`, `authorization`
**Tests Required:** The contract test suites themselves, run against both fake and Testcontainers-backed real implementations.
**Documentation Required:** `docs/guides/testing/contract-tests.md` coverage checklist.
**Educational Notes:** Retrofitting contract tests onto existing code is a common and valuable form of technical-debt paydown — it converts an implicit assumption ("the fake behaves like the real thing") into an explicit, continuously-verified one.
**Deliverables:** Contract-tested repository ports across four contexts.

---

### Issue 411 — Contract tests: external-service adapter ports
**Description:** Apply Issue 409's framework to non-repository external adapter ports with multiple implementations: `CaptchaVerifier` (Issue 290), `NotificationSender` (Phase 09), and `GeoIpResolver` (Issue 291).
**Objective:** Extend contract-test coverage beyond persistence to the platform's other major adapter category — third-party service integrations — where fake/real drift is just as costly.
**Acceptance Criteria:** Each listed port has a passing contract-test suite covering both its no-op/stub and any real implementation; failure modes (timeout, malformed response) are part of the shared spec, not just the happy path.
**Dependencies:** 409, and the ports' originating issues (290, 291, Phase 09)
**Estimated Complexity:** M
**Files Affected:** `packages/rate-limiting/application/ports/captcha-verifier.contract.test.ts`, `packages/notifications/application/ports/notification-sender.contract.test.ts`, `packages/rate-limiting/application/ports/geo-ip-resolver.contract.test.ts`
**Tests Required:** The contract suites themselves.
**Documentation Required:** `docs/guides/testing/contract-tests.md` coverage checklist.
**Educational Notes:** External-service adapters are the likeliest place for "works on my fake, breaks in prod" bugs, since third-party APIs have failure modes (rate limits, partial outages, schema changes) that are easy to omit from a hand-rolled fake.
**Deliverables:** Contract-tested external adapter ports.

---

### Issue 412 — Workspace-wide coverage aggregation
**Description:** A root-level `vitest.workspace.ts` configuration and CI step that runs every package's test suite, merges per-package coverage reports (using `v8`/`istanbul` merge tooling) into one workspace-wide report, and publishes it as a CI artifact.
**Objective:** Give maintainers a single, monorepo-wide coverage picture instead of having to check each package's individually-gated coverage (Issue 037's per-package pattern) in isolation.
**Acceptance Criteria:** A single command runs all package suites and produces one merged HTML + LCOV report; CI uploads it as an artifact and posts a summary comment on PRs with the aggregate percentage and per-package breakdown.
**Dependencies:** 014, 037 (existing per-package coverage-gate pattern)
**Estimated Complexity:** M
**Files Affected:** `vitest.workspace.ts`, `infra/ci/coverage-merge.ts`, `.github/workflows/coverage.yml`
**Tests Required:** A CI dry run verifying the merge step produces a valid combined report from at least two packages' outputs.
**Documentation Required:** `docs/guides/testing/coverage.md`
**Educational Notes:** Per-package gates (Issue 037) answer "is this package well-tested in isolation"; a workspace aggregate answers a different question — "is the platform as a whole well-tested" — and surfaces contexts that individually pass their gate but sit far below the others.
**Deliverables:** Merged, published workspace coverage report.

---

### Issue 413 — Coverage threshold ratchet in CI
**Description:** A CI check that reads the workspace aggregate from Issue 412 and fails only if coverage *drops* below the previous merged-main baseline (stored as a checked-in threshold file), rather than enforcing one static global number.
**Objective:** Let coverage improve incrementally and organically without a single arbitrary global threshold either blocking early-phase packages unfairly or masking regressions in already-strong ones.
**Acceptance Criteria:** PR CI fails if aggregate or any per-package coverage regresses beyond a small configurable tolerance; the baseline file auto-updates on merge to `main` when coverage improves; a documented override process exists for justified temporary drops.
**Dependencies:** 412
**Estimated Complexity:** M
**Files Affected:** `infra/ci/coverage-ratchet.ts`, `infra/ci/coverage-baseline.json`, `.github/workflows/coverage.yml`
**Tests Required:** Unit tests for the ratchet comparison logic (improve, regress, tolerance-within-bounds cases).
**Documentation Required:** `docs/guides/testing/coverage.md` ratchet section.
**Educational Notes:** A ratchet is a common technique for adopting a quality gate on an existing codebase incrementally — it enforces "never get worse" immediately while "get better" happens at a sustainable pace, avoiding the all-or-nothing trap of a single global threshold.
**Deliverables:** CI-enforced coverage ratchet.

---

### Issue 414 — Flaky test detection & quarantine process
**Description:** A CI job that re-runs any newly-failing test up to N times before treating it as a genuine failure, tags a test as "flaky" and opens/updates a tracking issue if it fails intermittently across multiple PRs, and a documented `@quarantine` tag convention to temporarily skip a known-flaky test without deleting its coverage.
**Objective:** Keep the growing E2E and integration suite from Issues 405–411 trustworthy — an unmanaged flaky test slowly teaches contributors to ignore red CI, which is worse than not having the test.
**Acceptance Criteria:** Retry-on-failure logic distinguishes "flaky, now passing" from "consistently failing"; flaky tests are auto-tracked, not silently ignored; quarantine tag is visible in test output and time-boxed (expires and re-fails if not fixed within a set window).
**Dependencies:** 405, 412
**Estimated Complexity:** M
**Files Affected:** `infra/ci/flaky-test-tracker.ts`, `tests/e2e/vitest.config.ts`, `.github/workflows/ci.yml`
**Tests Required:** Unit tests for the retry/classification logic using simulated pass/fail sequences.
**Documentation Required:** `docs/guides/testing/flaky-tests.md`
**Educational Notes:** Flaky tests are a form of technical debt with compounding interest — each one that goes unmanaged reduces the signal value of every other test in the suite, since "just rerun it" becomes muscle memory for real failures too.
**Deliverables:** Working flaky-test detection and quarantine workflow.

---

### Issue 415 — Test performance budget & parallelization
**Description:** Establish per-suite time budgets (unit, integration, E2E), configure Vitest's worker-pool parallelization and Testcontainers reuse-across-tests where safe, and add a CI check that fails if total suite wall-clock time regresses beyond a set percentage.
**Objective:** Keep the growing test suite fast enough that contributors run it locally before pushing, preserving the fast-feedback loop that makes TDD and frequent commits practical.
**Acceptance Criteria:** Unit suite completes in a documented target (e.g. under 60s locally); integration/E2E suites run tests in parallel where isolation (Issue 408) allows; CI reports suite duration trend and flags regressions.
**Dependencies:** 405, 408
**Estimated Complexity:** M
**Files Affected:** `vitest.workspace.ts`, `tests/e2e/vitest.config.ts`, `infra/ci/perf-budget.ts`
**Tests Required:** N/A beyond the perf-budget check itself (meta-check).
**Documentation Required:** `docs/guides/testing/performance-budget.md`
**Educational Notes:** Test suite speed is a first-class design constraint, not an afterthought — the moment a suite feels slow, contributors start skipping it, silently trading the fast-feedback benefit tests exist to provide for perceived convenience.
**Deliverables:** Enforced test performance budget.

---

### Issue 416 — Mutation testing tool evaluation spike
**Description:** A time-boxed spike evaluating Stryker Mutator against 2–3 representative packages (a pure-domain package like `packages/rate-limiting`'s token bucket, and an application-layer package with more mocking), comparing signal quality, run time, and CI cost against the existing line-coverage gates.
**Objective:** Determine whether mutation testing's stronger signal (does the test suite actually catch introduced bugs, not just execute lines) is worth its cost before committing to it workspace-wide.
**Acceptance Criteria:** Spike report documents mutation score for each evaluated package, run-time overhead versus normal test runs, and a clear recommendation (adopt narrowly / adopt broadly / defer) with reasoning.
**Dependencies:** 281 (token-bucket, a good mutation-testing candidate), 412
**Estimated Complexity:** M
**Files Affected:** `docs/guides/testing/mutation-testing-spike.md`, `stryker.conf.spike.json`
**Tests Required:** None (the spike's output is the deliverable; no production config changes yet).
**Documentation Required:** `docs/guides/testing/mutation-testing-spike.md` is the deliverable.
**Educational Notes:** Line coverage answers "was this code executed"; mutation testing answers "would a bug here actually be caught" — the two metrics can diverge sharply, and a spike is the right way to learn whether that gap is worth closing given the added CI time cost.
**Deliverables:** Written mutation-testing evaluation with a go/no-go recommendation.

---

### Issue 417 — Mutation testing pilot: shared-kernel & identity
**Description:** Assuming Issue 416 recommends adoption, wire Stryker into `packages/shared-kernel` and `packages/identity` specifically (the packages judged highest-value in the spike), with a mutation-score threshold gate scoped to just these two packages.
**Objective:** Prove out mutation testing in CI on a bounded, high-value scope before considering a workspace-wide rollout, limiting blast radius on CI time budget (Issue 415).
**Acceptance Criteria:** Stryker runs in CI for the two piloted packages only; mutation score threshold enforced and passing; run time stays within the budget established in Issue 415; results published as a CI artifact/badge.
**Dependencies:** 415, 416
**Estimated Complexity:** L
**Files Affected:** `packages/shared-kernel/stryker.conf.json`, `packages/identity/stryker.conf.json`, `.github/workflows/mutation-testing.yml`
**Tests Required:** Any test gaps mutation testing surfaces in these two packages are fixed as part of this issue.
**Documentation Required:** `docs/guides/testing/mutation-testing.md`
**Educational Notes:** Piloting a powerful but expensive technique on the packages with the most reused, security-adjacent logic maximizes return before deciding whether the cost justifies expanding it everywhere.
**Deliverables:** CI-gated mutation testing on two pilot packages, with a documented path to expand further if it proves its worth.

---

### Issue 418 — Snapshot/golden testing conventions for API responses
**Description:** Establish and document a convention for snapshot-testing stable API response shapes (error envelopes, pagination wrappers, OpenAPI-documented success shapes) using Vitest's snapshot support, with rules for when snapshots are appropriate versus explicit assertions.
**Objective:** Catch accidental response-shape drift (a field renamed, an envelope restructured) cheaply, while avoiding the well-known failure mode of snapshot tests becoming meaningless rubber-stamps.
**Acceptance Criteria:** Convention doc states when to snapshot (stable, structural shapes) versus when not to (values that legitimately change often); at least one real example applied to the shared error-envelope response shape; snapshot review is part of the PR checklist.
**Dependencies:** 015
**Estimated Complexity:** S
**Files Affected:** `docs/guides/testing/snapshot-testing.md`, `apps/api/interface/__snapshots__/error-envelope.test.ts.snap`
**Tests Required:** The example snapshot test itself.
**Documentation Required:** `docs/guides/testing/snapshot-testing.md` is the deliverable.
**Educational Notes:** Snapshot tests are a double-edged tool — cheap to write, but if reviewers rubber-stamp diffs without reading them, they stop catching anything; the convention doc exists specifically to keep them honest.
**Deliverables:** Published snapshot-testing convention with a real example.

---

### Issue 419 — Test data builder library for complex aggregates
**Description:** Extend Issue 402's factories with a fluent builder API (`aUser().withRole('admin').withVerifiedEmail().build()`) for the platform's more complex multi-field aggregates, layered on top of the plain factories for cases needing many chained overrides.
**Objective:** Keep test setup readable as aggregates grow more fields across phases, avoiding sprawling option-bag calls that obscure which fields actually matter to a given test.
**Acceptance Criteria:** Builders exist for the 3–4 most field-heavy aggregates in the codebase; chained calls read naturally; builder output is always domain-valid, matching Issue 402's invariant guarantee.
**Dependencies:** 402
**Estimated Complexity:** S
**Files Affected:** `packages/testing-kit/builders/*.ts`
**Tests Required:** Unit tests confirming chained builder calls compose correctly and produce invariant-valid objects.
**Documentation Required:** `docs/guides/testing/unit-test-conventions.md` builders section.
**Educational Notes:** The builder pattern applied to test data keeps each test's "arrange" step self-documenting — the chain of `.with*()` calls reads as the specific preconditions that test cares about, versus a generic factory call plus an opaque overrides object.
**Deliverables:** Fluent builder library for the platform's complex aggregates.

---

### Issue 420 — Testing infrastructure public docs & tutorial
**Description:** Curate `packages/testing-kit/index.ts` exports applying the Issue 038 boundary pattern, and write `docs/guides/tutorials/testing-the-platform.md` walking a new contributor through writing a unit test, an integration test with Testcontainers, a contract test, and an E2E journey — tying together every issue in this phase.
**Objective:** Turn Phase 21's scattered conventions and tooling into a single onboarding path so new contributors can find and follow "the right way to test" without archaeology across 19 separate issues.
**Acceptance Criteria:** Tutorial includes a working example of each test type described, links to the conventions docs from Issues 401, 409, 415, 418; `testing-kit`'s public exports match what the tutorial actually uses (no undocumented internals required).
**Dependencies:** 038, 401–419
**Estimated Complexity:** M
**Files Affected:** `packages/testing-kit/index.ts`, `.eslintrc.cjs`, `docs/guides/tutorials/testing-the-platform.md`
**Tests Required:** Lint rule verification that `testing-kit` internals aren't deep-imported outside the package.
**Documentation Required:** This issue's deliverable is the tutorial itself.
**Educational Notes:** A single narrative walkthrough that ties a phase's many small decisions into one coherent story is often more valuable to a new contributor than the sum of its individual reference docs — this closes Phase 21 the same way Issue 300 closed Phase 15.
**Deliverables:** Curated `testing-kit` public API and published onboarding tutorial.

---
