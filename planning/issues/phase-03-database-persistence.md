# Phase 03 — Database & Persistence (Issues 041–060)

Stands up PostgreSQL + Prisma and implements real repositories satisfying the ports
defined in Phase 02, validated against the contract test suite from Issue 031.

---

### Issue 041 — Provision PostgreSQL for local/dev/test
**Description:** Add Postgres to `docker-compose.yml` (separate `test` database), connection env vars, and a `pnpm db:wait` readiness script.
**Objective:** Give every subsequent persistence issue a real database to run against.
**Acceptance Criteria:** `docker compose up postgres` starts; app connects using config from Issue 007.
**Dependencies:** 007, 013
**Estimated Complexity:** S
**Files Affected:** `docker-compose.yml`, `.env.example`
**Tests Required:** Connectivity smoke test.
**Documentation Required:** `docs/guides/database.md`
**Educational Notes:** Why tests need an isolated database, not the dev DB (test pollution risks).
**Deliverables:** Running Postgres in local stack.

---

### Issue 042 — Initialize Prisma schema & migration workflow
**Description:** Add Prisma, `schema.prisma`, initial empty migration, and `pnpm db:migrate` / `pnpm db:generate` scripts.
**Objective:** Establish the migration workflow before any tables are defined.
**Acceptance Criteria:** `pnpm db:migrate dev` applies cleanly against a fresh DB; generated client compiles.
**Dependencies:** 041
**Estimated Complexity:** S
**Files Affected:** `prisma/schema.prisma`, `prisma/migrations/*`
**Tests Required:** CI job running migrations against a fresh Postgres service container.
**Documentation Required:** `docs/guides/database.md` migrations section.
**Educational Notes:** Migration-based schema management vs. `db push`/sync tools — why history matters in production.
**Deliverables:** Working migration pipeline.

---

### Issue 043 — `users` table & Prisma model
**Description:** Define the `User` Prisma model mapping to the domain entity (Issue 023): id, email (unique, citext), display name, status enum, timestamps.
**Objective:** Persist the identity aggregate.
**Acceptance Criteria:** Migration creates `users` table with unique case-insensitive email constraint; Prisma client types match expectations.
**Dependencies:** 023, 042
**Estimated Complexity:** S
**Files Affected:** `prisma/schema.prisma`, migration file
**Tests Required:** Migration test + unique-constraint violation test.
**Documentation Required:** Schema documented via Prisma comments + `docs/guides/database.md` ERD note.
**Educational Notes:** Case-insensitive email storage (`citext`) and why naive `LOWER()` indexing is a common bug source.
**Deliverables:** `users` table.

---

### Issue 044 — `organizations` & `organization_memberships` tables
**Description:** Prisma models for Issues 024–025: unique slug constraint, composite unique `(userId, organizationId)` for active memberships, foreign keys with `onDelete` policy decided explicitly.
**Objective:** Persist organization aggregates and their relationship to users.
**Acceptance Criteria:** Migration applies; duplicate active membership insert fails at DB level (defense in depth alongside domain check from Issue 025).
**Dependencies:** 024, 025, 043
**Estimated Complexity:** S
**Files Affected:** `prisma/schema.prisma`, migration file
**Tests Required:** Constraint violation tests.
**Documentation Required:** `docs/guides/database.md` ERD update.
**Educational Notes:** Defense in depth: enforcing the same invariant in domain code *and* the database.
**Deliverables:** Org/membership tables.

---

### Issue 045 — `invitations` table
**Description:** Prisma model for Issue 035's `Invitation` entity: token (hashed at rest), expiry, status, foreign keys to org/inviter.
**Objective:** Persist invitations without storing raw, guessable tokens in the database.
**Acceptance Criteria:** Token stored as a hash, not plaintext; expired invitations queryable via an indexed column.
**Dependencies:** 035, 044
**Estimated Complexity:** S
**Files Affected:** `prisma/schema.prisma`, migration file
**Tests Required:** Test confirming raw token never persisted.
**Documentation Required:** `docs/security/token-storage.md` (new)
**Educational Notes:** Never store secrets/tokens in plaintext, even short-lived ones — hash-and-compare pattern.
**Deliverables:** `invitations` table.

---

