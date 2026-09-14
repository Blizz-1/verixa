# Phase 08 — Authorization: ABAC / Policy Engine (Issues 141–160)

Extends `packages/authorization` beyond Phase 07's RBAC (Issues 121–140) with a
policy DSL, an attribute-driven evaluation engine, and the composition layer that
lets role checks and attribute-based policies decide authorization together.

---

### Issue 141 — Policy domain model (`Policy`, `Rule`, `Effect`, `Condition`)
**Description:** Core value objects and entities: `Policy` (id, name, target, list of `Rule`s, version), `Rule` (`Effect` of `PERMIT`/`DENY`, a `Condition` tree), and `Condition` as a composable expression (leaf comparisons plus `AND`/`OR`/`NOT` nodes).
**Objective:** Establish an evaluable, serialization-agnostic policy model before any DSL syntax or storage format is chosen.
**Acceptance Criteria:** `Condition` tree supports arbitrary nesting; `Policy`/`Rule` are immutable value objects; unit tests cover tree construction and structural equality.
**Dependencies:** 004, 005, 006, 121
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/domain/entities/policy.ts`, `domain/value-objects/rule.ts`, `domain/value-objects/condition.ts`, `domain/value-objects/effect.ts`
**Tests Required:** Unit tests for tree construction, equality, and invariants (e.g., a `Rule` must have at least one condition or an explicit "always" marker).
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Modeling conditions as a tree (not a flat rule list) mirrors how real policy engines (XACML, Cedar, OPA/Rego) represent boolean logic — it's the structure that makes combining algorithms (Issue 148) and static analysis (Issue 156) possible later.
**Deliverables:** Tested policy/rule/condition domain model.

---

### Issue 142 — Policy DSL grammar design
**Description:** Design a small, readable text DSL for authoring policies (e.g. `permit if resource.ownerId == subject.id and action == "read"`), specifying grammar in EBNF, operator set, and precedence rules.
**Objective:** Give policy authors (often non-engineers: security/compliance staff) a syntax more approachable than raw JSON ASTs, without building a general-purpose language.
**Acceptance Criteria:** Grammar document covers literals, attribute references, comparison/logical operators, and precedence; at least 10 example policies illustrate common patterns (ownership, time-window, org-scoping).
**Dependencies:** 141
**Estimated Complexity:** S
**Files Affected:** `docs/security/policy-dsl-grammar.md`
**Tests Required:** None (design artifact); examples validated against the parser once Issue 143 lands.
**Documentation Required:** This issue's deliverable is the grammar doc itself.
**Educational Notes:** Designing a DSL grammar before writing a parser is the same discipline as writing an API contract before an implementation — it forces precedence and ambiguity questions (does `and` bind tighter than `or`?) to be answered on paper, not discovered mid-parse.
**Deliverables:** Published DSL grammar specification.

---

### Issue 143 — Policy DSL lexer & parser
**Description:** Hand-written recursive-descent lexer/parser translating Issue 142's grammar into the `Condition`/`Rule`/`Policy` AST from Issue 141, with structured syntax-error reporting (line/column, expected-token messages).
**Objective:** Turn human-authored policy text into the evaluable domain model.
**Acceptance Criteria:** All grammar examples from Issue 142 parse to the expected AST; malformed input produces a `PolicyParseError` with position information, not a raw exception; parser has no evaluation logic (parsing and evaluation stay separate).
**Dependencies:** 141, 142
**Estimated Complexity:** L
**Files Affected:** `packages/authorization/domain/dsl/lexer.ts`, `domain/dsl/parser.ts`, `domain/dsl/errors.ts`
**Tests Required:** Unit tests: valid-grammar corpus parses correctly; malformed-input corpus produces accurate error positions; precedence/associativity edge cases.
**Documentation Required:** `docs/security/policy-dsl-grammar.md` cross-reference to parser test corpus.
**Educational Notes:** Recursive-descent parsing is chosen over a parser-generator dependency for the same "beginner-friendly, close to plain functions" reason Fastify was chosen over NestJS (per `ARCHITECTURE.md` §7) — contributors can read the parser as ordinary TypeScript.
**Deliverables:** Tested lexer/parser producing policy ASTs from DSL text.

---

### Issue 144 — Attribute model: subject, resource, environment, action
**Description:** `AttributeContext` value object bundling four attribute bags — `subject` (the acting principal's attributes), `resource` (the target's attributes), `action` (the operation being attempted), and `environment` (time, IP, request metadata) — each a typed key/value map.
**Objective:** Give the evaluation engine a single, well-defined shape for "everything a policy might condition on," independent of where each attribute is sourced from.
**Acceptance Criteria:** `AttributeContext` supports typed lookups (`string`/`number`/`boolean`/`date`/`array`) with a defined behavior for missing attributes (returns `undefined`, does not throw); unit tests cover all four bags.
**Dependencies:** 141
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/domain/value-objects/attribute-context.ts`
**Tests Required:** Unit tests for typed lookup and missing-attribute handling.
**Documentation Required:** `docs/security/policy-dsl-grammar.md` attribute reference section.
**Educational Notes:** The four-category attribute split (subject/resource/action/environment) is the same categorization used by NIST's ABAC guidelines (SP 800-162) — using the standard vocabulary makes Verixa's engine legible to anyone who already knows ABAC theory.
**Deliverables:** Tested `AttributeContext` model.

