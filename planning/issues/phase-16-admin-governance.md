# Phase 16 — Admin & Governance (Issues 301–320)

Delivers the `governance` bounded context: organization administration, a policy management API, compliance workflow tooling, data retention/legal-hold rules, and read-optimized admin audit views layered on Phase 10's event log.

---

### Issue 301 — Organization domain model & lifecycle
**Description:** `Organization` aggregate (id, name, status, tier, createdAt) with lifecycle transitions (`activate`, `suspend`, `archive`) enforced as domain invariants, plus `OrganizationCreated`/`OrganizationSuspended`/`OrganizationArchived` domain events.
**Objective:** Establish the root aggregate every other governance concept (policies, retention rules, compliance cases) hangs off, with lifecycle rules that can't be bypassed by direct field mutation.
**Acceptance Criteria:** Invalid transitions (e.g. archiving an already-archived org) rejected with a domain error; each transition emits exactly one event; aggregate has no framework/DB imports.
**Dependencies:** None
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/organization.ts`, `packages/governance/domain/events/organization-events.ts`
**Tests Required:** Unit tests for every legal and illegal transition; event-emission assertions.
**Documentation Required:** `docs/guides/governance.md` (new) organization lifecycle section.
**Educational Notes:** Modeling lifecycle as an explicit state machine inside the aggregate — vs. a bare `status` string a service layer mutates freely — is what keeps "an archived org can never un-suspend a member" true everywhere, not just where someone remembered to check.
**Deliverables:** Tested `Organization` aggregate with lifecycle events.

---

### Issue 302 — Organization repository port + Prisma adapter
**Description:** `OrganizationRepository` port (`save`, `findById`, `findByStatus`) and a `PrismaOrganizationRepository` adapter, plus the Prisma schema addition for the `organizations` table.
**Objective:** Give the application layer a persistence-ignorant seam for organizations, following the repository pattern used by every prior context.
**Acceptance Criteria:** Adapter round-trips all aggregate state including lifecycle status; port has zero Prisma types leaking into its signature.
**Dependencies:** 301
**Estimated Complexity:** S
**Files Affected:** `packages/governance/application/ports/organization-repository.ts`, `packages/governance/infrastructure/prisma-organization-repository.ts`, `prisma/schema.prisma`
**Tests Required:** Integration tests against a real Postgres instance (Testcontainers).
**Documentation Required:** `docs/guides/governance.md` persistence section.
**Educational Notes:** Repeating the port/adapter split so the domain never imports `@prisma/client` — the same dependency-inversion rule applied consistently across contexts is what makes the architecture legible to newcomers.
**Deliverables:** Tested repository adapter.

---

### Issue 303 — Organization membership & admin-role assignment
**Description:** `OrganizationMembership` entity linking an identity (Phase 02) to an `Organization` with an org-scoped admin role (`owner`, `admin`, `member`), plus `AddMember`/`RemoveMember`/`ChangeMemberRole` use cases.
**Objective:** Let organizations have their own internal admin hierarchy, distinct from the global RBAC roles used elsewhere in the platform.
**Acceptance Criteria:** Last remaining `owner` cannot be removed or demoted (prevents orphaned orgs); role changes are authorized by an existing `owner`/`admin`; each change is auditable.
**Dependencies:** 301, 302
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/organization-membership.ts`, `packages/governance/application/use-cases/manage-membership.ts`
**Tests Required:** Unit tests for last-owner protection, role-change authorization, unauthorized-actor rejection.
**Documentation Required:** `docs/guides/governance.md` membership section.
**Educational Notes:** Org-scoped roles vs. platform-wide RBAC roles (Phase 03) — two authorization layers with different blast radii, and why conflating them is a common privilege-escalation bug.
**Deliverables:** Tested membership management.

---

