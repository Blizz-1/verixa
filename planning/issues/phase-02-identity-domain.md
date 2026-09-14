# Phase 02 — Domain Modeling: Identity Core (Issues 021–040)

Builds the `packages/identity` bounded context: entities, value objects, domain
events, and repository ports (no persistence yet — that's Phase 03).

---

### Issue 021 — `Email` value object
**Description:** Implement an immutable `Email` value object with RFC-5322-ish validation, normalization (lowercase, trim), and equality.
**Objective:** Ensure invalid/inconsistent email strings never reach the domain layer.
**Acceptance Criteria:** Invalid emails rejected via `Result`; equal emails with different casing compare equal.
**Dependencies:** 004, 006
**Estimated Complexity:** S
**Files Affected:** `packages/identity/domain/value-objects/email.ts`
**Tests Required:** Unit tests for valid/invalid/normalization cases.
**Documentation Required:** `docs/guides/domain-modeling.md` value-object section.
**Educational Notes:** Value objects vs. primitives ("primitive obsession" anti-pattern revisited from Issue 005).
**Deliverables:** Tested `Email` value object.

---

### Issue 022 — `DisplayName` and `PersonName` value objects
**Description:** Value objects for user display name (length/charset constrained) and structured person name (given/family, optional).
**Objective:** Keep name-related validation in one tested place instead of scattered across handlers.
**Acceptance Criteria:** Length and charset limits enforced; unicode names (e.g. accented characters) accepted.
**Dependencies:** 021
**Estimated Complexity:** XS
**Files Affected:** `packages/identity/domain/value-objects/*.ts`
**Tests Required:** Unit tests incl. unicode edge cases.
**Documentation Required:** Inline + domain-modeling guide update.
**Educational Notes:** Internationalization pitfalls in name validation (don't assume Latin charset or single given/family split).
**Deliverables:** Tested name value objects.

---

### Issue 023 — `User` entity
**Description:** Implement the `User` aggregate root: `UserId`, `Email`, `DisplayName`, status (`pending`, `active`, `suspended`, `deleted`), timestamps, with factory methods enforcing invariants.
**Objective:** Central identity aggregate that every other context references by ID only.
**Acceptance Criteria:** Entity cannot be constructed in an invalid state; status transitions validated (e.g. can't reactivate a deleted user directly).
**Dependencies:** 005, 021, 022
**Estimated Complexity:** M
**Files Affected:** `packages/identity/domain/entities/user.ts`
**Tests Required:** Unit tests for factory validation and each status transition.
**Documentation Required:** `docs/guides/domain-modeling.md` aggregate section.
**Educational Notes:** Aggregate roots and invariant enforcement; why other contexts should reference `UserId`, not the `User` object itself.
**Deliverables:** Tested `User` entity.

---

### Issue 024 — `Organization` entity
**Description:** Implement `Organization` aggregate: `OrganizationId`, name, slug (URL-safe unique key), owner `UserId`, status.
**Objective:** Support multi-tenant use cases (teams/companies using Verixa-protected apps).
**Acceptance Criteria:** Slug validated/normalized; entity requires exactly one owner at creation.
**Dependencies:** 023
**Estimated Complexity:** S
**Files Affected:** `packages/identity/domain/entities/organization.ts`
**Tests Required:** Unit tests for slug validation and construction invariants.
**Documentation Required:** Domain-modeling guide update.
**Educational Notes:** Multi-tenancy modeling choices, previewing the ADR from Architecture doc §8.
**Deliverables:** Tested `Organization` entity.

---

### Issue 025 — `OrganizationMembership` entity
**Description:** Join entity linking `UserId` to `OrganizationId` with a membership status and joined-at timestamp (role assignment itself lives in Phase 07).
**Objective:** Model many-to-many user↔org relationships explicitly rather than via foreign keys with no domain meaning.
**Acceptance Criteria:** Cannot create duplicate active membership for the same user+org pair (enforced at domain level; DB constraint added in Phase 03).
**Dependencies:** 023, 024
**Estimated Complexity:** S
**Files Affected:** `packages/identity/domain/entities/organization-membership.ts`
**Tests Required:** Unit tests for duplicate-membership rejection.
**Documentation Required:** Domain-modeling guide update.
**Educational Notes:** Join entities as first-class domain concepts vs. plain join tables.
**Deliverables:** Tested membership entity.

---

### Issue 026 — Domain event base type & dispatcher interface
**Description:** Define `DomainEvent` base class/interface and an in-process `DomainEventPublisher` port (implementation deferred; interface only).
**Objective:** Let aggregates record events (e.g. `UserRegistered`) without coupling to how they're eventually delivered.
**Acceptance Criteria:** Base event carries `occurredAt`, `aggregateId`, `eventName`; publisher port defined with `publish`/`subscribe`.
**Dependencies:** 005
**Estimated Complexity:** S
**Files Affected:** `packages/shared-kernel/domain/domain-event.ts`
**Tests Required:** Unit test for event construction metadata.
**Documentation Required:** `docs/guides/domain-events.md`
**Educational Notes:** Domain events vs. integration events; why aggregates emit rather than call other contexts directly.
**Deliverables:** Event base type and publisher port.

---

### Issue 027 — `UserRegistered` and `UserStatusChanged` domain events
**Description:** Concrete domain events emitted by the `User` entity on creation and status transitions; wire emission into the entity from Issue 023.
**Objective:** Make identity lifecycle observable to other contexts (audit, notifications) without direct coupling.
**Acceptance Criteria:** Creating/transitioning a `User` records the correct event(s) retrievable via `pullDomainEvents()`.
**Dependencies:** 023, 026
**Estimated Complexity:** S
**Files Affected:** `packages/identity/domain/events/*.ts`, `user.ts` update
**Tests Required:** Unit tests asserting correct events recorded per action.
**Documentation Required:** `docs/guides/domain-events.md` catalog update.
**Educational Notes:** Event naming conventions (past-tense, immutable facts).
**Deliverables:** Emitting `User` entity.

---

### Issue 028 — `UserRepository` port (interface)
**Description:** Define the `UserRepository` interface (`findById`, `findByEmail`, `save`, `existsByEmail`) in the application layer — no implementation yet.
**Objective:** Decouple use cases from persistence technology per the dependency rule.
**Acceptance Criteria:** Interface compiles and is imported by a placeholder use case; no Prisma/DB reference in this package.
**Dependencies:** 023
**Estimated Complexity:** XS
**Files Affected:** `packages/identity/application/ports/user-repository.ts`
**Tests Required:** N/A (interface only); covered indirectly once implemented in Phase 03.
**Documentation Required:** `docs/guides/domain-modeling.md` ports-and-adapters section.
**Educational Notes:** Ports & adapters (hexagonal architecture) explained with this exact example.
**Deliverables:** Repository port.

---

### Issue 029 — `OrganizationRepository` port
**Description:** Define `OrganizationRepository` and `OrganizationMembershipRepository` interfaces analogous to Issue 028.
**Objective:** Same decoupling for organization persistence.
**Acceptance Criteria:** Interfaces compile; documented method contracts (idempotency, error cases via `Result`).
**Dependencies:** 024, 025, 028
**Estimated Complexity:** XS
**Files Affected:** `packages/identity/application/ports/*.ts`
**Tests Required:** N/A.
**Documentation Required:** Inline doc comments.
**Educational Notes:** Interface segregation — why membership queries get their own port rather than bloating `OrganizationRepository`.
**Deliverables:** Two repository ports.

---

### Issue 030 — Use case: `RegisterUser`
**Description:** Application-layer use case orchestrating email uniqueness check, `User` creation, and event recording, returning `Result<User, RegisterUserError>`.
**Objective:** First real use case establishing the command-handler pattern used throughout the codebase.
**Acceptance Criteria:** Duplicate email returns typed error without hitting a repository write; success path persists (against an in-memory fake repo) and returns the created user.
**Dependencies:** 023, 027, 028
**Estimated Complexity:** M
**Files Affected:** `packages/identity/application/use-cases/register-user.ts`
**Tests Required:** Unit tests using an in-memory `UserRepository` fake, covering success and duplicate-email paths.
**Documentation Required:** `docs/guides/use-cases.md` (new) explaining the command-handler pattern.
**Educational Notes:** Why use cases are the unit of application logic — one class, one job, testable without a database.
**Deliverables:** Tested `RegisterUser` use case.

---

### Issue 031 — In-memory fake repositories for testing
**Description:** Implement `InMemoryUserRepository` and `InMemoryOrganizationRepository` test doubles satisfying the ports from Issues 028–029.
**Objective:** Enable fast, DB-free unit testing of every use case in this and future phases.
**Acceptance Criteria:** Fakes pass a shared contract test suite (same tests will later run against the real Prisma implementation in Phase 03).
**Dependencies:** 028, 029
**Estimated Complexity:** S
**Files Affected:** `packages/identity/infrastructure/testing/in-memory-*.ts`
**Tests Required:** Contract test suite (`repository-contract.spec.ts`) run against the fakes.
**Documentation Required:** `docs/guides/testing.md` update on contract testing.
**Educational Notes:** Contract testing — one test suite, multiple implementations, guarantees they behave identically.
**Deliverables:** Reusable fakes + contract test suite.

---

### Issue 032 — Use case: `UpdateUserProfile`
**Description:** Use case for updating display name/person name with validation and an emitted `UserProfileUpdated` event.
**Objective:** Second CRUD-shaped use case reinforcing the pattern with a slightly different shape (partial update).
**Acceptance Criteria:** Invalid partial updates rejected field-by-field with aggregated errors; valid update persists and emits event.
**Dependencies:** 030
**Estimated Complexity:** S
**Files Affected:** `packages/identity/application/use-cases/update-user-profile.ts`
**Tests Required:** Unit tests for partial-update success/validation-failure paths.
**Documentation Required:** Use-cases guide update.
**Educational Notes:** Handling partial updates without losing type safety (`Partial<T>` pitfalls).
**Deliverables:** Tested update use case.

---

### Issue 033 — Use case: `SuspendUser` / `ReactivateUser`
**Description:** Admin-triggered use cases transitioning user status, enforcing the state machine from Issue 023 and requiring a reason string (for audit).
**Objective:** Cover the moderation/governance-adjacent identity lifecycle actions.
**Acceptance Criteria:** Invalid transitions (e.g. reactivate a never-suspended user) rejected; valid transitions emit `UserStatusChanged` with reason.
**Dependencies:** 023, 027, 030
**Estimated Complexity:** S
**Files Affected:** `packages/identity/application/use-cases/suspend-user.ts`, `reactivate-user.ts`
**Tests Required:** Unit tests per transition, including invalid-transition rejection.
**Documentation Required:** Use-cases guide update.
**Educational Notes:** State machines as a defense against invalid business states, not just a diagram.
**Deliverables:** Tested suspend/reactivate use cases.

---

### Issue 034 — Use case: `CreateOrganization`
**Description:** Use case creating an `Organization` plus an initial `OrganizationMembership` for the owner, atomically at the application-service level (transactional boundary defined, implemented in Phase 03).
**Objective:** Establish multi-aggregate orchestration pattern (two aggregates, one use case).
**Acceptance Criteria:** Duplicate slug rejected; success creates org + owner membership together (verified via fakes).
**Dependencies:** 024, 025, 029, 031
**Estimated Complexity:** M
**Files Affected:** `packages/identity/application/use-cases/create-organization.ts`
**Tests Required:** Unit tests for slug collision and success path (org + membership both present).
**Documentation Required:** Use-cases guide: multi-aggregate transactions section.
**Educational Notes:** Transactional boundaries in DDD — one use case, one transaction, even across aggregates.
**Deliverables:** Tested `CreateOrganization` use case.

---

### Issue 035 — Use case: `InviteUserToOrganization` (domain skeleton)
**Description:** Domain-level skeleton for org invitations: `Invitation` value object/entity with token, expiry, status — actual email delivery deferred to Phase 14.
**Objective:** Model the invitation lifecycle now so later phases (notifications, RBAC) can hook in without redesigning identity.
**Acceptance Criteria:** Invitation entity enforces expiry and single-use; use case creates invitation and emits `OrganizationInvitationCreated`.
**Dependencies:** 025, 034
**Estimated Complexity:** M
**Files Affected:** `packages/identity/domain/entities/invitation.ts`, `application/use-cases/invite-user-to-organization.ts`
**Tests Required:** Unit tests for expiry, single-use, and event emission.
**Documentation Required:** Domain-modeling guide update.
**Educational Notes:** Designing forward-compatible domain models — capturing intent (invitation) before the delivery mechanism exists.
**Deliverables:** Tested invitation domain model + use case.

---

### Issue 036 — Domain validation error aggregation utility
**Description:** Shared helper to collect multiple field-level validation errors into a single `ValidationError` with a structured field-error map, used by Issues 030–035's use cases.
**Objective:** Consistent, client-friendly validation error shape across all use cases.
**Acceptance Criteria:** Helper merges N field errors into one `Result.err`; unit tested with 0/1/N error cases.
**Dependencies:** 006
**Estimated Complexity:** XS
**Files Affected:** `packages/shared-kernel/application/validation.ts`
**Tests Required:** Unit tests for aggregation.
**Documentation Required:** `docs/guides/error-handling.md` update.
**Educational Notes:** Field-level vs. form-level validation errors and API ergonomics for frontends.
**Deliverables:** Reusable validation aggregator.

---

### Issue 037 — Identity context unit test coverage gate
**Description:** Configure a per-package coverage threshold (e.g. 90% lines) for `packages/identity`, enforced in CI, as the template for future contexts.
**Objective:** Lock in test discipline for the first fully-built context before moving to persistence.
**Acceptance Criteria:** CI fails if `packages/identity` coverage drops below threshold; current suite passes it.
**Dependencies:** 030–036
**Estimated Complexity:** XS
**Files Affected:** `packages/identity/vitest.config.ts`, CI workflow
**Tests Required:** N/A (meta-check on existing tests).
**Documentation Required:** `docs/guides/testing.md` coverage policy section.
**Educational Notes:** Coverage as a floor, not a target — what it does and doesn't guarantee.
**Deliverables:** Enforced coverage gate.

---

### Issue 038 — `packages/identity` public API surface (`index.ts`)
**Description:** Curate and export the intentional public surface of the identity package (entities, ports, use cases needed by `apps/api`) via a single `index.ts`, hiding internals.
**Objective:** Prevent other contexts/apps from reaching into `domain/` internals directly, preserving the architecture boundary.
**Acceptance Criteria:** `apps/api` (and other packages) can only import from `@verixa/identity`, not deep paths; ESLint rule enforces this (ties into Phase 08/12 wiring later).
**Dependencies:** 021–035
**Estimated Complexity:** S
**Files Affected:** `packages/identity/index.ts`, `.eslintrc.cjs` (no-restricted-imports rule)
**Tests Required:** Lint rule test (attempt deep import, expect failure) documented/verified.
**Documentation Required:** `docs/guides/domain-modeling.md` package-boundary section.
**Educational Notes:** Package encapsulation as an architectural enforcement mechanism, not just convention.
**Deliverables:** Curated public API + enforced boundary.

---

### Issue 039 — ADR: Identity/Organization multi-tenancy model
**Description:** Write the ADR finalizing the multi-tenancy open question from Architecture §8, based on what Phase 02 modeling revealed (row-level `organizationId` with Postgres RLS, decided here).
**Objective:** Close an open architectural question before Phase 03 persistence work depends on the answer.
**Acceptance Criteria:** ADR documents context, decision, consequences, alternatives considered.
**Dependencies:** 024, 025
**Estimated Complexity:** XS
**Files Affected:** `docs/adr/0003-multi-tenancy-model.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** How domain modeling work surfaces architectural decisions organically rather than upfront guessing.
**Deliverables:** ADR-0003.

---

### Issue 040 — Identity context educational walkthrough
**Description:** Write a guided walkthrough (`docs/guides/tutorials/build-the-identity-context.md`) showing, step by step, how Issues 021–039 fit together — for contributors learning DDD by reading real code.
**Objective:** Convert the just-built context into a teaching artifact, fulfilling the project's educational mandate concretely.
**Acceptance Criteria:** Walkthrough traces value object → entity → event → port → use case → test, with file links and a short exercise at the end.
**Dependencies:** 021–039
**Estimated Complexity:** S
**Files Affected:** `docs/guides/tutorials/build-the-identity-context.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A (this issue *is* the educational notes).
**Deliverables:** Published tutorial.