---

### Issue 145 — `AttributeProvider` port & resolution pipeline
**Description:** `AttributeProvider` port (`resolve(subjectId, resourceRef, action): Promise<AttributeContext>`) plus a pipeline that merges attributes from multiple sources — request-supplied claims, Identity context user records, and resource-specific lookups (Issue 151) — into one `AttributeContext`.
**Objective:** Decouple "what attributes exist" from "where they come from," so new attribute sources can be added without touching the evaluation engine.
**Acceptance Criteria:** Pipeline resolves providers in a defined order with later providers able to override earlier ones; a provider failure is isolated (documented fail-open vs. fail-closed choice per provider) and doesn't crash the whole resolution.
**Dependencies:** 144
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/application/ports/attribute-provider.ts`, `application/services/attribute-resolution-pipeline.ts`
**Tests Required:** Unit tests for multi-provider merge order and provider-failure isolation.
**Documentation Required:** `docs/security/policy-dsl-grammar.md` attribute-sourcing section.
**Educational Notes:** This is the Strategy/Chain-of-Responsibility pattern applied to attribute sourcing — the same decoupling reason the sessions context used a `TokenSigner` port (Issue 084) instead of hardcoding JWT calls directly into use cases.
**Deliverables:** Tested attribute resolution pipeline.

---

### Issue 146 — `PolicyEvaluationEngine` core
**Description:** Pure function `evaluate(rule: Rule, context: AttributeContext): boolean` that walks a `Condition` tree against an `AttributeContext`, short-circuiting `AND`/`OR` evaluation.
**Objective:** Provide the deterministic core evaluator that every higher-level decision (Issue 148, 153) builds on, kept side-effect-free for easy testing.
**Acceptance Criteria:** Short-circuit evaluation verified (a false `AND` branch doesn't evaluate the remainder); evaluating against missing attributes resolves to `false` rather than throwing; 100% branch coverage on the evaluator.
**Dependencies:** 141, 144
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/domain/services/policy-evaluation-engine.ts`
**Tests Required:** Unit tests for short-circuiting, missing-attribute handling, and deep-nesting correctness.
**Documentation Required:** `docs/security/policy-dsl-grammar.md` evaluation-semantics section.
**Educational Notes:** Keeping the evaluator a pure function (no I/O, no repository calls) is what makes exhaustive branch-coverage testing tractable — impure evaluators are the usual reason policy engines end up under-tested in practice.
**Deliverables:** Tested pure evaluation engine.

---

