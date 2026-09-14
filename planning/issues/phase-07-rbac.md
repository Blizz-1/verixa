# Phase 07 — Authorization: RBAC (Issues 121–140)

Builds `packages/authorization`: Role/Permission domain, role assignment, the
permission-checking service, Fastify route guards, default-role seeding, and the
admin role-management API that Phase 09 (verification review) and Phase 10
(governance) will depend on for access control.

---

### Issue 121 — `Permission` domain value object
**Description:** Immutable `Permission` value object identified by a `resource:action` string (e.g. `users:read`, `roles:write`), with parsing/validation that rejects malformed identifiers and equality based on value, not identity.
**Objective:** Establish a single, consistent naming convention for every permission the system will ever check, before any role or guard code exists.
**Acceptance Criteria:** Constructing from a valid `resource:action` string succeeds; malformed strings (missing colon, empty segments, invalid characters) throw a domain error; two permissions with the same string are equal.
**Dependencies:** 004, 005
**Estimated Complexity:** XS
**Files Affected:** `packages/authorization/domain/value-objects/permission.ts`
**Tests Required:** Unit tests for valid/invalid parsing and value equality.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** A fixed naming convention (`resource:action`) is what makes wildcard matching (Issue 135) and human-readable audit logs possible later — inventing per-feature ad hoc permission strings is a common source of unmaintainable RBAC systems.
**Deliverables:** Tested `Permission` value object.

---

### Issue 122 — `Role` domain entity & aggregate
**Description:** `Role` aggregate (roleId, name, description, `isSystemRole` flag, `permissions: Set<Permission>`) that owns the invariant that a role's permission set can only change through its own methods, never by external mutation.
**Objective:** Model a role as a named, reusable bundle of permissions rather than permissions being assigned to users directly.
**Acceptance Criteria:** `Role` exposes `grant(permission)`/`revoke(permission)`/`hasPermission(permission)`; permission set is exposed as a read-only view; constructing with a duplicate name within the same org is rejected at the use-case layer (Issue 130), not the entity.
**Dependencies:** 004, 005, 121
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/domain/entities/role.ts`
**Tests Required:** Unit tests for grant/revoke/hasPermission and immutability of the exposed permission set.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Roles as permission bundles (rather than per-user permission lists) is the core RBAC simplification — it turns an O(users × permissions) assignment problem into O(users × roles) + O(roles × permissions), which is why RBAC scales operationally where raw ACLs don't.
**Deliverables:** Tested `Role` entity.

---

### Issue 123 — System-role protection & role-permission grant/revoke invariants
**Description:** Extend `Role` so `isSystemRole` roles (e.g. a built-in `super-admin`) reject `revoke` calls and rename attempts, throwing a domain error instead of silently no-opping.
**Objective:** Prevent an admin UI or buggy script from quietly disabling the one role that guarantees system recoverability.
**Acceptance Criteria:** Revoking a permission from a system role throws; granting additional permissions to a system role is still allowed; error type is distinguishable from validation errors for the use-case layer to handle explicitly.
**Dependencies:** 122
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/domain/entities/role.ts`, `domain/errors/system-role-immutable-error.ts`
**Tests Required:** Unit tests for rejected mutation paths on system roles.
**Documentation Required:** `docs/security/rbac-design.md` (new) system-role section.
**Educational Notes:** Protecting a small set of "break-glass" system roles at the domain layer (not just the API layer) means the invariant holds even if a future internal script bypasses the HTTP interface entirely.
**Deliverables:** Tested system-role protection.

---

### Issue 124 — `UserRoleAssignment` entity (org-scoped role assignment)
**Description:** `UserRoleAssignment` entity linking `userId` to `roleId`, scoped by `orgId` (nullable for global roles), with `assignedAt`, `assignedBy`, and optional `expiresAt` for time-bound elevation.
**Objective:** Model role assignment as its own entity — distinct from `Role` and `User` — so a user can hold different roles in different organizations and roles can be temporary.
**Acceptance Criteria:** Entity exposes `isExpired`; construction requires either a global scope or a valid `orgId`, never an ambiguous state; unit tests cover both scoped and global assignments.
**Dependencies:** 004, 005, 122
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/domain/entities/user-role-assignment.ts`
**Tests Required:** Unit tests for scope validity and expiry behavior.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Multi-tenant RBAC almost always needs assignment-level scoping (a user can be `admin` in Org A and `viewer` in Org B) — modeling this as a separate entity rather than a field on `User` keeps the identity and authorization contexts decoupled, per the bounded-context boundaries in `ARCHITECTURE.md`.
**Deliverables:** Tested `UserRoleAssignment` entity.

---

### Issue 125 — `RoleRepository` port & in-memory fake
**Description:** `RoleRepository` port (`save`, `findById`, `findByName`, `findAllForOrg`, `delete`) plus an in-memory fake following the Issue 031 contract-test pattern.
**Objective:** Let role-management use cases be written and tested before persistence exists.
**Acceptance Criteria:** Fake passes the shared contract test suite; port has no framework/Prisma types.
**Dependencies:** 031, 122
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/application/ports/role-repository.ts`, `infrastructure/fakes/in-memory-role-repository.ts`
**Tests Required:** Contract tests against the fake.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Continued reuse of the port/fake/contract-test pattern — by Phase 07 this convention should feel routine to a contributor who has read prior phases.
**Deliverables:** Tested port + fake.

