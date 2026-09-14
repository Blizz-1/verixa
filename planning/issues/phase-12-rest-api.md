# Phase 12 — API Layer: REST (Issues 221–240)

Builds `apps/api`'s REST surface: OpenAPI-first route definitions that finally expose
the use cases assembled across Phases 02–10 over real HTTP, plus the contract-level
concerns (validation, errors, pagination, versioning, API-key auth) that make the API
usable by both humans and machine clients.

---

### Issue 221 — OpenAPI-first contract authoring workflow
**Description:** Establish `apps/api/openapi/openapi.yaml` as the source of truth for the REST surface, written by hand before route code, using Fastify's `@fastify/swagger` to serve it and `@fastify/swagger-ui` for interactive docs. Define the base structure: info, servers, tags per bounded context, and shared component schemas.
**Objective:** Make the contract the design artifact, not a byproduct generated after routes are coded — route handlers implement the spec, they don't define it.
**Acceptance Criteria:** `openapi.yaml` validates against the OpenAPI 3.1 schema in CI; served at `/docs/openapi.json` in dev; empty paths object with tags for identity, credentials, sessions, mfa, authorization, verification, audit, governance, notifications reserved.
**Dependencies:** 050
**Estimated Complexity:** M
**Files Affected:** `apps/api/openapi/openapi.yaml`, `apps/api/src/plugins/swagger.ts`
**Tests Required:** CI step validating the spec file against the OpenAPI schema.
**Documentation Required:** `docs/guides/api-design.md`
**Educational Notes:** Contract-first vs. code-first API design — writing the contract first forces the team to agree on shape and semantics before implementation details leak into it, and gives client teams a stable target to build against in parallel.
**Deliverables:** Validated empty OpenAPI contract served in dev.

---

