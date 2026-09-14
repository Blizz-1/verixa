# Phase 17 — Developer Tooling & SDKs (Issues 321–340)

Delivers a typed TypeScript SDK, an admin/local-dev CLI, seed/fixture tooling, OpenAPI/Postman
export, and a plugin/extension architecture so Verixa is consumable and extensible beyond its
own HTTP surface.

---

### Issue 321 — SDK package scaffold & HTTP client core
**Description:** Create `packages/sdk` with a framework-agnostic `VerixaClient` core: base URL/config, `fetch`-based transport wrapper, request/response interceptor hooks, and a build pipeline emitting both ESM and CJS output.
**Objective:** Establish the foundation every typed resource client (Issue 323) and the CLI (Issue 329) will build on, without committing to a single HTTP library.
**Acceptance Criteria:** `new VerixaClient({ baseUrl, ... })` constructs successfully; a request round-trips through configurable interceptors; package builds to both module formats and is importable from a plain Node script and a bundler-based frontend.
**Dependencies:** None
**Estimated Complexity:** M
**Files Affected:** `packages/sdk/src/client.ts`, `packages/sdk/src/transport.ts`, `packages/sdk/tsup.config.ts`, `packages/sdk/package.json`
**Tests Required:** Unit tests for interceptor ordering and transport error propagation; a build smoke test asserting both output formats load.
**Documentation Required:** `docs/guides/sdk-quickstart.md`
**Educational Notes:** Why a thin, dependency-light transport layer (native `fetch`, no axios) keeps the SDK usable in browsers, edge runtimes, and Node alike — coupling to a runtime-specific HTTP client is a common SDK design mistake.
**Deliverables:** Buildable, dual-format SDK core package.

---

### Issue 322 — SDK auth module: login, refresh, token storage
**Description:** `client.auth` module wrapping Phase 04/05 login and refresh-token endpoints, with a pluggable `TokenStore` interface (in-memory default, injectable for browser localStorage/secure-storage use).
**Objective:** Let SDK consumers authenticate and maintain sessions without hand-rolling token lifecycle logic against the raw REST API.
**Acceptance Criteria:** `client.auth.login()` stores tokens via the configured `TokenStore`; expired access tokens trigger an automatic refresh-and-retry on the next request; refresh failure surfaces a typed `SessionExpiredError`.
**Dependencies:** 321, and Phase 04/05's login/refresh endpoints
**Estimated Complexity:** M
**Files Affected:** `packages/sdk/src/auth/auth-module.ts`, `packages/sdk/src/auth/token-store.ts`
**Tests Required:** Unit tests for login, automatic refresh-on-401, refresh-failure handling, and custom `TokenStore` injection.
**Documentation Required:** `docs/guides/sdk-quickstart.md` auth section.
**Educational Notes:** Silent-refresh-and-retry as a standard SDK ergonomics pattern — hiding token-lifecycle plumbing from consumers while keeping the underlying flow auditable and testable.
**Deliverables:** Tested auth module with pluggable token storage.

---

### Issue 323 — Typed resource clients for all bounded contexts
**Description:** Generate/hand-write typed resource clients (`client.identity`, `client.sessions`, `client.authorization`, `client.verification`, `client.audit`, `client.governance`, `client.notifications`) mirroring each context's public REST surface, sharing the transport and auth modules from Issues 321–322.
**Objective:** Give SDK consumers a fully typed, discoverable API surface instead of raw string-URL REST calls.
**Acceptance Criteria:** Every public endpoint from Phases 01–14 has a corresponding typed method with request/response types matching the API's Zod schemas; unexported/internal endpoints are not reachable via the SDK.
**Dependencies:** 322, and each context's interface layer (Phases 03–14)
**Estimated Complexity:** L
**Files Affected:** `packages/sdk/src/resources/*.ts`
**Tests Required:** Contract tests running each resource method against a running `apps/api` test instance (Supertest-backed), asserting response shapes match declared types.
**Documentation Required:** `docs/guides/sdk-quickstart.md` resource reference; per-resource JSDoc.
**Educational Notes:** Why an SDK's type surface should be derived from (or contract-tested against) the same schemas the server validates with — divergence between client types and server reality is the most common SDK bug source.
**Deliverables:** Full typed resource client set.

---