---

### Issue 126 — `PermissionRepository` port & in-memory fake
**Description:** `PermissionRepository` port (`save`, `findByKey`, `findAll`) plus an in-memory fake, storing the canonical catalog of permissions the system recognizes.
**Objective:** Provide a source of truth for "which permissions exist" separate from which roles happen to reference them, enabling validation and admin-UI listing.
**Acceptance Criteria:** Fake passes the shared contract test suite; duplicate `findByKey` registration is rejected.
**Dependencies:** 031, 121
**Estimated Complexity:** XS
**Files Affected:** `packages/authorization/application/ports/permission-repository.ts`, `infrastructure/fakes/in-memory-permission-repository.ts`
**Tests Required:** Contract tests against the fake.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Keeping a registered-permission catalog (rather than treating any string as valid) lets the admin API reject typo'd permission keys at assignment time instead of failing silently at check time.
**Deliverables:** Tested port + fake.

---

### Issue 127 — `UserRoleAssignmentRepository` port & in-memory fake
**Description:** `UserRoleAssignmentRepository` port (`save`, `findByUser`, `findByUserAndOrg`, `revoke`) plus an in-memory fake.
**Objective:** Support both "what roles does this user have" and "revoke this specific assignment" lookups needed by the permission checker and admin API.
**Acceptance Criteria:** Fake passes the shared contract test suite; `findByUserAndOrg` excludes expired assignments by default with an explicit opt-in to include them.
**Dependencies:** 031, 124
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/application/ports/user-role-assignment-repository.ts`, `infrastructure/fakes/in-memory-user-role-assignment-repository.ts`
**Tests Required:** Contract tests covering expiry filtering.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Filtering expired assignments at the repository boundary (rather than in every caller) prevents the "forgot to check expiry" class of bug that quietly re-grants access.
**Deliverables:** Tested port + fake.

---

### Issue 128 — Prisma schema: roles, permissions, role_permissions, user_role_assignments
**Description:** Prisma models for `Role`, `Permission`, the `role_permissions` join table, and `UserRoleAssignment`, indexed on `(userId, orgId)` and `(roleId)` for fast lookup, using the Issue 052 RLS pattern for org-scoped rows.
**Objective:** Persist the RBAC graph durably with lookups fast enough to run on every permission check.
**Acceptance Criteria:** Contract tests (Issue 047 Testcontainers harness) pass against the real database; composite index verified via `EXPLAIN` in a comment or test assertion; RLS policy applied to `user_role_assignments`.
**Dependencies:** 046, 047, 052, 056, 125, 126, 127
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma`
**Tests Required:** Contract tests against real Postgres.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Permission checks are one of the hottest read paths in the system — this is the schema where a missing index has the widest, most silently-degrading blast radius, since every guarded route depends on it.
**Deliverables:** Migrated RBAC schema.

---