### Issue 147 — Condition operator library
**Description:** Implement the DSL's comparison and set operators (`==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `contains`, `matches` for regex, and time-window helpers like `between(env.now, resource.availableFrom, resource.availableUntil)`), each as a typed, independently testable function used by the evaluator.
**Objective:** Give policy authors enough expressive power for real-world conditions (ownership, membership, time-boxing) without growing the DSL grammar itself.
**Acceptance Criteria:** Each operator has defined type-mismatch behavior (documented, not implicit coercion); time-based operators are injectable-clock-aware (reuse Issue 006's clock port) for deterministic testing.
**Dependencies:** 006, 143, 146
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/domain/dsl/operators.ts`
**Tests Required:** Unit tests per operator, including type-mismatch and boundary cases.
**Documentation Required:** `docs/security/policy-dsl-grammar.md` operator reference.
**Educational Notes:** Explicit type-mismatch rules (reject vs. coerce) prevent the class of bug where `"5" == 5` silently evaluates true or false depending on runtime quirks — a common source of authorization logic errors in loosely-typed policy engines.
**Deliverables:** Tested operator library wired into the evaluator.

---

### Issue 148 — Combining algorithms (deny-overrides, permit-overrides, first-applicable)
**Description:** `PolicyCombiningAlgorithm` strategies that reduce a set of per-rule `PERMIT`/`DENY`/`NOT_APPLICABLE` results into one final decision: `deny-overrides` (any deny wins), `permit-overrides` (any permit wins), and `first-applicable` (first matching rule wins).
**Objective:** Resolve the common case of multiple policies/rules applying to the same request with contradictory effects, using a named, well-understood strategy rather than ad hoc precedence.
**Acceptance Criteria:** Each algorithm implemented and unit-tested against conflicting-rule fixtures; default algorithm for the system is documented and justified (deny-overrides, favoring safety).
**Dependencies:** 146
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/domain/services/combining-algorithms.ts`
**Tests Required:** Unit tests per algorithm against conflict fixtures (permit+deny, permit+permit, all not-applicable).
**Documentation Required:** `docs/security/policy-dsl-grammar.md` combining-algorithm section.
**Educational Notes:** These three algorithms are lifted directly from the XACML standard's combining-algorithm vocabulary — reusing established names avoids reinventing conflict-resolution semantics and lets contributors bring prior knowledge.
**Deliverables:** Tested combining-algorithm strategies.

---

### Issue 149 — `PolicyRepository` port & in-memory fake
**Description:** `PolicyRepository` port (`save`, `findById`, `findApplicableTo(resourceType, action)`, `listVersionsFor(policyId)`) plus an in-memory fake following the Issue 031 contract-test pattern.
**Objective:** Let policy-dependent use cases (Issue 153) be written and tested before persistence exists.
**Acceptance Criteria:** Fake passes the shared contract test suite; port has no framework/Prisma types.
**Dependencies:** 031, 141
**Estimated Complexity:** S
**Files Affected:** `packages/authorization/application/ports/policy-repository.ts`, `infrastructure/fakes/in-memory-policy-repository.ts`
**Tests Required:** Contract tests against the fake.
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Reuse of the port/fake/contract-test pattern established in Issue 031, now applied to a policy store rather than a simple CRUD repository.
**Deliverables:** Tested port + fake.

---

### Issue 150 — `policies` table, versioning, & `PrismaPolicyRepository`
**Description:** Prisma model for policies (id, name, target selector, serialized rule tree, version, status: `draft`/`published`/`archived`) and a `PrismaPolicyRepository` implementing Issue 149's port, storing DSL source alongside the parsed AST for auditability.
**Objective:** Persist policies durably with a version history so changes are auditable and rollback-able, using the Issue 056 error-mapping pattern.
**Acceptance Criteria:** Publishing a new version never mutates a prior published version's row (append-only history); contract tests pass against real Postgres (Issue 047 Testcontainers harness).
**Dependencies:** 046, 047, 052, 056, 149
**Estimated Complexity:** M
**Files Affected:** `prisma/schema.prisma`, `packages/authorization/infrastructure/persistence/prisma-policy-repository.ts`
**Tests Required:** Contract tests against real Postgres, including version-history integrity.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Storing both DSL source and parsed AST trades storage for auditability and debuggability — an admin reviewing "why was this request denied" needs the readable source, not just the tree the engine executed.
**Deliverables:** Tested Prisma-backed policy persistence with version history.

---

### Issue 151 — Resource-attribute resolvers (dynamic per-resource lookups)
**Description:** `ResourceAttributeResolver` registry mapping resource types (e.g. `document`, `verificationCase`) to functions that fetch the specific attributes a policy might reference (owner, org, sensitivity label, status) from that resource's own bounded context.
**Objective:** Let ABAC policies condition on resource state (e.g. `resource.ownerId == subject.id`) without the authorization package depending directly on every other context's schema.
**Acceptance Criteria:** Registering a resolver for a new resource type requires no change to the evaluation engine; unresolved resource types produce a clear `UnknownResourceTypeError` rather than a silent `undefined`.
**Dependencies:** 145
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/application/services/resource-attribute-resolver-registry.ts`, `application/ports/resource-attribute-resolver.ts`
**Tests Required:** Unit tests for registration, lookup, and unknown-type error handling.
**Documentation Required:** `docs/security/policy-dsl-grammar.md` resource-attribute section.
**Educational Notes:** This registry is the seam that keeps `packages/authorization` decoupled from `packages/verification`, `packages/governance`, etc. per the dependency rules in `ARCHITECTURE.md` §4 — other contexts register resolvers with authorization, authorization never imports their internals.
**Deliverables:** Tested resource-attribute resolver registry.

---

### Issue 152 — RBAC+ABAC composition: `AuthorizationService`
**Description:** `AuthorizationService.authorize(subject, action, resource)` that first checks Phase 07's role/permission grant (Issues 121–140) and, if the RBAC layer neither definitively grants nor definitively denies, falls through to ABAC policy evaluation (Issue 148's combined decision) — with a documented, configurable precedence order.
**Objective:** Let coarse-grained role checks handle the common case cheaply while ABAC policies refine or override decisions for attribute-sensitive resources, rather than forcing every authorization check through the more expensive policy engine.
**Acceptance Criteria:** RBAC-only decisions (no applicable policy) work unchanged from Phase 07 behavior; an applicable `DENY` policy overrides an RBAC grant; precedence order is documented and covered by tests for all four grant/deny combinations (RBAC×ABAC).
**Dependencies:** 121–140, 146, 148
**Estimated Complexity:** L
**Files Affected:** `packages/authorization/application/services/authorization-service.ts`
**Tests Required:** Unit tests for all RBAC/ABAC combination cases; integration test exercising a real role plus a real policy together.
**Documentation Required:** `docs/security/authorization-model.md` (new) — RBAC/ABAC composition and precedence rules.
**Educational Notes:** This is the central architectural decision of Phase 08 — hybrid RBAC+ABAC systems (as used by AWS IAM and Google Zanzibar-adjacent designs) get their power from *this* composition layer, not from either model alone; getting precedence wrong here is the single highest-risk authorization bug class (silent over-grant).
**Deliverables:** Tested, documented RBAC+ABAC composition service.

---

### Issue 153 — Policy Decision Point: `authorize()` use case & API
**Description:** Application-layer use case wrapping `AuthorizationService` (Issue 152) as the single call site (`AuthorizeAction`) other contexts and route handlers invoke, returning a structured `AuthorizationDecision` (`granted`, `reason`, `matchedPolicyIds`, `evaluatedAt`).
**Objective:** Provide one canonical "can this subject do this action on this resource" entry point — the Policy Decision Point (PDP) in ABAC terminology — instead of scattered ad hoc checks.
**Acceptance Criteria:** Decision object always includes a human-readable `reason` sufficient for audit logging (Phase 10) without re-deriving it later; use case has no HTTP/Fastify dependency.
**Dependencies:** 151, 152
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/application/use-cases/authorize-action.ts`, `application/dto/authorization-decision.ts`
**Tests Required:** Unit tests for decision shape and reason population across grant/deny/policy-error paths.
**Documentation Required:** `docs/guides/use-cases.md` PDP section.
**Educational Notes:** Naming this a "Policy Decision Point" (vs. the "Policy Enforcement Points" that will call it from route handlers in Phase 12) borrows XACML's PDP/PEP separation — decision logic stays centralized and testable, enforcement stays thin and scattered where it belongs.
**Deliverables:** Tested `AuthorizeAction` use case producing structured decisions.

---

### Issue 154 — Policy caching & invalidation
**Description:** `PolicyCache` port with a Redis-backed implementation caching parsed policy ASTs (keyed by resource type/action) and, optionally, short-TTL decision caching for repeated identical `(subject, action, resource)` checks within a single request lifecycle.
**Objective:** Keep the ABAC evaluation path fast enough for per-request use despite parsing and attribute-resolution overhead.
**Acceptance Criteria:** Publishing a new policy version (Issue 150) invalidates the relevant cache entries immediately (no stale-policy window beyond a documented bound); cache unavailability degrades to direct evaluation rather than failing requests.
**Dependencies:** 150, 153
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/application/ports/policy-cache.ts`, `infrastructure/redis-policy-cache.ts`
**Tests Required:** Integration tests (Testcontainers Redis) for cache-hit correctness and invalidation-on-publish.
**Documentation Required:** `docs/security/authorization-model.md` caching section.
**Educational Notes:** Caching authorization decisions is higher-risk than caching ordinary reads — a stale `DENY→PERMIT` transition is a security bug, not just a UX glitch, which is why invalidation-on-publish is a hard requirement here rather than a "nice to have."
**Deliverables:** Tested policy/decision caching layer with correct invalidation.

---

### Issue 155 — Policy simulation / dry-run testing tool
**Description:** `SimulatePolicy` use case and CLI command that evaluates a draft or published policy against a set of author-supplied sample `AttributeContext` fixtures, reporting per-rule and per-combining-step results without requiring a real subject/resource/database.
**Objective:** Let policy authors verify a policy behaves as intended *before* publishing it, catching logic errors offline instead of in production traffic.
**Acceptance Criteria:** CLI accepts a policy (DSL text or stored id) plus a fixtures file and prints a pass/fail table per fixture with expected-vs-actual effect; exits non-zero on any mismatch (CI-usable).
**Dependencies:** 143, 146, 148
**Estimated Complexity:** M
**Files Affected:** `packages/authorization/application/use-cases/simulate-policy.ts`, `apps/cli/src/commands/policy-simulate.ts`
**Tests Required:** Unit tests for simulation output correctness; snapshot tests for CLI table formatting.
**Documentation Required:** `docs/guides/tools/policy-simulation.md`
**Educational Notes:** Treating policies as testable artifacts (fixtures + expected outcomes, runnable in CI) applies ordinary software-testing discipline to what many systems leave as untested, hand-reviewed configuration — a major source of real-world authorization incidents.
**Deliverables:** Tested policy simulation tool (use case + CLI).

---

### Issue 156 — Policy conflict & shadowing linter
**Description:** Static-analysis tool that inspects a policy set for two classes of issues: direct conflicts (a `PERMIT` and `DENY` rule with logically overlapping conditions under `first-applicable`) and shadowing (a broad early rule that makes a later, more specific rule unreachable).
**Objective:** Catch authorization logic bugs — unreachable rules, contradictory intent — at authoring time rather than via a security incident.
**Acceptance Criteria:** Linter flags at least the two documented conflict classes against a fixture policy set with known issues; false-positive rate on a "known-good" fixture set is documented (perfect precision isn't required, but the tradeoff must be explicit).
**Dependencies:** 148, 150
**Estimated Complexity:** L
**Files Affected:** `packages/authorization/application/services/policy-linter.ts`, `apps/cli/src/commands/policy-lint.ts`
**Tests Required:** Unit tests against known-conflict and known-good fixture policy sets.
**Documentation Required:** `docs/guides/tools/policy-linting.md`
**Educational Notes:** Rule shadowing/conflict detection is a simplified form of the reachability analysis static-analysis tools perform on code — same underlying idea (some branches can never execute) applied to policy rule trees instead of program control flow.
**Deliverables:** Tested policy linter (library + CLI command).

---

### Issue 157 — Composition-root wiring for ABAC additions
**Description:** Register the policy repository, attribute providers, resource-attribute resolvers, caching adapter, and `AuthorizeAction`/`SimulatePolicy` use cases in `apps/api/src/composition-root.ts`, extending Phase 07's authorization wiring rather than replacing it.
**Objective:** Make the full RBAC+ABAC authorization stack consumable ahead of Phase 12's route wiring.
**Acceptance Criteria:** Composition root resolves all Phase 08 use cases with real (non-fake) adapters in a local/dev boot smoke test; Phase 07's existing RBAC wiring is unaffected.
**Dependencies:** 121–140, 150, 153, 154
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/composition-root.ts`
**Tests Required:** Boot smoke test asserting successful resolution.
**Documentation Required:** `docs/guides/composition-root.md` update.
**Educational Notes:** Composition-root wiring as a repeated checkpoint per context, now demonstrating incremental extension of an already-wired context (RBAC) rather than wiring one from scratch.
**Deliverables:** ABAC additions wired into the composition root.

---

### Issue 158 — `packages/authorization` ABAC coverage gate
**Description:** Extend the Issue 037/076/097 coverage-gate pattern to cover the new DSL, evaluation engine, and policy-management code added in this phase.
**Objective:** Hold policy evaluation logic — a direct security-decision path — to the same enforced coverage bar as prior contexts.
**Acceptance Criteria:** CI coverage gate active and passing for the ABAC-specific modules within `packages/authorization`.
**Dependencies:** 141–157
**Estimated Complexity:** XS
**Files Affected:** `packages/authorization/vitest.config.ts`
**Tests Required:** N/A (meta-check).
**Documentation Required:** None beyond existing testing guide.
**Educational Notes:** Repetition of the coverage-gate convention, now on the ABAC evaluation path specifically.
**Deliverables:** Enforced coverage gate.

---

### Issue 159 — Threat model: policy engine & ABAC evaluation
**Description:** STRIDE-based threat model covering policy-authoring risks (malicious/erroneous DSL producing over-broad grants), evaluation-path risks (fail-open on attribute-resolution failure, cache poisoning/staleness from Issue 154, RBAC/ABAC precedence bugs from Issue 152), cross-referencing which issues mitigate each threat.
**Objective:** Document the security reasoning behind Phase 08 as a coherent whole, feeding into Phase 11's hardening review.
**Acceptance Criteria:** Threat model covers all STRIDE categories relevant to policy evaluation; each identified threat maps to a mitigating issue or an accepted-risk note; explicitly addresses fail-open vs. fail-closed behavior for every external dependency (attribute providers, cache, repository).
**Dependencies:** 141–158
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-abac.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Policy-engine threat modeling has a distinct failure mode from prior phases: the "vulnerability" is often *correct code implementing an incorrect policy*, not a code bug — a distinction worth calling out explicitly since it changes what testing (Issue 155) versus review (Issue 156) can each catch.
**Deliverables:** Published threat model.

---

### Issue 160 — ABAC & RBAC+ABAC composition educational walkthrough
**Description:** Write `docs/guides/tutorials/build-policy-engine.md`, a from-scratch narrative covering ABAC concepts (PDP/PEP, attribute categories, combining algorithms), the DSL/parser/evaluator design, and how it composes with Phase 07's RBAC, using Phase 08 code as the worked example.
**Objective:** Deliver the flagship "how attribute-based authorization actually works" educational artifact, showing why hybrid RBAC+ABAC beats either model alone for real systems.
**Acceptance Criteria:** Walkthrough covers the DSL grammar, evaluation semantics, combining algorithms, RBAC/ABAC precedence, and the simulation/linting tools, linking every claim to real code/tests in the repo.
**Dependencies:** 121–140, 141–159
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-policy-engine.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.

---