### Issue 046 — Prisma-backed `UserRepository`
**Description:** Implement `PrismaUserRepository` satisfying the port from Issue 028, mapping between Prisma rows and domain entities explicitly (no leaking Prisma types into the domain).
**Objective:** Real persistence for the `User` aggregate.
**Acceptance Criteria:** Passes the shared contract test suite from Issue 031 against a real (Testcontainers) Postgres instance.
**Dependencies:** 028, 031, 043
**Estimated Complexity:** M
**Files Affected:** `packages/identity/infrastructure/persistence/prisma-user-repository.ts`
**Tests Required:** Contract test suite run against Testcontainers Postgres.
**Documentation Required:** `docs/guides/database.md` repository-mapping section.
**Educational Notes:** The mapper pattern — keeping ORM models out of the domain layer.
**Deliverables:** Tested `PrismaUserRepository`.

---

### Issue 047 — Testcontainers integration test setup
**Description:** Add `testcontainers` for spinning up ephemeral Postgres instances in integration tests, with a shared setup/teardown helper and CI Docker-in-Docker support.
**Objective:** Realistic, isolated integration tests without a shared test database's flakiness.
**Acceptance Criteria:** Integration test suite runs locally and in CI, each run against a fresh container.
**Dependencies:** 041, 042
**Estimated Complexity:** M
**Files Affected:** `tests/integration/helpers/database.ts`, CI workflow update
**Tests Required:** This issue's deliverable is test infrastructure itself; verified by Issue 046 using it.
**Documentation Required:** `docs/guides/testing.md` integration-DB section.
**Educational Notes:** Ephemeral containers vs. shared test DBs — flakiness, parallelism, and CI cost tradeoffs.
**Deliverables:** Working Testcontainers harness.

---

### Issue 048 — Prisma-backed `OrganizationRepository` & `OrganizationMembershipRepository`
**Description:** Implement the two ports from Issue 029 against Prisma, including transactional creation for Issue 034's use case.
**Objective:** Real persistence for organization aggregates with correct transactional semantics.
**Acceptance Criteria:** Passes contract tests; `CreateOrganization` use case succeeds/rolls back atomically on failure (verified via a forced-failure test).
**Dependencies:** 029, 034, 044, 047
**Estimated Complexity:** M
**Files Affected:** `packages/identity/infrastructure/persistence/prisma-organization-repository.ts`, `prisma-membership-repository.ts`
**Tests Required:** Contract tests + atomic-rollback test.
**Documentation Required:** `docs/guides/database.md` transactions section.
**Educational Notes:** Unit-of-work pattern with Prisma's `$transaction`.
**Deliverables:** Tested org/membership repositories.

---

### Issue 049 — `InvitationRepository` implementation
**Description:** Prisma-backed repository for `Invitation`, including hashed-token lookup and expiry-aware queries.
**Objective:** Complete persistence for the invitation flow.
**Acceptance Criteria:** Lookup by raw token hashes and compares correctly; expired invitations excluded from "active" queries.
**Dependencies:** 045, 046
**Estimated Complexity:** S
**Files Affected:** `packages/identity/infrastructure/persistence/prisma-invitation-repository.ts`
**Tests Required:** Integration tests for hash lookup and expiry filtering.
**Documentation Required:** Inline docs.
**Educational Notes:** Timing-safe hash comparison for token lookup previewed (full treatment in Phase 11).
**Deliverables:** Tested invitation repository.

---