### Issue 129 — Prisma-backed repositories (Role, Permission, UserRoleAssignment)
**Description:** `PrismaRoleRepository`, `PrismaPermissionRepository`, and `PrismaUserRoleAssignmentRepository` implementing Issues 125–127's ports, using the Issue 056 error-mapping pattern.
**Objective:** Wire the RBAC domain to real persistence.
**Acceptance Criteria:** All three repositories pass their respective contract test suites against real Postgres.
**Dependencies:** 056, 125, 126, 127, 128
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/infrastructure/persistence/prisma-role-repository.ts`, `infrastructure/persistence/prisma-permission-repository.ts`, `infrastructure/persistence/prisma-user-role-assignment-repository.ts`
**Tests Required:** Contract tests against real Postgres for all three.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** N/A (pattern reuse from Issue 053/083).
**Deliverables:** Tested Prisma-backed RBAC persistence.

---

### Issue 130 — Use case: `CreateRole`
**Description:** Creates a new `Role` within an org (or globally, for platform admins), rejecting duplicate names within the same scope.
**Objective:** Provide the entry point for the admin API (Issue 139) and seed script (Issue 138) to define roles.
**Acceptance Criteria:** Duplicate role name within the same org is rejected with a domain-specific error; successful creation persists the role and returns its id.
**Dependencies:** 122, 125
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/application/use-cases/create-role.ts`
**Tests Required:** Unit tests (fakes) for duplicate-name rejection and successful creation.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** N/A.
**Deliverables:** Tested `CreateRole` use case.

---

### Issue 131 — Use case: `DefinePermission`
**Description:** Registers a new `Permission` in the catalog (Issue 126), typically called during application bootstrap by feature modules declaring the permissions they guard, not by end users.
**Objective:** Keep the permission catalog authoritative and machine-verifiable rather than an implicit set inferred from whatever strings happen to appear in code.
**Acceptance Criteria:** Registering a duplicate key is a no-op (idempotent) rather than an error, since multiple bootstrap runs must be safe; registering an invalid key format is rejected.
**Dependencies:** 121, 126
**Estimated Complexity:** XS
**Files Affected:** `packages/authorization/application/use-cases/define-permission.ts`
**Tests Required:** Unit tests for idempotent registration and invalid-key rejection.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Idempotent bootstrap registration is what lets every bounded context declare "here are the permissions I care about" on every app start without needing a separate one-time migration step.
**Deliverables:** Tested `DefinePermission` use case.

---

### Issue 132 — Use cases: `AssignPermissionToRole` / `RevokePermissionFromRole`
**Description:** Use cases that validate the permission exists in the catalog (Issue 126) and the role is not a protected system role (Issue 123) before mutating the role's permission set and persisting it.
**Objective:** Provide the controlled entry point for shaping what a role can do, enforcing catalog and system-role invariants that the entity alone can't see (the catalog is outside its aggregate).
**Acceptance Criteria:** Assigning an unregistered permission key is rejected; revoking from a system role surfaces the Issue 123 error to the caller; successful assign/revoke persists the updated role.
**Dependencies:** 122, 123, 125, 126, 131
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/application/use-cases/assign-permission-to-role.ts`, `application/use-cases/revoke-permission-from-role.ts`
**Tests Required:** Unit tests for catalog validation, system-role rejection, and successful persistence.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Cross-aggregate validation (checking the permission catalog while mutating a `Role`) is a case where use-case-layer orchestration is correct DDD, not a leaky abstraction — a single aggregate shouldn't reach into another repository from inside its own entity methods.
**Deliverables:** Tested assign/revoke use cases.

---

### Issue 133 — Use cases: `AssignRoleToUser` / `RevokeRoleFromUser`
**Description:** Use cases creating/revoking a `UserRoleAssignment`, validating the role exists in the target scope (org or global) and that the assigning actor itself holds a permission allowing role assignment (self-escalation guard).
**Objective:** Provide the controlled entry point for granting/removing a user's access, with an explicit guard against a user assigning themselves a more powerful role than they already have.
**Acceptance Criteria:** Assigning a role the actor doesn't have permission to grant is rejected; assigning an already-held, non-expired role is idempotent; revoking a non-existent assignment is a documented no-op or explicit not-found error (pick one, document it).
**Dependencies:** 124, 127, 130, 134
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/application/use-cases/assign-role-to-user.ts`, `application/use-cases/revoke-role-from-user.ts`
**Tests Required:** Unit tests for the self-escalation guard, idempotent assignment, and revoke behavior.
**Documentation Required:** `docs/security/rbac-design.md` privilege-escalation section.
**Educational Notes:** Privilege escalation via role-management endpoints (a low-privileged admin granting themselves `super-admin`) is one of the most common real-world RBAC vulnerabilities — guarding it here, not just via UI restrictions, closes the gap an API client could otherwise walk through directly.
**Deliverables:** Tested assign/revoke-role-to-user use cases.

---