### Issue 324 — SDK typed error handling & retry policy
**Description:** `VerixaApiError` hierarchy (subclasses per HTTP status family: `ValidationError`, `AuthError`, `RateLimitError`, `ServerError`) parsed from Phase 04's problem-details error envelope, plus a configurable retry policy (exponential backoff, honoring Phase 15's `Retry-After` header) for idempotent requests.
**Objective:** Let consumers handle failures programmatically by error type rather than parsing status codes/messages themselves, and avoid retry storms against a rate-limited API.
**Acceptance Criteria:** Each server error family maps to a distinct SDK error class; `RateLimitError` retries respect `Retry-After`; non-idempotent requests (POST without an idempotency key) are never auto-retried.
**Dependencies:** 321, 288 (rate-limit headers)
**Estimated Complexity:** M
**Files Affected:** `packages/sdk/src/errors.ts`, `packages/sdk/src/retry-policy.ts`
**Tests Required:** Unit tests for error-class mapping per status code, retry/backoff timing, and non-idempotent-request retry suppression.
**Documentation Required:** `docs/guides/sdk-quickstart.md` error-handling section.
**Educational Notes:** Why blind retries on non-idempotent operations (e.g. "create user") can cause duplicate side effects — retry policy must be method-aware, not purely status-aware.
**Deliverables:** Tested typed-error and retry system.

---

### Issue 325 — SDK pagination & filtering helpers
**Description:** `AsyncIterableIterator`-based pagination helper (`for await (const user of client.identity.listUsers())`) wrapping cursor-based list endpoints, plus typed filter/sort builder helpers shared across resources.
**Objective:** Remove boilerplate manual cursor-following from every consumer that needs to walk a large result set.
**Acceptance Criteria:** Iterating a paginated resource yields all pages transparently, fetching lazily; early `break` stops further fetching; filter builders produce query params matching each endpoint's documented filter schema.
**Dependencies:** 323
**Estimated Complexity:** S
**Files Affected:** `packages/sdk/src/pagination.ts`, `packages/sdk/src/resources/*.ts`
**Tests Required:** Unit tests for lazy fetching, early termination, and empty-result-set iteration.
**Documentation Required:** `docs/guides/sdk-quickstart.md` pagination section.
**Educational Notes:** Async iterators as the idiomatic TypeScript pattern for lazily-paginated APIs — avoids loading entire result sets into memory upfront.
**Deliverables:** Tested pagination/filtering helpers.

---