### Issue 222 — Zod-to-OpenAPI schema bridge
**Description:** Wire `zod-to-openapi` (or equivalent) so route-level Zod validation schemas (built per Phase's DTOs) generate the corresponding OpenAPI component schemas automatically, keeping runtime validation and published documentation from drifting apart.
**Objective:** Eliminate the class of bug where the documented contract and the actual validation logic silently diverge over time.
**Acceptance Criteria:** A sample DTO schema registered once produces both a working Fastify validator and a correct OpenAPI component; CI fails if a route schema exists without a corresponding registered OpenAPI schema.
**Dependencies:** 221
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/openapi/zod-registry.ts`, `apps/api/src/plugins/schema-registry.ts`
**Tests Required:** Unit test asserting a registered Zod schema appears in generated OpenAPI output with matching constraints.
**Documentation Required:** `docs/guides/api-design.md` update.
**Educational Notes:** Single source of truth as a design goal — generating documentation from the same schema that performs validation, rather than maintaining two parallel descriptions of the same data.
**Deliverables:** Working Zod-to-OpenAPI schema bridge with a drift-detection CI check.

---

### Issue 223 — Standard error response contract
**Description:** Define a single JSON error shape (`{ error: { code, message, details?, requestId } }`) used by every route in the API, with a registry of stable machine-readable `code` values (e.g. `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`) mapped from domain/application-layer error types.
**Objective:** Give every client — human or machine — one predictable error shape to parse, instead of ad hoc per-route error formats.
**Acceptance Criteria:** A global Fastify error handler produces the standard shape for all thrown errors including uncaught ones; domain errors from Phases 02–10 map to specific codes via an explicit table, not a generic catch-all; internal error details never leak into the response body (only into server-side logs, correlated by `requestId`).
**Dependencies:** 050
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/errors/api-error.ts`, `apps/api/src/errors/error-code-registry.ts`, `apps/api/src/plugins/error-handler.ts`
**Tests Required:** Integration tests asserting each mapped domain error type produces its documented code and status; test that internal errors are sanitized before serialization.
**Documentation Required:** `docs/guides/api-design.md` error contract section; error codes published in OpenAPI as a shared component.
**Educational Notes:** Why leaking stack traces or raw exception messages to clients is a security smell (information disclosure), and why a stable error-code vocabulary — not just HTTP status codes — is what lets client code branch reliably.
**Deliverables:** Global standard error contract enforced across all routes.

---

### Issue 224 — Request validation middleware & DTO conventions
**Description:** Establish the convention that every route declares `params`/`querystring`/`body` Zod schemas via Fastify's schema validation hook, rejecting invalid requests before any handler or use case code runs, with validation failures routed through Issue 223's `VALIDATION_ERROR` shape including per-field detail.
**Objective:** Keep invalid input from ever reaching application-layer use cases — validation is a transport-layer concern, not something use cases should re-implement.
**Acceptance Criteria:** A route with a declared schema rejects malformed input with 400 and field-level detail before the handler executes (asserted via a spy/mock use case that must not be called); convention documented with a lint rule flagging routes missing a validation schema.
**Dependencies:** 222, 223
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/plugins/validation.ts`, `apps/api/src/dto/base-dto.ts`, `.eslintrc.cjs`
**Tests Required:** Integration tests for malformed params/query/body across representative routes; lint rule test.
**Documentation Required:** `docs/guides/api-design.md` request validation section.
**Educational Notes:** Defense in depth applied to input handling — validating at the boundary means the domain layer can trust its inputs are already well-formed, simplifying use case logic.
**Deliverables:** Enforced request-validation convention with tooling backstop.

---

### Issue 225 — Composition root: route registration wiring
**Description:** Extend the Phase 03 composition root (Issue 050) pattern so each bounded context's Fastify routes (in `packages/<context>/interface/`) are registered against use case instances built from real infrastructure adapters, mounted under context-specific path prefixes in `apps/api/src/app.ts`.
**Objective:** Establish the mechanical pattern every subsequent route-adding issue in this phase will reuse — `apps/api` wires, contexts implement, per Architecture §4's dependency rule.
**Acceptance Criteria:** A trivial health-check-style route from one context round-trips through the full composition (DI container → use case → Fastify route) in an integration test; pattern documented so later issues need only "follow issue 225's pattern."
**Dependencies:** 050, 221, 223, 224
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/composition/register-routes.ts`, `apps/api/src/app.ts`, `packages/shared-kernel/interface/route-registration.ts`
**Tests Required:** Integration test exercising one end-to-end wired route.
**Documentation Required:** `docs/guides/composition-root.md` REST routing section.
**Educational Notes:** Why the composition root — not individual packages — decides how contexts are exposed over HTTP: it keeps `packages/*` transport-agnostic and reusable as libraries, per the platform's "composable over monolithic" principle.
**Deliverables:** Reusable route-registration pattern with one working end-to-end route.

---

### Issue 226 — Identity & credentials routes
**Description:** Implement REST routes for registration, email verification, profile read/update, password change, and account recovery, wired to Phase 02–04 use cases via Issue 225's pattern, under `/v1/identity` and `/v1/credentials`.
**Objective:** Expose the platform's first bounded contexts to real HTTP clients.
**Acceptance Criteria:** Each route validated (Issue 224), documented in OpenAPI (Issue 222), and returns the standard error shape (Issue 223) on failure; integration tests cover success and each documented error path per route.
**Dependencies:** 225, Phase 02 use cases, Phase 04 use cases
**Estimated Complexity:** L
**Files Affected:** `packages/identity/interface/routes/*.ts`, `packages/credentials/interface/routes/*.ts`
**Tests Required:** Supertest integration tests per route (success + validation + not-found + conflict paths).
**Documentation Required:** OpenAPI paths for both contexts.
**Educational Notes:** N/A (application of established patterns).
**Deliverables:** Live, tested identity and credentials REST routes.

---

### Issue 227 — Sessions & MFA routes
**Description:** Implement login, logout, refresh, session-list/revoke, and MFA enrollment/challenge/verify routes wired to Phase 05–06 use cases, under `/v1/sessions` and `/v1/mfa`.
**Objective:** Expose authentication and MFA flows over HTTP with the same contract discipline as Issue 226.
**Acceptance Criteria:** Same bar as Issue 226; additionally, login/refresh routes set/read tokens per the transport convention already established in Phase 05 (cookie or bearer, per that phase's decision), not reinvented here.
**Dependencies:** 225, 226, Phase 05 use cases, Phase 06 use cases
**Estimated Complexity:** L
**Files Affected:** `packages/sessions/interface/routes/*.ts`, `packages/mfa/interface/routes/*.ts`
**Tests Required:** Supertest integration tests per route including token-handling edge cases.
**Documentation Required:** OpenAPI paths for both contexts.
**Educational Notes:** N/A (pattern reuse).
**Deliverables:** Live, tested sessions and MFA REST routes.

---

### Issue 228 — Authorization (RBAC/ABAC) routes
**Description:** Implement routes for role/permission assignment, policy evaluation preview, and permission listing, wired to Phase 07 use cases, under `/v1/authorization`, protected by the permission checks those use cases already enforce.
**Objective:** Expose the authorization engine for both admin UIs and machine clients to manage and query.
**Acceptance Criteria:** Routes reject unauthorized callers using existing RBAC/ABAC checks (no bypass at the transport layer); same validation/error/docs bar as Issue 226.
**Dependencies:** 225, Phase 07 use cases
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/interface/routes/*.ts`
**Tests Required:** Integration tests including an explicit "insufficient permission returns 403 with standard error shape" case per route.
**Documentation Required:** OpenAPI paths.
**Educational Notes:** Why authorization checks belong in the application layer (already enforced) and the route layer should never assume trust just because a request reached it — belt-and-suspenders against transport-layer bugs.
**Deliverables:** Live, tested authorization REST routes.

---

### Issue 229 — Verification & governance routes
**Description:** Implement routes for verification-workflow submission/status/review and governance admin operations (org policy, admin actions), wired to Phase 08–09 use cases, under `/v1/verification` and `/v1/governance`.
**Objective:** Expose the platform's workflow-heavy contexts over HTTP.
**Acceptance Criteria:** Same bar as Issue 226; routes involving file/evidence upload (verification) use the transport pattern already established in Phase 08, not a new one invented here.
**Dependencies:** 225, Phase 08 use cases, Phase 09 use cases
**Estimated Complexity:** L
**Files Affected:** `packages/verification/interface/routes/*.ts`, `packages/governance/interface/routes/*.ts`
**Tests Required:** Supertest integration tests per route.
**Documentation Required:** OpenAPI paths for both contexts.
**Educational Notes:** N/A (pattern reuse).
**Deliverables:** Live, tested verification and governance REST routes.

---

### Issue 230 — Audit query/export routes
**Description:** Implement routes exposing Phase 10's `QueryAuditEvents` and `ExportAuditEvents` use cases under `/v1/audit`, including streaming the export response body directly from the use case's stream rather than buffering.
**Objective:** Make the audit trail queryable/exportable by authorized clients over HTTP, completing Phase 10's deferred "Phase 12" cross-reference (Issue 199).
**Acceptance Criteria:** Query route supports the same filters/pagination as the use case; export route streams (verified via a memory-bounded integration test); both enforce the cross-org rejection and self-audit-logging behavior from Issue 199 unchanged.
**Dependencies:** 225, 187, 189, 199, 232
**Estimated Complexity:** M
**Files Affected:** `packages/audit/interface/routes/query-audit-events.ts`, `packages/audit/interface/routes/export-audit-events.ts`
**Tests Required:** Integration tests for query filters/pagination and a streaming export test.
**Documentation Required:** OpenAPI paths for `/v1/audit`.
**Educational Notes:** Streaming an HTTP response body directly from an async generator/stream, avoiding the same buffering pitfall Issue 189 avoided at the use-case layer — the concern recurs at the transport boundary and must be handled there too.
**Deliverables:** Live, tested audit query and export REST routes.

---

### Issue 231 — Cursor-based pagination convention
**Description:** Standardize a single pagination shape across all list-returning routes: `?cursor=&limit=` request params and `{ items, nextCursor, hasMore }` response envelope, built on the keyset-pagination approach already used internally by Phase 10 (Issue 187) and applied uniformly to every other context's list endpoints.
**Objective:** Give API clients one pagination mental model across the entire surface instead of a different scheme per route.
**Acceptance Criteria:** A shared `PaginatedResponse<T>` OpenAPI component and Fastify serializer used by every list route; `limit` has a documented default and max, enforced server-side; cursor is opaque to clients (base64-encoded internal key, not a raw offset).
**Dependencies:** 224, 225, 187
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/pagination/cursor-pagination.ts`, `apps/api/openapi/components/pagination.yaml`
**Tests Required:** Unit tests for cursor encode/decode round-trip; integration test asserting a list route respects `limit` bounds and stable ordering across pages under concurrent inserts.
**Documentation Required:** `docs/guides/api-design.md` pagination section.
**Educational Notes:** Why offset pagination (`?page=&pageSize=`) breaks under concurrent writes (skipped/duplicated rows) while keyset/cursor pagination stays stable — same reasoning as Issue 187, now generalized as a platform-wide convention.
**Deliverables:** Uniform, tested pagination convention applied API-wide.

---

### Issue 232 — API versioning strategy
**Description:** Adopt URI-path versioning (`/v1/...`) as the primary strategy, document the deprecation policy (minimum notice period, `Deprecation`/`Sunset` HTTP headers on routes slated for removal), and add a version-negotiation plugin that rejects unversioned requests with a clear error rather than silently defaulting.
**Objective:** Let the API evolve without breaking existing machine clients, and make version lifecycle explicit rather than implicit.
**Acceptance Criteria:** All routes registered in this phase live under `/v1`; a documented ADR records the URI-vs-header-versioning tradeoff and why URI won; a route flagged deprecated in a test emits `Deprecation`/`Sunset` headers correctly.
**Dependencies:** 225
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/plugins/versioning.ts`, `docs/adr/0012-api-versioning.md`
**Tests Required:** Unit test for deprecation header emission; integration test rejecting an unversioned request.
**Documentation Required:** ADR (this issue's deliverable) plus `docs/guides/api-design.md` update.
**Educational Notes:** URI versioning vs. header/content-negotiation versioning — URI versioning is more visible and cacheable but less "RESTfully pure"; the tradeoff is made explicit rather than assumed, in keeping with the project's ADR discipline.
**Deliverables:** Documented, enforced versioning strategy.

---

### Issue 233 — API-key authentication for machine clients
**Description:** Add an `ApiKey` domain concept (hashed-at-rest, scoped to an organization, with an optional permission/scope list) and a Fastify auth strategy accepting `Authorization: ApiKey <key>` alongside the existing session-based auth from Phase 05, resolving to a service-principal identity usable by the same authorization checks as human users.
**Objective:** Let machine-to-machine clients (integrations, CI systems, other services) authenticate without impersonating a human session.
**Acceptance Criteria:** API keys stored as a salted hash, never in plaintext, per Phase 04's credential-hashing pattern; a request with a valid key resolves to a distinct principal type authorization can branch on; revoked/expired keys are rejected; key creation itself is an audited action (Phase 10 subscriber extended).
**Dependencies:** 225, Phase 04 hashing utilities, Phase 07 authorization, Phase 10 audit subscribers
**Estimated Complexity:** L
**Files Affected:** `packages/identity/domain/entities/api-key.ts`, `packages/identity/application/use-cases/create-api-key.ts`, `apps/api/src/plugins/api-key-auth.ts`, `prisma/schema.prisma`
**Tests Required:** Unit tests for hashing/validation; integration tests for valid/invalid/expired/revoked key flows and authorization branching by principal type.
**Documentation Required:** `docs/security/api-key-authentication.md`
**Educational Notes:** Why API keys must be hashed like passwords (a leaked database shouldn't yield usable credentials) and why service principals need to be a first-class concept in the authorization model rather than a human-user row with a fake email.
**Deliverables:** Tested API-key auth strategy usable across all v1 routes.

---

### Issue 234 — Rate limiting per principal
**Description:** Apply per-principal (user session or API key) rate limiting using the Redis-backed counters already established for auth flows (Phase 04/05), generalized to a configurable-per-route Fastify plugin, returning `RATE_LIMITED` (Issue 223) with `Retry-After` on limit breach.
**Objective:** Protect the now-publicly-reachable API from abuse and runaway machine clients, reusing existing infrastructure rather than adding a new rate-limiting mechanism.
**Acceptance Criteria:** Default rate limit applied globally; sensitive routes (auth, export) configurable to a stricter limit; breach returns standard error shape plus `Retry-After`; limit tracked per-principal, not just per-IP, so authenticated abuse is still caught.
**Dependencies:** 223, 233
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/plugins/rate-limit.ts`
**Tests Required:** Integration tests asserting limit breach behavior and correct `Retry-After` value.
**Documentation Required:** `docs/guides/api-design.md` rate limiting section.
**Educational Notes:** Per-principal vs. per-IP rate limiting — IP-based limits are trivially bypassed by an attacker with an API key and rotating source IPs, so limiting by authenticated identity is the stronger control.
**Deliverables:** Tested per-principal rate limiting applied API-wide.

---

### Issue 235 — CORS and security headers policy
**Description:** Configure `@fastify/cors` with an explicit allow-list (no wildcard `*` when credentials are involved) and `@fastify/helmet` for standard security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, a conservative `Content-Security-Policy` for the docs UI), documented per environment (dev vs. prod allow-list differences).
**Objective:** Close the gap between "the API works" and "the API is safe to expose to browsers," which the route-by-route issues above don't otherwise cover.
**Acceptance Criteria:** Cross-origin request from a non-allow-listed origin rejected in an integration test; security headers present on all responses including error responses; CSP does not break the Swagger UI from Issue 221.
**Dependencies:** 221, 225
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/plugins/cors.ts`, `apps/api/src/plugins/security-headers.ts`
**Tests Required:** Integration tests for disallowed-origin rejection and header presence.
**Documentation Required:** `docs/security/api-transport-security.md`
**Educational Notes:** Why `Access-Control-Allow-Origin: *` combined with credentialed requests is a real vulnerability class, and why security headers are cheap, high-leverage mitigations against a broad class of browser-side attacks (clickjacking, MIME sniffing).
**Deliverables:** Enforced CORS allow-list and security header baseline.

---

### Issue 236 — Idempotency keys for unsafe write operations
**Description:** Support an `Idempotency-Key` request header on POST routes that create resources (registration, API-key creation, verification submission), storing the key with the resulting response for a bounded window in Redis so a retried request with the same key returns the original result instead of duplicating the side effect.
**Objective:** Make retries from flaky machine clients safe by default, a common real-world requirement for payment/identity-adjacent APIs.
**Acceptance Criteria:** Two identical requests with the same idempotency key produce exactly one underlying side effect and two identical responses; a different body with a reused key is rejected as a conflict; keys expire after a documented TTL.
**Dependencies:** 223, 225
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/plugins/idempotency.ts`
**Tests Required:** Integration tests for duplicate-request suppression, conflicting-body rejection, and TTL expiry.
**Documentation Required:** `docs/guides/api-design.md` idempotency section.
**Educational Notes:** At-least-once delivery is the norm over unreliable networks — idempotency keys are the standard mechanism for turning "retry-safe" into a guarantee instead of a hope, without requiring every write operation to be naturally idempotent.
**Deliverables:** Tested idempotency-key support on create routes.

---

### Issue 237 — Correlation ID propagation & structured request logging
**Description:** Generate (or accept an inbound) `X-Request-Id` per request, attach it to the pino logger context for that request's lifetime, include it in every error response (Issue 223's `requestId` field), and propagate it into any outbound calls (e.g. notifications) for cross-context traceability.
**Objective:** Make a single failing request traceable end-to-end across logs and error responses, essential once real traffic starts flowing through the composed app.
**Acceptance Criteria:** A request without an inbound ID gets one generated; an inbound ID is preserved rather than replaced; the same ID appears in the structured log lines and the error response body for a request that errors.
**Dependencies:** 223, 225
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/plugins/request-context.ts`
**Tests Required:** Integration test asserting ID propagation and presence in both logs (captured via a test transport) and error body.
**Documentation Required:** `docs/guides/api-design.md` observability section.
**Educational Notes:** Correlation IDs as the low-tech precursor to full distributed tracing — cheap to add now, and the seam OpenTelemetry spans (Architecture §6) will later attach to.
**Deliverables:** Tested request correlation-ID propagation.

---

### Issue 238 — Contract testing against the OpenAPI spec
**Description:** Add a CI step that replays a representative set of recorded/fixture requests against the running composed app and validates each response against the OpenAPI spec's declared schemas (using a tool such as `openapi-response-validator`), catching drift between implementation and documentation that unit tests alone might miss.
**Objective:** Guarantee the published contract (Issue 221) actually matches what the API returns, not just what it was intended to return.
**Acceptance Criteria:** CI fails if any route's actual response shape diverges from its OpenAPI schema; at least one route per bounded context covered by a fixture.
**Dependencies:** 226, 227, 228, 229, 230
**Estimated Complexity:** M
**Files Affected:** `apps/api/tests/contract/openapi-contract.test.ts`, `infra/ci/contract-tests.yml`
**Tests Required:** The contract test suite itself, run in CI.
**Documentation Required:** `docs/guides/testing-strategy.md` contract testing section.
**Educational Notes:** Contract testing as the enforcement mechanism that makes "contract-first" (Issue 221) a durable guarantee rather than a one-time design exercise — specs rot without an automated check tying them to real behavior.
**Deliverables:** CI-enforced contract tests covering every bounded context.

---

### Issue 239 — `apps/api` REST layer threat model & security review
**Description:** STRIDE-based threat model for the assembled REST surface covering the concerns unique to exposing everything over HTTP: broken object-level authorization (BOLA) across routes, mass assignment via loosely-typed request bodies, API-key leakage/replay, and rate-limit bypass, cross-referencing which issues in this phase mitigate each.
**Objective:** Review the API layer holistically now that every context is wired together, since composed systems have attack surfaces individual contexts don't expose alone.
**Acceptance Criteria:** All STRIDE categories addressed; BOLA specifically verified with a test attempting to access another organization's resource by ID across at least three routes; findings either resolved or documented as accepted risk.
**Dependencies:** 226, 227, 228, 229, 230, 233, 234, 235, 236
**Estimated Complexity:** M
**Files Affected:** `docs/security/threat-model-rest-api.md`
**Tests Required:** BOLA regression tests added to the affected routes' integration suites.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** BOLA (OWASP API Security Top 10 #1) as the most common real-world API vulnerability — nearly every route in this phase touches organization- or user-scoped resources, making this the single highest-value review to run once the full surface exists.
**Deliverables:** Published threat model with BOLA regression coverage.

---

### Issue 240 — REST API educational walkthrough
**Description:** Write `docs/guides/tutorials/build-a-contract-first-rest-api.md`, a from-scratch narrative covering OpenAPI-first design, the Zod-to-OpenAPI bridge, the standard error contract, cursor pagination, versioning, and API-key auth, using this phase's code as the worked example and explicitly showing how a Phase 02–10 use case becomes a documented, tested HTTP endpoint.
**Objective:** Deliver the flagship "how to build a well-behaved REST API on top of clean architecture" educational artifact for this phase.
**Acceptance Criteria:** Walkthrough traces one use case (e.g. registration) end-to-end from domain layer through composition root to HTTP response, linking every claim to real code/tests in the repo; covers each major topic of this phase at least briefly.
**Dependencies:** 221–239
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-a-contract-first-rest-api.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.

---