### Issue 134 — `PermissionChecker` application service
**Description:** Core service exposing `hasPermission(userId, orgId, permission)`, `hasAnyPermission(...)`, and `hasAllPermissions(...)`, resolving a user's effective permission set by loading their non-expired role assignments (Issue 127) and unioning each role's granted permissions.
**Objective:** Provide the single, testable answer to "can this user do this?" that every guard, use case, and admin check ultimately calls.
**Acceptance Criteria:** Expired assignments are excluded from resolution; a user with no assignments has no permissions (fails closed); results verified against fixtures combining multiple roles with overlapping permissions.
**Dependencies:** 122, 124, 127
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/application/services/permission-checker.ts`
**Tests Required:** Unit tests for single-role, multi-role union, expired-assignment exclusion, and no-assignment (deny-by-default) cases.
**Documentation Required:** `docs/security/rbac-design.md` permission-resolution section.
**Educational Notes:** Deny-by-default is the foundational RBAC security property — every path through `PermissionChecker` that can't positively confirm a grant must return `false`, never throw-and-fallback-to-allow or default to `true` on an unhandled branch.
**Deliverables:** Tested `PermissionChecker` service.

---

### Issue 135 — Wildcard & hierarchical permission matching
**Description:** Extend `PermissionChecker`'s resolution logic to support wildcard grants (`users:*` satisfies a check for `users:read`) and a reserved global wildcard (`*:*`) for system roles only.
**Objective:** Avoid role definitions needing to enumerate every fine-grained permission individually for broad roles like `admin`.
**Acceptance Criteria:** `users:*` matches `users:read`/`users:write` but not `orgs:read`; `*:*` matches any permission and is rejected from being granted to a non-system role at the use-case layer (Issue 132); matching logic is a pure function covered by property-style tests over generated permission pairs.
**Dependencies:** 121, 132, 134
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/domain/services/permission-matcher.ts`
**Tests Required:** Unit tests including generated/property-style cases for wildcard boundaries.
**Documentation Required:** `docs/security/rbac-design.md` wildcard section.
**Educational Notes:** Wildcard grants trade precision for ergonomics — restricting `*:*` to system roles only is what prevents an org-admin role from being accidentally defined as globally omnipotent through convenience.
**Deliverables:** Tested wildcard-aware permission matching.

---

### Issue 136 — Fastify `requirePermission` preHandler route guard
**Description:** A Fastify `preHandler` factory `requirePermission(permission)` (and `requireAnyPermission`/`requireAllPermissions` variants) that reads the authenticated principal from `request` (populated by Issue 137), calls `PermissionChecker`, and responds `403 Forbidden` on denial without leaking whether the resource exists.
**Objective:** Give route definitions a declarative, one-line way to enforce authorization, keeping permission checks out of handler bodies.
**Acceptance Criteria:** Missing/insufficient permission yields `403` with a generic error body (no permission-name leakage to the client); authorized requests proceed to the handler; guard composes with Issue 084's authentication middleware (runs after it, never before).
**Dependencies:** 084, 134, 135, 137
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/interface/guards/require-permission.ts`
**Tests Required:** Integration tests (Supertest) for allowed, denied, and unauthenticated requests.
**Documentation Required:** `docs/guides/route-guards.md` (new).
**Educational Notes:** Returning a generic `403` (not "you're missing `orgs:delete`") avoids handing an attacker a permission-name enumeration oracle — informative errors are a UX asset internally but an information-disclosure liability externally.
**Deliverables:** Tested Fastify permission guard.

---

### Issue 137 — Request-scoped principal resolution & per-request caching
**Description:** A Fastify `onRequest`/`preHandler` hook that resolves the authenticated user's org-scoped roles and permissions once per request (via `PermissionChecker`) and attaches them to `request.principal`, memoized for the request's lifetime so multiple `requirePermission` guards on the same route don't each trigger a fresh resolution.
**Objective:** Avoid redundant permission-resolution work when a single route composes multiple guards, while keeping the resolution logic itself in Issue 134, not duplicated in middleware.
**Acceptance Criteria:** `request.principal` is populated exactly once per request regardless of how many guards run; unauthenticated requests get an empty/unresolved principal rather than throwing before Issue 084's auth middleware has a chance to reject them.
**Dependencies:** 084, 134
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/interface/hooks/resolve-principal.ts`, `apps/api/src/plugins/authorization.ts`
**Tests Required:** Integration tests verifying single-resolution behavior and correct principal shape.
**Documentation Required:** `docs/guides/route-guards.md` update.
**Educational Notes:** Per-request memoization (not cross-request caching) is a deliberate choice here — cross-request permission caching would reintroduce the "stale grant after revocation" problem that Issue 088 solved for sessions, so freshness is preferred over the minor performance win.
**Deliverables:** Tested principal-resolution hook.