### Issue 304 — Organization CRUD API (REST)
**Description:** Fastify routes `POST/GET/PATCH /admin/organizations`, `/admin/organizations/:id` wrapping the Issue 301–303 use cases, Zod-validated request/response schemas, and RBAC-gated to platform-level admin roles.
**Objective:** Expose organization administration as the first slice of the admin API surface this phase builds toward.
**Acceptance Criteria:** All routes reject non-admin callers with 403; schema validation rejects malformed payloads with 400; successful mutations return the updated resource.
**Dependencies:** 301, 302, 303
**Estimated Complexity:** M
**Files Affected:** `packages/governance/interface/http/organization-routes.ts`, `packages/governance/interface/http/schemas/organization-schemas.ts`
**Tests Required:** Supertest integration tests covering each route's happy path, validation failures, and authorization failures.
**Documentation Required:** OpenAPI spec fragment for `/admin/organizations/*`.
**Educational Notes:** Why admin-facing CRUD still goes through the same use-case/port layering as user-facing flows — "it's just an admin endpoint" is how authorization shortcuts creep in.
**Deliverables:** Tested organization admin API.

---

### Issue 305 — Organization hierarchy (parent/sub-organizations)
**Description:** Optional `parentOrganizationId` on `Organization` supporting a shallow (single-level) parent/child hierarchy, with a `ListChildOrganizations` query and cycle-prevention validation.
**Objective:** Support enterprise customers who model business units as sub-organizations under a parent tenant, without building a full arbitrary-depth tree (which the org's real-world usage doesn't need yet).
**Acceptance Criteria:** Setting a parent on an org that would create a cycle (or exceed one level) is rejected; child listing returns only direct children; root orgs have `parentOrganizationId: null`.
**Dependencies:** 301, 302
**Estimated Complexity:** S
**Files Affected:** `packages/governance/domain/organization.ts`, `packages/governance/application/use-cases/list-child-organizations.ts`
**Tests Required:** Unit tests for cycle rejection and depth limiting; integration test for child listing.
**Documentation Required:** `docs/guides/governance.md` hierarchy section with an explicit "why shallow, not arbitrary depth" note.
**Educational Notes:** YAGNI applied deliberately — an arbitrary-depth tree adds real complexity (recursive queries, cycle detection at any depth); a one-level hierarchy solves the actual stated need and can be widened later if it doesn't.
**Deliverables:** Tested shallow org hierarchy.

---

### Issue 306 — Organization invitation flow
**Description:** `OrganizationInvitation` entity (email, role, expiring token, status) and `InviteMember`/`AcceptInvitation`/`RevokeInvitation` use cases, dispatching invitation emails via Phase 09's notification port.
**Objective:** Let org admins add members who don't yet have identities on the platform, reusing the notification seam rather than building a new dispatch path.
**Acceptance Criteria:** Invitation tokens expire and are single-use; accepting an invitation for an unregistered email routes through Phase 02's registration flow; revoked invitations cannot be accepted.
**Dependencies:** 303, 304
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/organization-invitation.ts`, `packages/governance/application/use-cases/invite-member.ts`, `packages/governance/application/use-cases/accept-invitation.ts`
**Tests Required:** Unit tests for token expiry/single-use; integration test for the full invite-to-accept flow.
**Documentation Required:** `docs/guides/governance.md` invitation section.
**Educational Notes:** Reusing Phase 09's `Notifier` port instead of a bespoke email call is the same "compose, don't duplicate" principle applied to cross-context integration.
**Deliverables:** Tested invitation flow.

---

### Issue 307 — Policy domain model & versioning
**Description:** `Policy` aggregate (id, organizationId, name, ruleset, status: `draft`/`published`/`archived`, version) where publishing a change creates a new immutable version rather than mutating the current one.
**Objective:** Give organizations a first-class, auditable way to define governance rules (e.g. "require MFA for admins", "data must not leave region X") independent of the RBAC/ABAC engine's runtime rule format.
**Acceptance Criteria:** Publishing increments the version and freezes the prior version's content; only `draft` policies are editable; version history is queryable in order.
**Dependencies:** 301
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/policy.ts`, `packages/governance/domain/policy-version.ts`
**Tests Required:** Unit tests for draft-mutation rules, version immutability, publish sequencing.
**Documentation Required:** `docs/guides/governance.md` policy-versioning section.
**Educational Notes:** Append-only versioning (vs. in-place edits) is the same durability argument as Phase 10's audit hash chain — you need to know what rule was in force at a given past moment, not just what it is now.
**Deliverables:** Tested versioned policy aggregate.

---

