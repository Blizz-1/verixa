# Phase 13 — API Layer: GraphQL & Gateway (Issues 241–260)

Adds a GraphQL surface — schema, resolvers, and a gateway auth/complexity layer — over the same use cases exposed by Phase 12's REST API (Issues 221–240), purpose-built for flexible governance and admin-console queries rather than as a wholesale REST replacement.

---

### Issue 241 — GraphQL server bootstrap in `apps/api`
**Description:** Add a GraphQL server (Mercurius, Fastify's native GraphQL plugin) mounted at `/graphql` alongside the existing REST routes from Phase 12, sharing the same Fastify instance, logger, and request-correlation-id middleware.
**Objective:** Stand up the GraphQL entry point as a sibling to REST, not a competing app, so both surfaces share infrastructure.
**Acceptance Criteria:** `/graphql` responds to a trivial `{ __typename }` query; correlation-id header present on GraphQL responses same as REST; REST routes from Phase 12 unaffected.
**Dependencies:** 221, 222
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/graphql/server.ts`, `apps/api/src/app.ts`
**Tests Required:** Integration test hitting `/graphql` with a trivial query.
**Documentation Required:** `docs/guides/api-layer.md` GraphQL section.
**Educational Notes:** Why GraphQL is mounted as one more route on the existing HTTP app rather than a separate service — a single composition root keeps auth, logging, and error handling consistent across API styles.
**Deliverables:** Running GraphQL endpoint.

---

### Issue 242 — Schema design principles & SDL scaffolding
**Description:** Write the initial `.graphql` SDL files establishing naming conventions (types, fields, enums), a root `Query`/`Mutation` split, and a documented policy for when a use case gets a GraphQL field vs. staying REST-only (per Phase 12's stated audience split).
**Objective:** Prevent schema sprawl by deciding conventions before the first real type is written.
**Acceptance Criteria:** SDL lints clean under a GraphQL schema linter; naming conventions documented; policy doc lists concrete inclusion/exclusion criteria.
**Dependencies:** 241
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/graphql/schema/root.graphql`, `docs/guides/graphql-schema-conventions.md`
**Tests Required:** Schema lint check in CI.
**Documentation Required:** `docs/guides/graphql-schema-conventions.md`
**Educational Notes:** GraphQL schema-first design — the SDL is a contract negotiated before implementation, unlike REST where the shape often emerges from the handler.
**Deliverables:** Linted schema scaffolding and written conventions.

---

### Issue 243 — Identity & organization types
**Description:** GraphQL types for `User`, `Organization`, and their relationships, mapped from Phase 01–02 domain entities, with field-level resolvers backed by existing use cases (no new business logic).
**Objective:** Expose read access to identity data in a shape suited to admin-console queries (e.g. nested org → users in one round trip).
**Acceptance Criteria:** Query resolves nested `Organization.users` without N+1 (verified via query count assertion); no field bypasses an existing use case to hit a repository directly.
**Dependencies:** 242, and Phase 01/02 identity use cases
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/schema/identity.graphql`, `apps/api/src/graphql/resolvers/identity-resolvers.ts`
**Tests Required:** Integration tests for nested queries, including N+1 regression test.
**Documentation Required:** `docs/guides/api-layer.md` update.
**Educational Notes:** The N+1 query problem — why naive resolver-per-field GraphQL implementations silently generate O(n) database round trips, and why this must be caught in tests, not just in code review.
**Deliverables:** Tested identity/org query types.

---

### Issue 244 — DataLoader-based batching for relational fields
**Description:** Introduce a per-request DataLoader for each relation identified in Issue 243 (and future relational fields), batching and caching repository calls within a single GraphQL request.
**Objective:** Solve the N+1 problem systematically rather than ad hoc per resolver.
**Acceptance Criteria:** DataLoader instances are request-scoped (no cross-request cache leakage, verified by test); batched query count matches expected minimum for representative nested queries.
**Dependencies:** 243
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/loaders/user-loader.ts`, `apps/api/src/graphql/context.ts`
**Tests Required:** Unit tests for loader batching/caching; integration test confirming no request-to-request cache bleed.
**Documentation Required:** `docs/guides/graphql-schema-conventions.md` DataLoader section.
**Educational Notes:** DataLoader's per-tick batching model — collapsing many `load(id)` calls issued during one event-loop tick into a single batched repository call.
**Deliverables:** Tested, request-scoped DataLoader infrastructure.

---

### Issue 245 — RBAC/ABAC types and permission-check resolvers
**Description:** GraphQL types for `Role`, `Permission`, and `PolicyAssignment` (Phase 07/08), with query resolvers for "what can this user do" style questions used by admin UIs.
**Objective:** Give governance UIs a single query to answer effective-permission questions instead of composing several REST calls client-side.
**Acceptance Criteria:** Query returns correctly merged effective permissions for a user across role and policy assignments, matching the REST equivalent's (Phase 12) computed result on the same fixture.
**Dependencies:** 243, 244, Phase 07/08 authorization use cases
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/schema/authorization.graphql`, `apps/api/src/graphql/resolvers/authorization-resolvers.ts`
**Tests Required:** Integration tests comparing GraphQL and REST outputs on shared fixtures.
**Documentation Required:** `docs/guides/api-layer.md` update.
**Educational Notes:** Cross-surface consistency testing — asserting two API styles agree on the same underlying use case output catches drift early.
**Deliverables:** Tested authorization query types.

---

### Issue 246 — Governance mutation types: role/policy management
**Description:** GraphQL mutations for governance admin actions (assign role, revoke role, create policy) from Phase 08/11, each delegating to the identical use case Phase 12's REST mutation endpoints call.
**Objective:** Let admin-console clients perform governance writes via GraphQL without duplicating business logic.
**Acceptance Criteria:** Each mutation input validated via the same Zod schema used by its REST counterpart; successful mutation returns the updated entity in GraphQL shape; unauthorized attempt rejected identically to REST.
**Dependencies:** 245, Phase 08/11 governance use cases
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/schema/governance.graphql`, `apps/api/src/graphql/resolvers/governance-resolvers.ts`
**Tests Required:** Integration tests per mutation, including an authorization-rejection case.
**Documentation Required:** `docs/guides/api-layer.md` update.
**Educational Notes:** Why mutations must reuse the exact same use case (and thus the same validation/authorization) as REST — a second, parallel implementation is a classic source of security drift between API surfaces.
**Deliverables:** Tested governance mutations.

---

### Issue 247 — Verification workflow types & resolvers
**Description:** GraphQL types and resolvers exposing verification case status, evidence metadata, and reviewer actions from Phase 06, tailored to the reviewer-console use case (list queue, view case detail, submit decision).
**Objective:** Support the verification reviewer console's need for flexible, view-specific queries.
**Acceptance Criteria:** Queue query supports filter/sort combinations used by the reviewer console mock; decision mutation reuses Phase 06's `SubmitVerificationDecision` use case unchanged.
**Dependencies:** 245, Phase 06 verification use cases
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/schema/verification.graphql`, `apps/api/src/graphql/resolvers/verification-resolvers.ts`
**Tests Required:** Integration tests for queue filtering and decision submission.
**Documentation Required:** `docs/guides/api-layer.md` update.
**Educational Notes:** N/A (pattern reuse from Issues 243–246 applied to a fourth context).
**Deliverables:** Tested verification query/mutation types.

---

### Issue 248 — Audit log query type (read-only, paginated)
**Description:** GraphQL query type wrapping Phase 10's `QueryAuditEvents` use case, exposing the same filters (actor, resource, date range) with cursor-based pagination expressed as a GraphQL Relay-style connection (`edges`/`pageInfo`).
**Objective:** Give governance UIs a native paginated audit query without reinventing Phase 10's filtering logic.
**Acceptance Criteria:** Connection pagination round-trips correctly (cursor from `pageInfo.endCursor` fetches the next page with no gaps/dupes); filters match REST equivalent's results on shared fixtures; no mutation field exists for audit events anywhere in the schema.
**Dependencies:** 187, 199, 244
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/schema/audit.graphql`, `apps/api/src/graphql/resolvers/audit-resolvers.ts`
**Tests Required:** Integration tests for pagination correctness and filter parity with REST.
**Documentation Required:** `docs/guides/api-layer.md` update.
**Educational Notes:** The Relay cursor-connection spec as a standard way to express cursor pagination in GraphQL — keeping the append-only audit log's read API consistent with the same keyset-pagination principle used in Phase 10, just re-expressed in GraphQL's connection shape.
**Deliverables:** Tested, read-only audit connection type.

---

### Issue 249 — Gateway authentication context resolution
**Description:** A GraphQL context-builder function invoked once per request that extracts the session/token (Phase 05) from the incoming request, resolves it to an authenticated principal, and attaches it to the resolver context — mirroring Phase 12's REST auth middleware but adapted to GraphQL's single-endpoint model.
**Objective:** Establish one gateway-level authentication choke point, since GraphQL's single `/graphql` route can't rely on per-route middleware the way REST does.
**Acceptance Criteria:** Unauthenticated request reaches resolvers with a `null` principal (not an error) so public fields still work; every resolver requiring auth checks context explicitly and rejects consistently; expired/invalid tokens produce the same error shape as Phase 12's REST auth failures.
**Dependencies:** 241, Phase 05 session validation
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/context.ts`, `apps/api/src/graphql/auth/resolve-principal.ts`
**Tests Required:** Integration tests for authenticated, unauthenticated, and invalid-token requests.
**Documentation Required:** `docs/security/graphql-gateway-auth.md`
**Educational Notes:** Why GraphQL auth is necessarily context-based rather than route-based — a single endpoint serving many logical operations means authorization decisions move from the transport layer into each resolver.
**Deliverables:** Tested gateway auth-context resolution.

---

### Issue 250 — Field-level authorization directive
**Description:** A custom `@requiresPermission(permission: String!)` SDL directive, implemented as a schema transformer, that wraps annotated fields with a permission check against the context principal (Phase 07/08 authorization) before the underlying resolver runs.
**Objective:** Make field-level authorization declarative and visible directly in the schema, rather than repeated imperative checks scattered across resolver bodies.
**Acceptance Criteria:** Field annotated with the directive rejects a principal lacking the permission before the resolver function executes (verified by a resolver-not-called assertion); missing/absent principal treated as denied by default.
**Dependencies:** 249, 245
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/directives/requires-permission.ts`, `apps/api/src/graphql/schema/root.graphql`
**Tests Required:** Unit tests for the directive transformer; integration tests for allow/deny paths across two annotated fields.
**Documentation Required:** `docs/guides/graphql-schema-conventions.md` directive section.
**Educational Notes:** Schema directives as a form of declarative, composable middleware — the same cross-cutting-concern idea as REST middleware chains, expressed at the field granularity GraphQL uniquely allows.
**Deliverables:** Tested authorization directive, applied to governance/audit fields.

---

### Issue 251 — Query depth limiting
**Description:** Middleware/validation rule rejecting queries exceeding a configurable maximum nesting depth before execution begins, using a static AST-analysis pass over the incoming query document.
**Objective:** Block a class of denial-of-service query (deeply nested self-referential queries) that field-level auth alone doesn't prevent.
**Acceptance Criteria:** Query beyond the configured depth is rejected pre-execution with a clear error (no resolver invoked, verified by call-count assertion); depth limit configurable via environment; legitimate queries under the limit unaffected.
**Dependencies:** 241
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/graphql/validation/depth-limit.ts`, `packages/config/src/graphql-config.ts`
**Tests Required:** Unit tests for accept/reject at and around the boundary depth.
**Documentation Required:** `docs/security/graphql-gateway-auth.md` update.
**Educational Notes:** Why GraphQL's flexible querying is also its biggest DoS surface — a client can request arbitrarily deep, self-referential data in a single request, something REST's fixed endpoints structurally prevent.
**Deliverables:** Tested depth-limiting validation rule.

---

### Issue 252 — Query complexity/cost analysis
**Description:** A cost-analysis validation rule assigning a numeric cost to each field (base cost + multiplier for list/connection fields, informed by DataLoader batch sizes) and rejecting queries whose total estimated cost exceeds a configured budget, complementing Issue 251's depth limit.
**Objective:** Catch wide-but-shallow queries (e.g. requesting thousands of list items with many nested fields) that depth limiting alone misses.
**Acceptance Criteria:** A synthetic high-cost query (wide list × nested fields) is rejected pre-execution; per-field costs configurable via schema directive or config map; cost budget configurable via environment.
**Dependencies:** 251, 244
**Estimated Complexity:** L
**Files Affected:** `apps/api/src/graphql/validation/complexity-limit.ts`, `apps/api/src/graphql/schema/root.graphql`
**Tests Required:** Unit tests for cost calculation across representative query shapes; integration test for a rejected high-cost query.
**Documentation Required:** `docs/security/graphql-gateway-auth.md` complexity-analysis section.
**Educational Notes:** Static cost analysis vs. runtime rate limiting — estimating a query's cost from its shape before execution is cheaper and safer than discovering the cost only after the database has already done the work.
**Deliverables:** Tested query complexity limiter.

---

### Issue 253 — Per-principal rate limiting on the GraphQL endpoint
**Description:** Apply Phase 09's Redis-backed rate limiter to `/graphql`, keyed by authenticated principal (or IP for unauthenticated requests) rather than by REST route, since all GraphQL traffic shares one endpoint.
**Objective:** Extend existing rate-limiting infrastructure to the gateway's single-endpoint shape without building a new limiter.
**Acceptance Criteria:** Requests exceeding the configured limit for a principal receive a 429-equivalent GraphQL error; limit counters shared correctly across concurrent requests (Redis-backed, verified in integration test); REST and GraphQL rate limits tracked independently.
**Dependencies:** 249, Phase 09 rate limiter
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/graphql/middleware/rate-limit.ts`
**Tests Required:** Integration tests for limit enforcement and independence from REST counters.
**Documentation Required:** `docs/security/graphql-gateway-auth.md` update.
**Educational Notes:** Reusing an existing cross-cutting capability across two API surfaces — rate limiting is a gateway concern, not a REST-specific one, so the same Redis-backed primitive applies unchanged.
**Deliverables:** Tested rate-limited GraphQL endpoint.

---

### Issue 254 — Persisted queries / query allowlisting
**Description:** Support for persisted queries — clients send a query hash instead of the full query document; the server maintains an allowlist of pre-approved query hashes (populated at build time from the admin console's known queries), rejecting unrecognized ad hoc queries in production mode.
**Objective:** Shrink the attack surface for arbitrary/malicious queries in production while keeping full query flexibility available in development.
**Acceptance Criteria:** Known persisted-query hash executes normally; unrecognized query rejected when allowlisting is enabled; allowlisting togglable via environment (enabled in production config, disabled in development).
**Dependencies:** 252
**Estimated Complexity:** M
**Files Affected:** `apps/api/src/graphql/persisted-queries/registry.ts`, `apps/api/src/graphql/server.ts`
**Tests Required:** Integration tests for allowed/rejected queries in both modes.
**Documentation Required:** `docs/security/graphql-gateway-auth.md` persisted-queries section.
**Educational Notes:** Persisted queries as GraphQL's answer to REST's implicit endpoint allowlisting — trading query flexibility for a smaller, auditable, production attack surface.
**Deliverables:** Tested persisted-query allowlisting.

---

### Issue 255 — Error formatting & information-leakage prevention
**Description:** A custom GraphQL error formatter that maps internal exceptions to safe, structured `GraphQLError` extensions (error code, no stack traces or SQL fragments in production), consistent with Phase 12's REST error envelope.
**Objective:** Prevent the gateway from leaking internal implementation details through error messages, and keep error shape consistent across REST and GraphQL.
**Acceptance Criteria:** A simulated internal exception (e.g. thrown by a fake repository) surfaces to the client as a generic coded error in production mode; development mode includes richer debug detail; error codes match the taxonomy used by Phase 12's REST error envelope.
**Dependencies:** 241, Phase 12 REST error envelope
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/graphql/errors/format-error.ts`
**Tests Required:** Unit tests for production vs. development formatting; integration test asserting no stack trace leaks.
**Documentation Required:** `docs/guides/api-layer.md` error-handling section.
**Educational Notes:** GraphQL's single-status-code (200-for-almost-everything) model shifts error semantics into the response body — the formatter is where "REST-equivalent" error discipline has to be reimplemented.
**Deliverables:** Tested, consistent GraphQL error formatting.

---

### Issue 256 — Subscription support for real-time governance events (optional/stubbed)
**Description:** Add GraphQL subscription infrastructure (WebSocket transport via Mercurius) for one representative use case — live verification-queue updates — backed by the in-process event publisher (Issue 026), explicitly scoped as an initial/limited implementation rather than a full real-time system.
**Objective:** Prove the subscription pattern works end-to-end on one real use case before committing to broader real-time coverage.
**Acceptance Criteria:** A connected subscriber receives an event within a bounded time after a matching domain event fires; connection requires the same authentication as queries/mutations; scope limitation documented (single use case, not a general pub-sub gateway yet).
**Dependencies:** 249, 247, Phase 01 event publisher
**Estimated Complexity:** L
**Files Affected:** `apps/api/src/graphql/schema/subscriptions.graphql`, `apps/api/src/graphql/resolvers/verification-subscriptions.ts`
**Tests Required:** Integration test with a real WebSocket client asserting event delivery.
**Documentation Required:** `docs/guides/api-layer.md` subscriptions section, with explicit scope note.
**Educational Notes:** GraphQL subscriptions as a third operation type beyond query/mutation — and why a single well-tested example is more valuable early on than broad, thinly-tested real-time coverage.
**Deliverables:** One working, authenticated subscription end-to-end.

---

### Issue 257 — Schema documentation generation
**Description:** Generate human-readable schema reference documentation from the SDL's descriptions (using a schema-to-markdown tool), published to `docs/api/graphql-reference.md`, regenerated in CI to catch drift between schema and docs.
**Objective:** Keep GraphQL documentation as accurate and low-maintenance as Phase 12's generated OpenAPI docs.
**Acceptance Criteria:** CI step regenerates docs and fails the build if committed docs are stale relative to the schema; every type/field in the schema carries an SDL description used in generation.
**Dependencies:** 242–256 (schema substantially complete)
**Estimated Complexity:** S
**Files Affected:** `docs/api/graphql-reference.md`, `infra/ci/graphql-docs-check.yml`
**Tests Required:** CI drift-check step.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Schema-as-documentation, mirroring OpenAPI's role for REST — generated docs stay honest because they're mechanically derived, not hand-maintained.
**Deliverables:** Auto-generated, drift-checked GraphQL reference docs.

---

### Issue 258 — GraphQL gateway threat model
**Description:** STRIDE-based threat model specific to the GraphQL surface: query-based DoS (depth/complexity/batching abuse), introspection information disclosure, authorization bypass via field-level gaps, and subscription connection exhaustion — cross-referencing which issues in this phase mitigate each.
**Objective:** Document the security reasoning behind the gateway's defenses as a coherent whole, parallel to Phase 10's audit threat model.
**Acceptance Criteria:** All GraphQL-specific threat categories addressed; introspection disabled or restricted in production and explicitly covered; each threat maps to a mitigating issue or documented accepted risk.
**Dependencies:** 250, 251, 252, 253, 254, 255
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-graphql-gateway.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** GraphQL introduces threat categories REST doesn't have in the same form (query-shape DoS, introspection leakage) — threat modeling has to be redone per API style, not assumed to carry over.
**Deliverables:** Published GraphQL gateway threat model.

---

### Issue 259 — Cross-surface parity test suite (REST vs. GraphQL)
**Description:** A shared integration test suite that runs the same set of business scenarios (e.g. "assign a role," "query audit events for an org") against both the REST endpoints (Phase 12) and the GraphQL schema (this phase), asserting equivalent underlying effects and equivalent authorization outcomes.
**Objective:** Continuously guard against the two API surfaces drifting apart in behavior now that both exist.
**Acceptance Criteria:** Suite covers at least one representative scenario per shared bounded context (identity, authorization, verification, audit, governance); a deliberately introduced REST/GraphQL behavioral mismatch (test-only) is caught by the suite.
**Dependencies:** 246, 247, 248, Phase 12 REST endpoints
**Estimated Complexity:** M
**Files Affected:** `tests/integration/api-parity/*.spec.ts`
**Tests Required:** The parity suite itself, run in CI.
**Documentation Required:** `docs/guides/api-layer.md` parity-testing section.
**Educational Notes:** Contract parity testing across two interfaces to the same application layer — a concrete way to enforce the architectural claim that both API styles are thin adapters over identical use cases.
**Deliverables:** CI-enforced REST/GraphQL parity suite.

---

### Issue 260 — GraphQL gateway educational walkthrough
**Description:** Write `docs/guides/tutorials/build-a-graphql-gateway.md`, a from-scratch narrative covering schema design, resolver/DataLoader patterns, gateway auth context, and the depth/complexity/persisted-query defenses, using this phase's code as the worked example and explicitly contrasting choices with Phase 12's REST layer.
**Objective:** Deliver the flagship "how and why to add GraphQL over an existing REST API" educational artifact for this phase.
**Acceptance Criteria:** Walkthrough covers schema design, N+1/DataLoader, auth-context resolution, all three abuse-prevention layers (depth, complexity, persisted queries), and links every claim to real code/tests in the repo; includes a section explicitly comparing trade-offs against the REST approach from Phase 12.
**Dependencies:** 241–259
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-a-graphql-gateway.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.

---
</content>