---

### Issue 138 — Seed script: default roles & permissions catalog
**Description:** A bootstrap script/module registering the platform's baseline permission catalog (e.g. `users:read`, `users:write`, `roles:read`, `roles:write`, `orgs:*`) and default system roles (`super-admin`, `org-owner`, `member`, `viewer`) with sensible starting grants, run via `DefinePermission` (Issue 131) and `CreateRole`/`AssignPermissionToRole` (Issues 130, 132).
**Objective:** Ensure every fresh environment (local dev, CI, new deployment) starts with a coherent, least-privilege-by-default role set instead of an empty authorization system nothing can bootstrap into.
**Acceptance Criteria:** Script is idempotent (safe to re-run on every deploy); `viewer` has only read permissions; `super-admin` is the only role holding `*:*`; seed data documented as the canonical reference for what each default role can do.
**Dependencies:** 129, 130, 131, 132, 135
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/infrastructure/seed/seed-default-roles.ts`, `prisma/seed.ts`
**Tests Required:** Integration test asserting idempotent re-run and expected grants per default role.
**Documentation Required:** `docs/security/rbac-design.md` default-roles reference table.
**Educational Notes:** Shipping a documented, least-privilege default role set is what prevents "grant everything to get unblocked" from becoming the de facto onboarding pattern — a well-designed default is worth more than a flexible-but-empty system.
**Deliverables:** Idempotent default-role seed script.

---

### Issue 139 — Admin role-management REST API
**Description:** Fastify routes under `/admin/roles` and `/admin/users/:userId/roles` (list/create/update/delete roles; list/assign/revoke permissions on a role; list/assign/revoke a user's role assignments), each Zod-validated and guarded by `requirePermission('roles:write')`/`roles:read` via Issue 136.
**Objective:** Expose RBAC management to trusted admin clients without requiring direct database access, completing the admin-facing surface for Phase 07.
**Acceptance Criteria:** OpenAPI schema generated for all routes; every mutating route is guard-protected and rejects unauthorized callers with `403`; attempts to delete a system role or self-escalate return the domain errors from Issues 123/133 mapped to appropriate HTTP status codes.
**Dependencies:** 130, 132, 133, 136, 137, 138
**Estimated Complexity:** L
**Files Affected:** `packages/authorization/interface/routes/admin-roles.routes.ts`, `interface/routes/admin-user-roles.routes.ts`, `interface/schemas/role.schemas.ts`
**Tests Required:** Integration tests (Supertest) for every route: success, validation failure, permission-denied, and domain-error-mapping cases.
**Documentation Required:** OpenAPI spec regenerated; `docs/guides/admin-api.md` (new) RBAC section.
**Educational Notes:** The admin API is itself RBAC-guarded by the system it manages — a useful self-consistency check (and common source of chicken-and-egg bootstrap bugs) that the seed script in Issue 138 exists specifically to resolve.
**Deliverables:** Tested, documented admin role-management API.

---

### Issue 140 — Composition-root wiring, coverage gate & public API surface for `packages/authorization`
**Description:** Register `packages/authorization`'s use cases, `PermissionChecker`, and Prisma repositories in `apps/api/src/composition-root.ts`; apply the Issue 037/076/097 coverage-gate pattern; curate `index.ts` exports per the Issue 038/078/099 boundary-enforcement pattern so internal matching/resolution logic stays encapsulated.
**Objective:** Close out Phase 07 with the same wiring, quality-gate, and API-boundary rigor applied to every prior context, making `packages/authorization` consumable by Phase 09 and Phase 10.
**Acceptance Criteria:** Composition root resolves all authorization use cases with real adapters in a boot smoke test; CI coverage gate active and passing; only intended use cases/guards/types exported, deep-import lint rule extended to this package.
**Dependencies:** 038, 078, 099, 129, 134, 136, 137, 139
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/composition-root.ts`, `packages/authorization/vitest.config.ts`, `packages/authorization/index.ts`, `.eslintrc.cjs`
**Tests Required:** Boot smoke test; lint rule verification.
**Documentation Required:** `docs/guides/composition-root.md` update.
**Educational Notes:** Bundling wiring, coverage, and API-surface curation into one closing issue (rather than three, as earlier phases did) reflects an intentional convention — by the fourth context, contributors should recognize this as "the standard checklist to close out a phase," reinforcing habit over novelty.
**Deliverables:** `packages/authorization` fully wired, gated, and boundary-enforced.

---