### Issue 308 — Policy repository port + Prisma adapter
**Description:** `PolicyRepository` port and `PrismaPolicyRepository` adapter persisting policies and their version history, with a schema that stores each version as an immutable row.
**Objective:** Persist Issue 307's versioning guarantees durably, including the append-only version history.
**Acceptance Criteria:** Loading a policy reconstructs full version history in order; attempting to mutate a persisted version row is not exposed by the port's API surface at all.
**Dependencies:** 307
**Estimated Complexity:** S
**Files Affected:** `packages/governance/application/ports/policy-repository.ts`, `packages/governance/infrastructure/prisma-policy-repository.ts`, `prisma/schema.prisma`
**Tests Required:** Integration tests for version-history round-trip.
**Documentation Required:** `docs/guides/governance.md` persistence addendum.
**Educational Notes:** Designing a port's method signatures so illegal operations (editing a published version) aren't merely rejected at runtime but are unrepresentable in the interface — "make illegal states unrepresentable" applied to an API, not just a type.
**Deliverables:** Tested policy repository adapter.

---

### Issue 309 — Policy management REST API
**Description:** Fastify routes for `POST/GET/PATCH /admin/organizations/:orgId/policies`, `/policies/:id/publish`, `/policies/:id/versions`, org-admin RBAC-gated, Zod-validated.
**Objective:** Expose policy authoring and publishing as an API org admins (and the future Phase 17 SDK) can drive.
**Acceptance Criteria:** Publish endpoint is idempotent-safe (re-publishing an already-published version is a no-op, not a new version); version-history endpoint paginates; cross-org access (org A editing org B's policy) is rejected with 403/404 (not leaking existence).
**Dependencies:** 307, 308
**Estimated Complexity:** M
**Files Affected:** `packages/governance/interface/http/policy-routes.ts`, `packages/governance/interface/http/schemas/policy-schemas.ts`
**Tests Required:** Supertest integration tests including a cross-tenant access-control test.
**Documentation Required:** OpenAPI spec fragment for `/admin/organizations/:orgId/policies/*`.
**Educational Notes:** Returning 404 instead of 403 for cross-tenant resource access is a deliberate anti-enumeration choice — 403 confirms the resource exists for another tenant, 404 doesn't.
**Deliverables:** Tested policy management API.

---

### Issue 310 — Policy evaluation bridge into the ABAC engine
**Description:** `PolicyToAbacRuleTranslator` converting a published `Policy`'s ruleset into the rule format consumed by Phase 03's ABAC policy engine, plus a `PolicyEvaluationPort` the ABAC engine can query for org-specific rules at authorization time.
**Objective:** Make governance-authored policies actually take effect in authorization decisions, not just live as inert admin records.
**Acceptance Criteria:** A published policy's rules are consulted by the ABAC engine for that organization's authorization checks; an unpublished draft has zero runtime effect; translation failures fail closed (deny), never fail open.
**Dependencies:** 307, 309, and Phase 03's ABAC engine
**Estimated Complexity:** L
**Files Affected:** `packages/governance/application/policy-to-abac-translator.ts`, `packages/authorization/application/ports/org-policy-source.ts`
**Tests Required:** Unit tests for translation correctness and fail-closed behavior; integration test proving a published policy changes an actual authorization outcome.
**Documentation Required:** `docs/guides/governance.md` "policies vs. RBAC/ABAC" section, cross-linked from `docs/guides/authorization.md`.
**Educational Notes:** Fail-closed vs. fail-open is the single most consequential decision in an authorization integration — a translation bug should deny access, never silently grant it.
**Deliverables:** Tested policy-to-authorization bridge.

---

### Issue 311 — Policy templates library
**Description:** A curated set of built-in `PolicyTemplate` definitions (e.g. "require MFA for admin role", "block logins from disallowed regions") that org admins can instantiate as a starting draft policy instead of authoring a ruleset from scratch.
**Objective:** Lower the barrier to writing correct policies — most orgs want the same handful of common controls, not a blank ruleset editor.
**Acceptance Criteria:** Instantiating a template produces a valid `draft` policy passing the same validation as a hand-authored one; template catalog is listable via API; templates are versioned independently of any org's policy.
**Dependencies:** 307, 309
**Estimated Complexity:** S
**Files Affected:** `packages/governance/domain/policy-templates.ts`, `packages/governance/interface/http/policy-template-routes.ts`
**Tests Required:** Unit tests confirming every built-in template produces a valid policy.
**Documentation Required:** `docs/guides/governance.md` template catalog.
**Educational Notes:** Templates as a usability layer over a correct-but-low-level primitive — the same reason SQL migration tools ship scaffolding generators instead of expecting hand-written DDL from day one.
**Deliverables:** Tested policy template catalog.

---

### Issue 312 — Compliance workflow domain model
**Description:** `ComplianceWorkflow`/`ComplianceCase` aggregates modeling a case (e.g. "review flagged verification", "respond to data subject request") moving through a defined set of states with an explicit transition table, distinct per workflow type.
**Objective:** Give compliance operations (which are inherently multi-step and multi-actor) a structured state machine instead of ad hoc status fields scattered across contexts.
**Acceptance Criteria:** Transition table is data, not scattered conditionals; illegal transitions rejected; each case records its full state history with timestamps and actor.
**Dependencies:** 301
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/compliance-case.ts`, `packages/governance/domain/workflow-definitions.ts`
**Tests Required:** Unit tests for legal/illegal transitions across at least two distinct workflow types; state-history integrity tests.
**Documentation Required:** `docs/guides/governance.md` compliance-workflow section with a transition diagram.
**Educational Notes:** Table-driven state machines (a map of `(state, event) -> state`) vs. `if/else` chains scattered across a service — the table is reviewable at a glance and is where a compliance auditor should be able to verify the rules, not in code.
**Deliverables:** Tested compliance case state machine.

---

### Issue 313 — Compliance approval chains
**Description:** `ApprovalChain` value object attached to a `ComplianceCase`, requiring sign-off from N designated approvers (by org role) before a case can advance past a gated state, with partial-approval tracking.
**Objective:** Model real compliance requirements (e.g. "data deletion requires two-person approval") that a single-actor state machine can't express.
**Acceptance Criteria:** A case cannot advance past a gated transition until all required approvals are recorded; the same approver cannot satisfy two required approval slots; approval/rejection is itself an auditable event.
**Dependencies:** 303, 312
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/approval-chain.ts`, `packages/governance/application/use-cases/record-approval.ts`
**Tests Required:** Unit tests for partial approval, duplicate-approver rejection, chain-satisfied transition unlock.
**Documentation Required:** `docs/guides/governance.md` approval-chain section.
**Educational Notes:** Two-person integrity/separation-of-duties as a control — why some compliance-sensitive actions must be structurally incapable of a single actor completing alone, not just discouraged by policy text.
**Deliverables:** Tested approval-chain gating.

---

### Issue 314 — Compliance case management API
**Description:** Fastify routes for creating, listing, transitioning, and approving compliance cases (`/admin/organizations/:orgId/compliance-cases/*`), RBAC-gated to compliance-role members.
**Objective:** Give compliance officers a working case-management surface backed by Issues 312–313's domain model.
**Acceptance Criteria:** Transition endpoint enforces the workflow's transition table and approval-chain gating server-side (never trusts client-asserted state); list endpoint filters by state/type/assignee.
**Dependencies:** 312, 313
**Estimated Complexity:** M
**Files Affected:** `packages/governance/interface/http/compliance-case-routes.ts`, `packages/governance/interface/http/schemas/compliance-case-schemas.ts`
**Tests Required:** Supertest integration tests covering full case lifecycle including a rejected illegal transition.
**Documentation Required:** OpenAPI spec fragment for `/admin/organizations/:orgId/compliance-cases/*`.
**Educational Notes:** Server-side state-machine enforcement vs. trusting a client-submitted "next state" — the API is the only place the invariant can actually be guaranteed.
**Deliverables:** Tested compliance case API.

---

### Issue 315 — Regulatory export & data-subject request handling
**Description:** `ComplianceExportService` producing a structured export (JSON/CSV) of an identity's data across contexts (identity, sessions, verification, audit references) for data-subject access/erasure requests, driven as a specific `ComplianceWorkflow` type from Issue 312.
**Objective:** Give the platform a concrete, auditable answer to "show/export everything about this person," a common regulatory requirement (e.g. GDPR Art. 15/20) rather than leaving it as an unimplemented promise.
**Acceptance Criteria:** Export aggregates data via each context's existing read ports (no new direct DB access bypassing context boundaries); export generation itself is logged as a compliance-case event; erasure requests route through Phase-per-context deletion/anonymization hooks rather than raw deletes.
**Dependencies:** 312, 314
**Estimated Complexity:** L
**Files Affected:** `packages/governance/application/use-cases/export-subject-data.ts`, `packages/governance/application/ports/subject-data-source.ts`
**Tests Required:** Integration tests assembling an export across at least three contexts; test that generation is itself audited.
**Documentation Required:** `docs/compliance/data-subject-requests.md` (new).
**Educational Notes:** Cross-context aggregation done through each context's own read port (not a shared query joining internal tables) is the bounded-context boundary paying off — governance can serve a cross-cutting need without knowing any other context's internal schema.
**Deliverables:** Tested data-subject export/erasure workflow.

---

### Issue 316 — Data retention rule domain model
**Description:** `RetentionRule` entity (organizationId, resourceType, retentionPeriod, action: `delete`/`anonymize`/`archive`) scoping how long a given category of data (sessions, verification evidence, audit exports) may be kept before the configured action applies.
**Objective:** Let organizations declare retention policy as data rather than as scattered TTLs/cron jobs per context, matching how Issue 307's policies centralize authorization rules.
**Acceptance Criteria:** Rules validate against a known enum of resource types (rejecting typos at creation, not at enforcement time); overlapping rules for the same resource type in one org are rejected; rule changes are versioned like Issue 307's policies.
**Dependencies:** 301
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/retention-rule.ts`
**Tests Required:** Unit tests for validation, overlap rejection, versioning.
**Documentation Required:** `docs/guides/governance.md` retention-rules section.
**Educational Notes:** Centralizing retention as declarative rules (vs. per-context hardcoded TTLs) means one compliance officer can audit "how long do we keep X" in one place instead of grepping every context's cron jobs.
**Deliverables:** Tested retention rule domain model.

---

### Issue 317 — Retention enforcement job & per-context hooks
**Description:** A scheduled `RetentionEnforcementJob` that, for each active `RetentionRule`, queries the relevant context via a `RetentionTarget` port (implemented per context: sessions, verification, audit exports) and applies the rule's configured action to expired records.
**Objective:** Turn Issue 316's declared rules into actual enforcement, without governance reaching into other contexts' tables directly.
**Acceptance Criteria:** Each context implements `RetentionTarget` independently; job runs idempotently (re-running after a partial failure doesn't double-process); every enforcement action is logged with rule id, resource id, and action taken; audit-context records (Phase 10) are exempt from deletion by design (append-only) and only support archival, never delete.
**Dependencies:** 316, and the relevant contexts' read/write ports
**Estimated Complexity:** L
**Files Affected:** `packages/governance/application/retention-enforcement-job.ts`, `packages/governance/application/ports/retention-target.ts`, `packages/sessions/infrastructure/session-retention-target.ts`, `packages/verification/infrastructure/verification-retention-target.ts`
**Tests Required:** Integration tests per implemented `RetentionTarget`; idempotency test (job re-run produces no duplicate side effects); explicit test that audit records are never hard-deleted.
**Documentation Required:** `docs/guides/governance.md` enforcement-job section; `docs/security/threat-model-governance.md` note on why audit deletion is structurally disallowed.
**Educational Notes:** Idempotent job design (safe to re-run after a crash mid-batch) is a general distributed-systems concern, not specific to retention — the same "at-least-once delivery needs idempotent handlers" reasoning as any queue consumer.
**Deliverables:** Tested, idempotent retention enforcement job.

---

### Issue 318 — Legal hold override
**Description:** `LegalHold` entity that, when active on a resource (by id or by account), suspends all retention-rule enforcement for that resource regardless of an otherwise-expired `RetentionRule`, with its own creation/release audit trail.
**Objective:** Satisfy the common real-world requirement that data under active litigation or investigation must not be deleted on schedule, even if a retention rule says it should be.
**Acceptance Criteria:** Issue 317's enforcement job checks for an active hold before acting and skips held resources entirely; placing/releasing a hold requires an elevated compliance role and is itself an audited action; a held resource past its retention period is surfaced in an "overdue but held" report rather than silently skipped.
**Dependencies:** 316, 317
**Estimated Complexity:** M
**Files Affected:** `packages/governance/domain/legal-hold.ts`, `packages/governance/application/use-cases/place-legal-hold.ts`, `packages/governance/application/retention-enforcement-job.ts`
**Tests Required:** Unit tests for hold-checking precedence over rule enforcement; integration test for the overdue-but-held report.
**Documentation Required:** `docs/compliance/data-subject-requests.md` legal-hold interaction note.
**Educational Notes:** A visible "overdue but held" report (vs. silent skip) matters because compliance defensibility requires being able to show *why* something wasn't deleted, not just that it wasn't.
**Deliverables:** Tested legal-hold override with reporting.

---

### Issue 319 — Admin audit query API (read model over Phase 10's log)
**Description:** `AdminAuditQueryService` and Fastify routes (`GET /admin/organizations/:orgId/audit-events`) providing filtered, paginated read access to Phase 10's audit log — by actor, event type, date range, and resource — building a denormalized read model rather than querying the hash-chained append store directly per request.
**Objective:** Give admins and compliance officers a usable investigative view over audit history without risking accidental load on, or coupling to the internals of, the write-optimized append-only store.
**Acceptance Criteria:** Queries never mutate or bypass the audit log's integrity guarantees; pagination is stable under concurrent inserts; access is scoped to the requesting admin's organization (no cross-tenant audit visibility); query latency documented as a non-goal-of-real-time (read model may lag).
**Dependencies:** Phase 10's audit event store, 304
**Estimated Complexity:** L
**Files Affected:** `packages/governance/application/admin-audit-query-service.ts`, `packages/governance/interface/http/admin-audit-routes.ts`, `packages/governance/infrastructure/audit-read-model-projector.ts`
**Tests Required:** Integration tests for filter/pagination correctness, cross-tenant isolation, and read-model consistency under concurrent writes.
**Documentation Required:** `docs/guides/governance.md` admin-audit-views section explaining the read-model/write-model split.
**Educational Notes:** CQRS applied narrowly and for a real reason — the audit store's write path is deliberately append-only and hash-chained (Phase 10), so ad hoc filtered queries get a separate projected read model instead of complicating that write path's guarantees.
**Deliverables:** Tested admin audit query API and read-model projector.

---

### Issue 320 — `packages/governance` public API surface, composition wiring & tutorial
**Description:** Curate `index.ts` exports applying the Issue 038 boundary pattern; register all Phase 16 routes, the retention enforcement job scheduler, and the audit read-model projector in `apps/api`'s composition root; write `docs/guides/tutorials/building-the-governance-context.md` walking through org management, policy authoring/publishing, compliance workflows, retention/legal hold, and admin audit views as one coherent system.
**Objective:** Close out Phase 16 with the same encapsulation, composition-root wiring, and educational-artifact pattern used to close every prior phase.
**Acceptance Criteria:** Only intended ports/use cases exported from `packages/governance`; deep-import lint rule extended; `apps/api` boots with all Phase 16 routes and background jobs registered; tutorial links every claim to real code/tests from Issues 301–319; coverage gate (Issue 037 pattern) active for `packages/governance`.
**Dependencies:** 037, 038, 301–319
**Estimated Complexity:** M
**Files Affected:** `packages/governance/index.ts`, `.eslintrc.cjs`, `apps/api/composition/governance.ts`, `apps/api/app.ts`, `docs/guides/tutorials/building-the-governance-context.md`
**Tests Required:** Startup smoke test verifying route and job registration; lint rule verification.
**Documentation Required:** This issue's deliverable is the tutorial itself.
**Educational Notes:** Bringing five sub-areas (orgs, policies, compliance, retention, audit views) together under one composition-root wiring step is the payoff of bounded-context discipline — each piece was independently testable, and integration is a wiring exercise, not a redesign.
**Deliverables:** Curated public API, fully wired governance subsystem, and published tutorial.

---