### Issue 326 — SDK webhook signature verification helper
**Description:** `verixa.webhooks.verify(payload, signature, secret)` helper implementing HMAC signature verification matching Phase 09's notification webhook signing scheme, with timing-safe comparison.
**Objective:** Let consumers building webhook receivers verify authenticity without re-implementing HMAC/timing-safe-compare logic themselves.
**Acceptance Criteria:** Valid signatures verify true; tampered payloads and wrong secrets verify false; comparison is constant-time (reuses Phase 02's timing-safe utility pattern).
**Dependencies:** 321, and Phase 09's webhook signing implementation
**Estimated Complexity:** S
**Files Affected:** `packages/sdk/src/webhooks/verify.ts`
**Tests Required:** Unit tests for valid/invalid/tampered signatures; timing-characteristics sanity check.
**Documentation Required:** `docs/guides/sdk-quickstart.md` webhooks section.
**Educational Notes:** Reiterates the timing-safe-comparison principle (Issue-referenced pattern) at the SDK boundary — the same class of vulnerability applies to consumers verifying inbound webhooks, not just the server.
**Deliverables:** Tested webhook verification helper.

---

### Issue 327 — OpenAPI-driven type generation pipeline
**Description:** Codegen script consuming Phase 17's generated OpenAPI document (Issue 335) to produce request/response TypeScript types under `packages/sdk/src/generated/`, run in CI to detect drift between hand-written resource clients and the live API contract.
**Objective:** Keep SDK types honest against the actual API surface automatically, rather than relying on manual updates staying in sync.
**Acceptance Criteria:** Codegen runs against a live OpenAPI doc and produces compiling types; CI fails if generated types differ from committed output (drift check); generation is deterministic (stable output ordering).
**Dependencies:** 323, 335
**Estimated Complexity:** M
**Files Affected:** `packages/sdk/scripts/generate-types.ts`, `packages/sdk/src/generated/`, `.github/workflows/sdk-typegen-check.yml`
**Tests Required:** Snapshot test on generated output for a fixed OpenAPI fixture; CI drift-check test.
**Documentation Required:** `docs/guides/sdk-quickstart.md` codegen section.
**Educational Notes:** Contract-first codegen as a structural defense against client/server type drift — the CI check turns an easy-to-forget manual sync into an automatically enforced invariant.
**Deliverables:** Working, drift-checked codegen pipeline.

---

### Issue 328 — SDK package publishing pipeline
**Description:** GitHub Actions workflow publishing `packages/sdk` to npm on tagged releases, following Semantic Versioning and Conventional Commits (per `ARCHITECTURE.md` §3) with automated changelog generation.
**Objective:** Make the SDK consumable by external projects via `npm install`, not just the monorepo's own workspace linking.
**Acceptance Criteria:** Tagging a release publishes the correct version to npm with provenance; changelog auto-generated from conventional commit history; publish step blocked if tests/coverage gate fail.
**Dependencies:** 321–327
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/publish-sdk.yml`, `packages/sdk/CHANGELOG.md`
**Tests Required:** Dry-run publish verification in CI (no actual publish) on PRs.
**Documentation Required:** `docs/guides/sdk-quickstart.md` versioning/release section.
**Educational Notes:** Why release automation gated on CI status (tests + coverage) prevents "oops, published a broken version" — a common failure mode of manual `npm publish`.
**Deliverables:** Automated, gated SDK publishing pipeline.

---

### Issue 329 — CLI scaffold, auth, and configuration
**Description:** Create `apps/cli` (`verixa` command) using a command-framework (oclif or commander), wired to `packages/sdk`, with `verixa login`, `verixa logout`, and a layered config file (`~/.verixarc`) plus environment-variable overrides for target API URL and credentials.
**Objective:** Give operators and contributors a first-class terminal interface to the platform, reusing the SDK rather than duplicating HTTP logic.
**Acceptance Criteria:** `verixa login` authenticates via the SDK's auth module and persists a token securely; `verixa --help` lists all registered commands with descriptions; config resolution order (flag > env > config file > default) is documented and tested.
**Dependencies:** 322
**Estimated Complexity:** M
**Files Affected:** `apps/cli/src/index.ts`, `apps/cli/src/commands/login.ts`, `apps/cli/src/config.ts`, `apps/cli/package.json`
**Tests Required:** Unit tests for config resolution precedence; integration test for login command against a test API instance.
**Documentation Required:** `docs/guides/cli-reference.md`
**Educational Notes:** CLI-as-SDK-consumer as a design discipline — building the CLI on the public SDK (rather than internal use cases directly) ensures the SDK itself is dogfooded and battle-tested.
**Deliverables:** Working CLI scaffold with authenticated sessions.

---

### Issue 330 — CLI admin commands: users, roles, orgs
**Description:** `verixa users list|create|disable`, `verixa roles list|assign|revoke`, and `verixa orgs list|create` commands wrapping Phase 03/07/08's identity, authorization, and governance SDK resources, with table and JSON output modes.
**Objective:** Let operators perform routine admin tasks from the terminal without a full admin UI, and let scripts consume JSON output for automation.
**Acceptance Criteria:** Each command performs its corresponding SDK call and renders results in the requested format; destructive commands (`disable`, `revoke`) require an explicit `--confirm` flag or interactive prompt; all commands respect the authenticated user's actual permissions (no client-side privilege bypass).
**Dependencies:** 323, 329
**Estimated Complexity:** M
**Files Affected:** `apps/cli/src/commands/users/*.ts`, `apps/cli/src/commands/roles/*.ts`, `apps/cli/src/commands/orgs/*.ts`, `apps/cli/src/output.ts`
**Tests Required:** Integration tests for each command against a seeded test API instance, including permission-denied paths.
**Documentation Required:** `docs/guides/cli-reference.md` admin-commands section.
**Educational Notes:** Client-side confirmation flags are UX guardrails, not security controls — the server-side authorization check (Phase 07) remains the actual enforcement point, illustrated concretely here.
**Deliverables:** Tested admin command set.

---

### Issue 331 — CLI local-dev commands: db, seed, reset
**Description:** `verixa dev db:migrate`, `verixa dev db:reset`, and `verixa dev seed [--profile=<name>]` commands wrapping Prisma migration commands and the seed framework (Issue 333), gated to refuse execution against a production-looking `DATABASE_URL`.
**Objective:** Give contributors a single, safe entry point for the local dev database lifecycle instead of remembering raw `prisma` invocations.
**Acceptance Criteria:** Commands correctly proxy to Prisma/seed scripts; a production-safety check blocks `db:reset`/`seed` when the target URL doesn't match a recognized local/dev pattern, requiring an explicit override flag.
**Dependencies:** 329, 333
**Estimated Complexity:** S
**Files Affected:** `apps/cli/src/commands/dev/db.ts`, `apps/cli/src/commands/dev/seed.ts`, `apps/cli/src/guards/production-guard.ts`
**Tests Required:** Unit tests for the production-URL guard heuristic; integration test running migrate+seed against a Testcontainers Postgres instance.
**Documentation Required:** `docs/guides/cli-reference.md` dev-commands section; updated `CONTRIBUTING.md` local-setup steps.
**Educational Notes:** Guardrails against destructive commands running against the wrong environment — a cheap heuristic check that prevents a class of real-world incidents ("ran db:reset against prod by mistake").
**Deliverables:** Tested, guarded local-dev CLI commands.

---

### Issue 332 — CLI audit log query command
**Description:** `verixa audit query --actor= --event-type= --from= --to=` wrapping Phase 10's audit query API, streaming results to stdout (table/JSON/NDJSON) with pagination handled transparently via Issue 325's SDK helper.
**Objective:** Give operators and incident responders a fast terminal path to the audit trail without needing the admin UI.
**Acceptance Criteria:** Filters map correctly to the underlying audit query API; large result sets stream rather than buffering entirely in memory; NDJSON output is pipeable to standard Unix tooling (`jq`, `grep`).
**Dependencies:** 323, 325, 329, and Phase 10's audit query API
**Estimated Complexity:** S
**Files Affected:** `apps/cli/src/commands/audit/query.ts`
**Tests Required:** Integration tests for filter combinations and streaming output correctness on large result sets.
**Documentation Required:** `docs/guides/cli-reference.md` audit section.
**Educational Notes:** Streaming output design for CLI tools — buffering an unbounded audit query result set in memory doesn't scale; incremental output does.
**Deliverables:** Tested audit query command.

---

### Issue 333 — Seed script framework
**Description:** `packages/dev-tooling/seed` framework defining composable, idempotent seed modules (per bounded context) run in dependency order, with named profiles (`minimal`, `demo`, `load-test`) selecting which modules run.
**Objective:** Give contributors and CI a repeatable way to populate a local database with realistic data, without ad hoc one-off scripts scattered across the repo.
**Acceptance Criteria:** Running a seed profile twice is idempotent (no duplicate-key errors, no data drift); each context contributes its own seed module implementing a shared `SeedModule` interface; module run order respects declared dependencies (e.g. orgs before users before role assignments).
**Dependencies:** None (consumes each context's Prisma models as they land)
**Estimated Complexity:** M
**Files Affected:** `packages/dev-tooling/seed/framework.ts`, `packages/dev-tooling/seed/modules/*.ts`, `packages/dev-tooling/seed/profiles.ts`
**Tests Required:** Integration tests running each profile twice against Testcontainers Postgres, asserting idempotency; unit tests for dependency-order resolution.
**Documentation Required:** `docs/guides/local-dev.md` seeding section.
**Educational Notes:** Idempotent seeding as a specific instance of idempotent operation design (same principle underlying safe API retries) — running setup scripts repeatedly without side effects is what makes a dev environment reliably reproducible.
**Deliverables:** Tested, idempotent seed framework with multiple profiles.

---

### Issue 334 — Test fixture factories
**Description:** `packages/dev-tooling/fixtures` providing typed builder functions (`buildUser()`, `buildOrganization()`, `buildVerificationCase()`, etc., following the Object Mother/test-data-builder pattern) with sensible defaults and override support, for use across unit and integration tests repo-wide.
**Objective:** Reduce test-setup duplication and brittleness by centralizing "what does a valid User look like" in one place instead of copy-pasted literal objects across hundreds of test files.
**Acceptance Criteria:** Each builder produces a domain-valid entity satisfying its context's invariants by default; overrides compose without breaking validity; builders are used by at least one existing test suite per context as a migration example.
**Dependencies:** Each context's domain entities (Phases 03–14)
**Estimated Complexity:** M
**Files Affected:** `packages/dev-tooling/fixtures/builders/*.ts`, `packages/dev-tooling/fixtures/index.ts`
**Tests Required:** Unit tests asserting default-built entities pass their own domain validation; override-composition tests.
**Documentation Required:** `docs/guides/testing.md` fixture-builders section.
**Educational Notes:** The test-data-builder pattern's payoff — when an entity gains a new required field, one builder update fixes every test using it, instead of hunting down scattered literals.
**Deliverables:** Reusable, tested fixture-builder library.

---

### Issue 335 — OpenAPI specification generation
**Description:** Generate a complete OpenAPI 3.1 document from Fastify's Zod-derived route schemas (per `ARCHITECTURE.md` §3's "generated API docs" goal) across all bounded contexts, served at `/openapi.json` and written to `docs/api/openapi.json` in CI.
**Objective:** Produce a single source of truth for the API contract, feeding both external documentation and Issue 327's SDK codegen and Issue 336's Postman export.
**Acceptance Criteria:** Generated document validates against the OpenAPI 3.1 schema; every registered route appears with correct request/response schemas and auth requirements; CI fails if the committed doc drifts from what the running app generates.
**Dependencies:** Route schemas across Phases 03–14
**Estimated Complexity:** M
**Files Affected:** `apps/api/plugins/openapi.ts`, `docs/api/openapi.json`, `.github/workflows/openapi-check.yml`
**Tests Required:** Schema-validity test on generated output; CI drift check.
**Documentation Required:** `docs/api/README.md` explaining generation and consumption.
**Educational Notes:** Deriving API docs from the same Zod schemas used for runtime validation (rather than hand-written OpenAPI YAML) eliminates an entire class of "docs don't match reality" bugs — the schema is defined once.
**Deliverables:** Auto-generated, drift-checked OpenAPI document.

---

### Issue 336 — Postman collection export
**Description:** Script converting the OpenAPI document (Issue 335) into a Postman collection with pre-configured auth (bearer token variable), environment templates (local/staging), and example requests per endpoint, published as a downloadable artifact from CI.
**Objective:** Let contributors and integrators explore and exercise the API interactively without writing code first.
**Acceptance Criteria:** Generated collection imports cleanly into Postman; auth variable substitution works against a locally running API; collection regenerates automatically whenever the OpenAPI doc changes.
**Dependencies:** 335
**Estimated Complexity:** S
**Files Affected:** `packages/dev-tooling/scripts/generate-postman-collection.ts`, `docs/api/verixa.postman_collection.json`
**Tests Required:** Script test asserting valid Postman collection JSON schema on a fixture OpenAPI doc.
**Documentation Required:** `docs/api/README.md` Postman section.
**Educational Notes:** Deriving the Postman collection from OpenAPI (rather than maintaining it by hand) applies the same single-source-of-truth principle as Issue 335 one layer up the tooling stack.
**Deliverables:** Auto-generated Postman collection artifact.

---

### Issue 337 — Plugin/extension point architecture
**Description:** Define a `PluginRegistry` and `VerixaPlugin` interface (lifecycle hooks: `onRegister`, `onRequest`, `onDomainEvent`) allowing external code to extend notification channels, authorization policy evaluation, and audit event handling without forking the core packages.
**Objective:** Give the "composable over monolithic" principle (`ARCHITECTURE.md` §2.6) a concrete extension mechanism for third parties, not just internal package boundaries.
**Acceptance Criteria:** A plugin registered at composition-root time can subscribe to domain events (via `shared-kernel`'s event emitter) and register a custom notification channel; a misbehaving plugin (throwing in a hook) cannot crash the host process — errors are caught and logged per-hook.
**Dependencies:** Shared-kernel event emitter, Phase 09's notification dispatch
**Estimated Complexity:** L
**Files Affected:** `packages/shared-kernel/plugins/plugin-registry.ts`, `packages/shared-kernel/plugins/plugin.ts`, `apps/api/composition/plugins.ts`
**Tests Required:** Unit tests for hook invocation ordering, isolation (one plugin's failure doesn't affect others), and registration/deregistration.
**Documentation Required:** `docs/guides/plugin-development.md`
**Educational Notes:** Fault isolation between host and extension code — the same "don't let one bad actor take down the process" principle used in browser extension and editor-plugin architectures, applied to a backend platform.
**Deliverables:** Tested plugin registry and extension-point contract.

---

### Issue 338 — Example plugin: custom notification channel
**Description:** Reference plugin implementation (`examples/plugins/slack-notification-channel`) using the Issue 337 extension point to add a Slack webhook notification channel alongside Phase 09's built-in email/SMS channels, without modifying `packages/notifications`.
**Objective:** Prove the plugin architecture works end-to-end with a realistic, non-trivial example, and give third-party developers a template to copy.
**Acceptance Criteria:** Plugin registers a new channel that receives the same domain events as built-in channels; disabling the plugin removes the channel with no core code changes; example is runnable against a local dev instance with a documented setup.
**Dependencies:** 337, Phase 09's notification dispatch
**Estimated Complexity:** S
**Files Affected:** `examples/plugins/slack-notification-channel/index.ts`, `examples/plugins/slack-notification-channel/README.md`
**Tests Required:** Integration test asserting the plugin's channel receives dispatched events in a test harness.
**Documentation Required:** The example's own `README.md`; linked from `docs/guides/plugin-development.md`.
**Educational Notes:** Reference implementations lower the barrier to extension far more effectively than API docs alone — a working example answers "how do I actually do this" questions a spec cannot.
**Deliverables:** Working, documented example plugin.

---

### Issue 339 — Developer tooling quickstart & onboarding guide
**Description:** `docs/guides/developer-tooling-quickstart.md` walking a new contributor through installing the CLI, authenticating, seeding a local database, exploring the API via the Postman collection, and making a first SDK call — tying together Issues 321–338 into one coherent path.
**Objective:** Turn Phase 17's individually-useful pieces into a single onboarding path, reducing the time from `git clone` to a working local environment.
**Acceptance Criteria:** Following the guide from a clean checkout produces a running local API, a seeded database, and a successful authenticated SDK/CLI call, verified by a new-contributor dry run.
**Dependencies:** 321–338
**Estimated Complexity:** S
**Files Affected:** `docs/guides/developer-tooling-quickstart.md`, `CONTRIBUTING.md` (cross-link)
**Tests Required:** None (documentation); optionally a scripted smoke test mirroring the guide's steps in CI.
**Documentation Required:** This issue's deliverable is the guide itself.
**Educational Notes:** Onboarding friction is a measurable cost — a single, tested, end-to-end quickstart path is what turns scattered tooling into an actually-adopted developer experience.
**Deliverables:** Published onboarding guide, dry-run verified.

---

### Issue 340 — SDK/CLI public API surface curation & closing tutorial
**Description:** Curate `packages/sdk/index.ts` and `apps/cli` command registration applying the Issue 038 boundary pattern (only intended surface exported/registered), and write `docs/guides/tutorials/building-on-verixa.md` walking through building a small external integration using the SDK, CLI, and a custom plugin together.
**Objective:** Close out Phase 17 with an encapsulated public surface and an educational artifact demonstrating the full developer-tooling stack working together.
**Acceptance Criteria:** Only intended SDK exports/CLI commands are public; deep-import lint rule extended to `packages/sdk`; tutorial builds a working mini-integration referencing real code and tests from Issues 321–339.
**Dependencies:** 038, 321–339
**Estimated Complexity:** M
**Files Affected:** `packages/sdk/index.ts`, `apps/cli/src/index.ts`, `.eslintrc.cjs`, `docs/guides/tutorials/building-on-verixa.md`
**Tests Required:** Lint rule verification for the SDK's public-surface boundary.
**Documentation Required:** This issue's deliverable is the tutorial itself.
**Educational Notes:** Closing the phase with an encapsulated public API mirrors the convention established in prior phases (e.g. Issue 300) — internals stay free to evolve as long as the curated surface holds.
**Deliverables:** Curated public SDK/CLI surface and published tutorial.

---