### Issue 050 — Composition root: wire identity use cases into `apps/api`
**Description:** Set up a lightweight DI/composition module in `apps/api` that constructs Prisma repositories and injects them into Phase 02's use cases.
**Objective:** Connect the fully-tested domain/application layers to a real running app for the first time.
**Acceptance Criteria:** `apps/api` boots with real DB-backed use cases available to route handlers (routes themselves land in Phase 12, but the wiring is testable now via a temporary internal script/test).
**Dependencies:** 046, 048, 049
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/composition-root.ts`
**Tests Required:** Integration test invoking `RegisterUser` end-to-end through the composition root against Testcontainers.
**Documentation Required:** `docs/guides/architecture-in-practice.md` composition-root section.
**Educational Notes:** Composition root pattern — the *one* place allowed to know about concrete implementations.
**Deliverables:** Working composition root.

---

### Issue 051 — Database seeding script
**Description:** `pnpm db:seed` script creating a deterministic set of dev fixtures (sample users, orgs, memberships) for local development and manual testing.
**Objective:** Let contributors and later manual QA start from realistic data instead of an empty DB.
**Acceptance Criteria:** Seed script idempotent (safe to re-run); documented sample credentials for local use only.
**Dependencies:** 050
**Estimated Complexity:** S
**Files Affected:** `prisma/seed.ts`
**Tests Required:** Idempotency test (run twice, assert no duplicate/error).
**Documentation Required:** `docs/guides/database.md` seeding section.
**Educational Notes:** Why seed data must never resemble production secrets, even in examples.
**Deliverables:** Working seed script.

---

### Issue 052 — Row-Level Security policies for multi-tenant tables
**Description:** Implement Postgres RLS policies on tenant-scoped tables per ADR-0003 (Issue 039), with a session-variable-based tenant context set per request (connection pooling caveats documented).
**Objective:** Add a database-enforced tenant isolation layer beyond application-level checks.
**Acceptance Criteria:** Query without the correct tenant context returns zero rows even if application code has a bug; documented pooling caveat with connection-per-request or `SET LOCAL` approach chosen.
**Dependencies:** 039, 044
**Estimated Complexity:** L
**Files Affected:** `prisma/migrations/*`, `packages/shared-kernel/infrastructure/tenant-context.ts`
**Tests Required:** Integration test proving cross-tenant query returns no rows even with a deliberately broken `WHERE` clause.
**Documentation Required:** `docs/security/multi-tenancy.md`
**Educational Notes:** Defense in depth again — RLS as a safety net for the inevitable missed `WHERE organizationId = ...` bug.
**Deliverables:** RLS policies + tenant context helper.

---

### Issue 053 — Database connection pooling configuration
**Description:** Configure Prisma's connection pool (or PgBouncer for production) sizing based on expected concurrency, with documented tuning guidance.
**Objective:** Prevent connection-exhaustion outages under load before they happen.
**Acceptance Criteria:** Pool size configurable via env; documented formula relating pool size to expected concurrent requests.
**Dependencies:** 042
**Estimated Complexity:** S
**Files Affected:** `packages/config/*`, `docs/guides/database.md`
**Tests Required:** Load-test placeholder referencing Phase 23.
**Documentation Required:** `docs/guides/database.md` pooling section.
**Educational Notes:** Why "just increase pool size" often makes things worse (Postgres connection overhead).
**Deliverables:** Documented, configurable pool settings.

---

### Issue 054 — Soft-delete strategy for `User`
**Description:** Implement soft-delete (status transition + `deletedAt`) rather than row deletion, with repository queries excluding soft-deleted rows by default and an explicit "including deleted" query variant for admin/audit use.
**Objective:** Preserve referential integrity and audit trail while honoring user-facing "delete my account."
**Acceptance Criteria:** Default queries exclude deleted users; explicit admin query includes them; foreign-key references remain valid.
**Dependencies:** 023, 046
**Estimated Complexity:** M
**Files Affected:** `packages/identity/domain/entities/user.ts`, `prisma-user-repository.ts`
**Tests Required:** Tests for default exclusion and explicit inclusion paths.
**Documentation Required:** `docs/guides/database.md` soft-delete section; foreshadows Phase 24 data-deletion compliance work.
**Educational Notes:** Soft delete vs. hard delete tradeoffs, and why compliance (Phase 24) will still need real erasure eventually.
**Deliverables:** Soft-delete-aware `User` handling.

---

### Issue 055 — Database indexing review for Phase 02–03 tables
**Description:** Review and add indexes for the query patterns established so far (email lookup, org slug lookup, membership lookup by user/org, invitation token hash lookup).
**Objective:** Establish an indexing discipline early rather than discovering missing indexes under production load.
**Acceptance Criteria:** `EXPLAIN ANALYZE` on each key query shows index usage, not sequential scan, on a seeded dataset.
**Dependencies:** 043–049, 051
**Estimated Complexity:** S
**Files Affected:** `prisma/schema.prisma` (`@@index` additions), migration file
**Tests Required:** Documented `EXPLAIN ANALYZE` output in the PR description; automated check deferred to Phase 23.
**Documentation Required:** `docs/guides/database.md` indexing section.
**Educational Notes:** Reading `EXPLAIN ANALYZE` output — seq scan vs. index scan, and when a seq scan is actually fine.
**Deliverables:** Reviewed, indexed schema.

---

### Issue 056 — Repository error mapping (DB errors → domain errors)
**Description:** Wrap Prisma-specific errors (unique constraint violations, connection errors) into the domain error hierarchy from Issue 006 at the repository boundary.
**Objective:** Keep infrastructure-specific error types from leaking into application/domain code.
**Acceptance Criteria:** A unique-constraint violation surfaces as `ConflictError`, not a raw `PrismaClientKnownRequestError`, to calling use cases.
**Dependencies:** 006, 046, 048
**Estimated Complexity:** S
**Files Affected:** `packages/identity/infrastructure/persistence/error-mapper.ts`
**Tests Required:** Unit/integration tests forcing each mapped error condition.
**Documentation Required:** `docs/guides/error-handling.md` update.
**Educational Notes:** Anti-corruption layers at infrastructure boundaries.
**Deliverables:** Error-mapping layer applied to all Phase 03 repositories.

---

### Issue 057 — Database backup & restore runbook (local/dev)
**Description:** Document and script `pg_dump`/`pg_restore` procedures for local/dev environments; production backup strategy stubbed for Phase 20.
**Objective:** Ensure contributors don't lose local work and establish the pattern production backups will extend.
**Acceptance Criteria:** `pnpm db:backup` / `pnpm db:restore` scripts work against the local compose stack.
**Dependencies:** 041
**Estimated Complexity:** S
**Files Affected:** `scripts/db-backup.sh`, `scripts/db-restore.sh`
**Tests Required:** Manual verification checklist.
**Documentation Required:** `docs/guides/database.md` backup section.
**Educational Notes:** Backups without tested restores are not backups — the "restore drill" discipline.
**Deliverables:** Backup/restore scripts.

---

### Issue 058 — Prisma schema linting & drift detection in CI
**Description:** Add CI checks that `prisma format`/`prisma validate` pass and that the migration history has no drift from `schema.prisma`.
**Objective:** Catch schema/migration mismatches before merge, not in production.
**Acceptance Criteria:** CI fails on an intentionally introduced drift (documented, then reverted).
**Dependencies:** 042
**Estimated Complexity:** S
**Files Affected:** CI workflow, `package.json` scripts
**Tests Required:** CI job itself is the test.
**Documentation Required:** `docs/guides/database.md` CI section.
**Educational Notes:** Schema drift as a class of production incident, and why CI must check for it.
**Deliverables:** Drift-detection CI job.

---

### Issue 059 — Persistence layer performance baseline
**Description:** Add a lightweight benchmark script measuring p50/p95 latency of core repository operations (find/save) against the local DB, recorded as a baseline for regression comparison in Phase 23.
**Objective:** Establish a measurable baseline before the schema/query patterns grow more complex.
**Acceptance Criteria:** Benchmark script runs and outputs p50/p95 numbers; baseline numbers committed to `docs/`.
**Dependencies:** 046, 048, 055
**Estimated Complexity:** S
**Files Affected:** `scripts/benchmark-repositories.ts`, `docs/performance/baseline.md`
**Tests Required:** N/A (benchmark, not correctness test).
**Documentation Required:** `docs/performance/baseline.md`
**Educational Notes:** Why baselines must exist *before* you can claim something "got slower."
**Deliverables:** Benchmark script + recorded baseline.

---

### Issue 060 — Persistence layer educational walkthrough
**Description:** Write `docs/guides/tutorials/persistence-layer-walkthrough.md` explaining the port→adapter→contract-test pattern using the Phase 03 code as the worked example.
**Objective:** Reinforce the educational mandate for the persistence layer specifically, since it's the layer most tutorials get wrong (leaking ORM concerns into domain code).
**Acceptance Criteria:** Walkthrough covers: why ports exist, how contract tests verify adapters, how RLS adds defense in depth, with file links.
**Dependencies:** 041–059
**Estimated Complexity:** S
**Files Affected:** `docs/guides/tutorials/persistence-layer-walkthrough.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.
