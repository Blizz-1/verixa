# Phase 01 — Foundation & Tooling (Issues 001–020)

Establishes the monorepo, toolchain, and conventions every later issue depends on.

---

### Issue 001 — Initialize monorepo workspace & base tooling
**Description:** Create the pnpm-workspaces monorepo skeleton (`apps/`, `packages/`, `infra/`, `docs/`, `tests/`), root `package.json`, `pnpm-workspace.yaml`, base TypeScript config (`tsconfig.base.json`), and a placeholder `apps/api` package that boots an empty Fastify server.
**Objective:** Give every future issue a working, installable, buildable repo to add code to.
**Acceptance Criteria:**
- `pnpm install` succeeds from a clean clone.
- `pnpm --filter @verixa/api dev` starts a Fastify server on a configurable port and responds `200` on `/health`.
- `pnpm build` and `pnpm typecheck` succeed with zero errors.
- Root README documents prerequisites and the three commands above.
**Dependencies:** None.
**Estimated Complexity:** M
**Files Affected:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `apps/api/*`, `README.md`
**Tests Required:** Smoke test hitting `/health` via Supertest.
**Documentation Required:** README quickstart section; ADR-0001 recording the monorepo/pnpm/Fastify choice.
**Educational Notes:** Explains what a monorepo is, why workspaces exist, and how TypeScript project references keep builds fast as the repo grows.
**Deliverables:** Bootable repo, passing smoke test, ADR-0001.

---

### Issue 002 — Configure ESLint + Prettier across the workspace
**Description:** Add a shared ESLint config (TypeScript-aware, import-order, security plugin) and Prettier config, wired into every workspace package via a root config extended per-package.
**Objective:** Enforce a single consistent code style before any real code lands.
**Acceptance Criteria:** `pnpm lint` runs across all packages; a deliberately malformed file fails lint; `pnpm format` auto-fixes style issues.
**Dependencies:** 001
**Estimated Complexity:** S
**Files Affected:** `.eslintrc.cjs`, `.prettierrc`, `package.json` scripts
**Tests Required:** CI check that lint fails on a known-bad fixture file (removed after verification).
**Documentation Required:** `docs/guides/code-style.md`
**Educational Notes:** Why linting catches bugs, not just style — e.g. `no-floating-promises` for async bugs.
**Deliverables:** Working lint/format scripts and config.

---

### Issue 003 — Root TypeScript strict-mode configuration
**Description:** Configure `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess`, path aliases per package, and per-package `tsconfig.json` extending the base.
**Objective:** Maximize compile-time safety from the start rather than retrofitting strictness later.
**Acceptance Criteria:** All packages typecheck under strict mode; a deliberately unsafe null-access fails typecheck.
**Dependencies:** 001
**Estimated Complexity:** S
**Files Affected:** `tsconfig.base.json`, `packages/*/tsconfig.json`
**Tests Required:** None (compiler is the test); CI typecheck step.
**Documentation Required:** `docs/guides/typescript-conventions.md`
**Educational Notes:** Explains what each strict flag catches, with a before/after bug example.
**Deliverables:** Strict typecheck passing in CI.

---

### Issue 004 — Shared kernel package: Result/Either type
**Description:** Implement `packages/shared-kernel` with a `Result<T, E>` type (ok/err) used instead of throwing for expected domain failures.
**Objective:** Establish a consistent error-handling pattern used by every use case going forward.
**Acceptance Criteria:** `Result.ok`, `Result.err`, `map`, `flatMap`, `match` implemented and unit tested; documented usage example.
**Dependencies:** 003
**Estimated Complexity:** S
**Files Affected:** `packages/shared-kernel/domain/result.ts`
**Tests Required:** Unit tests covering ok/err propagation through map/flatMap.
**Documentation Required:** `docs/guides/error-handling.md`
**Educational Notes:** Contrasts exceptions vs. explicit result types; when to still throw (programmer errors) vs. return Result (expected failures).
**Deliverables:** Tested `Result` type used as the standard use-case return shape.

---

### Issue 005 — Shared kernel: typed identifiers (branded types)
**Description:** Implement branded ID types (`UserId`, `OrganizationId`, etc.) using a generic `Branded<T, Brand>` helper plus UUID generation utility.
**Objective:** Prevent accidentally passing the wrong kind of ID (e.g. a `RoleId` where a `UserId` is expected) — a class of bug the type system can eliminate entirely.
**Acceptance Criteria:** Branded ID helper implemented; passing a mismatched ID type fails typecheck (verified by a `// @ts-expect-error` test).
**Dependencies:** 004
**Estimated Complexity:** S
**Files Affected:** `packages/shared-kernel/domain/branded-id.ts`
**Tests Required:** Type-level test (`@ts-expect-error`) + runtime UUID generation test.
**Documentation Required:** Inline usage doc + `docs/guides/domain-modeling.md` section.
**Educational Notes:** Nominal vs. structural typing in TypeScript, and why "primitive obsession" is a real bug source.
**Deliverables:** Reusable branded-ID utility used by every future entity.

---

### Issue 006 — Domain error hierarchy
**Description:** Define a base `DomainError` class and per-context error subclasses (e.g. `ValidationError`, `NotFoundError`, `ConflictError`) with stable error codes.
**Objective:** Give every layer (API, tests, logs) a predictable, serializable error shape.
**Acceptance Criteria:** Error classes implemented with `code`, `message`, `httpStatusHint`; unit tests for construction and `instanceof` narrowing.
**Dependencies:** 004
**Estimated Complexity:** S
**Files Affected:** `packages/shared-kernel/domain/errors.ts`
**Tests Required:** Unit tests per error subclass.
**Documentation Required:** `docs/guides/error-handling.md` (extend from 004).
**Educational Notes:** Why error codes (not just messages) matter for client integrations and i18n.
**Deliverables:** Shared error hierarchy used across all contexts.

---

### Issue 007 — Typed configuration loader
**Description:** Implement `packages/config` that loads and validates environment variables with Zod at process startup, failing fast with a clear message on missing/invalid config.
**Objective:** Eliminate an entire class of "undefined env var at runtime" production bugs.
**Acceptance Criteria:** Missing required env var causes immediate startup failure with a readable error; valid config produces a typed, immutable config object.
**Dependencies:** 003
**Estimated Complexity:** S
**Files Affected:** `packages/config/*`, `.env.example`
**Tests Required:** Unit tests for valid/invalid env combinations.
**Documentation Required:** `docs/guides/configuration.md`
**Educational Notes:** Fail-fast principle; why validating config at the edge beats scattering `process.env` reads through the codebase.
**Deliverables:** Typed `loadConfig()` used by `apps/api`.

---

### Issue 008 — Structured logger setup (pino)
**Description:** Add a shared logging package wrapping pino with request-scoped child loggers and a redaction list for sensitive fields (passwords, tokens).
**Objective:** Establish consistent, safe, structured logs from day one instead of ad hoc `console.log`.
**Acceptance Criteria:** Logger emits structured JSON; a test confirms a field named `password` is redacted in output.
**Dependencies:** 007
**Estimated Complexity:** S
**Files Affected:** `packages/shared-kernel/infrastructure/logger.ts`
**Tests Required:** Redaction unit test; log-shape snapshot test.
**Documentation Required:** `docs/guides/logging.md`
**Educational Notes:** Why logging secrets is a top-10 real-world breach cause; structured vs. unstructured logging.
**Deliverables:** Shared logger used across `apps/api`.

---

### Issue 009 — Git hooks: pre-commit lint/format/typecheck
**Description:** Add Husky + lint-staged to run lint/format on staged files and a lightweight typecheck before commit.
**Objective:** Catch style/type issues before they reach CI, shortening feedback loop.
**Acceptance Criteria:** Committing a badly formatted file auto-fixes or blocks the commit with a clear message.
**Dependencies:** 002, 003
**Estimated Complexity:** S
**Files Affected:** `.husky/*`, `package.json`
**Tests Required:** Manual verification documented in PR description (hooks aren't unit-testable in the usual sense).
**Documentation Required:** `CONTRIBUTING.md` section on local hooks.
**Educational Notes:** Shift-left quality gates; tradeoffs of local hooks vs. CI-only enforcement.
**Deliverables:** Working pre-commit hook.

---

### Issue 010 — Conventional Commits enforcement
**Description:** Add commitlint with the Conventional Commits config, enforced via a Husky `commit-msg` hook and a CI check.
**Objective:** Enable automated changelog/version generation later (see Phase 19) and keep history readable.
**Acceptance Criteria:** A non-conventional commit message is rejected locally and in CI with a helpful error.
**Dependencies:** 009
**Estimated Complexity:** S
**Files Affected:** `commitlint.config.cjs`, `.husky/commit-msg`, CI workflow
**Tests Required:** CI job asserting a bad commit message fails the check on a throwaway branch (documented, not persisted).
**Documentation Required:** `CONTRIBUTING.md` commit message section.
**Educational Notes:** How Conventional Commits map to SemVer bumps (`fix:`→patch, `feat:`→minor, `!`→major).
**Deliverables:** Enforced commit convention.

---

### Issue 011 — CI skeleton: lint/typecheck/test workflow
**Description:** Add a GitHub Actions workflow running install, lint, typecheck, and unit tests on every push/PR, with pnpm caching.
**Objective:** Make CI the source of truth for "is this branch healthy," from the very first real feature.
**Acceptance Criteria:** Workflow passes on `main`; a deliberately broken PR fails the correct job.
**Dependencies:** 002, 003, 009
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/ci.yml`
**Tests Required:** N/A (CI is the test harness); verified via a scratch PR.
**Documentation Required:** `docs/guides/ci-cd.md` intro.
**Educational Notes:** Why CI should mirror local dev commands exactly (`pnpm lint`, not bespoke CI-only logic).
**Deliverables:** Green CI badge, workflow file.

---

### Issue 012 — Base Dockerfile for `apps/api`
**Description:** Multi-stage Dockerfile (deps → build → slim runtime) for the API app, non-root user, `.dockerignore`.
**Objective:** Establish a reproducible runtime environment early so later infra work builds on a working baseline.
**Acceptance Criteria:** `docker build` succeeds; container starts and serves `/health`; image runs as non-root.
**Dependencies:** 001
**Estimated Complexity:** M
**Files Affected:** `apps/api/Dockerfile`, `.dockerignore`
**Tests Required:** CI job building the image and curling `/health` inside it.
**Documentation Required:** `docs/guides/docker.md`
**Educational Notes:** Multi-stage builds and why running as root in containers is a common, avoidable vulnerability.
**Deliverables:** Buildable, runnable Docker image.

---

### Issue 013 — docker-compose for local development
**Description:** `docker-compose.yml` wiring `apps/api`, Postgres, and Redis for local dev, with volumes for hot-reload.
**Objective:** Let a new contributor run the full stack with one command.
**Acceptance Criteria:** `docker compose up` brings up API + Postgres + Redis; API connects successfully to both.
**Dependencies:** 012
**Estimated Complexity:** M
**Files Affected:** `docker-compose.yml`, `.env.example`
**Tests Required:** Manual verification checklist in `docs/guides/docker.md`.
**Documentation Required:** `docs/guides/docker.md` local dev section; README quickstart update.
**Educational Notes:** Dev/prod parity principle (the "12-factor app" config idea).
**Deliverables:** One-command local stack.

---

### Issue 014 — Vitest test runner configuration
**Description:** Configure Vitest for unit tests across all `packages/*`, with coverage reporting and a `pnpm test` root script that runs the whole workspace.
**Objective:** Establish the primary test runner before any domain code (which needs tests) is written.
**Acceptance Criteria:** `pnpm test` runs a sample passing test in each package type; coverage report generated.
**Dependencies:** 003
**Estimated Complexity:** S
**Files Affected:** `vitest.config.ts`, `packages/*/vitest.config.ts`
**Tests Required:** One trivial sample test per package (removed once real tests land, or kept as a template).
**Documentation Required:** `docs/guides/testing.md`
**Educational Notes:** Unit vs. integration vs. e2e — where each lives in this repo and why.
**Deliverables:** Working `pnpm test`.

---

### Issue 015 — Supertest HTTP integration test harness
**Description:** Add a reusable test helper that boots `apps/api` in-process and exposes a Supertest client for route-level integration tests.
**Objective:** Make HTTP-level testing trivial for every future route.
**Acceptance Criteria:** A test hitting `/health` via the harness passes; harness tears down cleanly (no open handles).
**Dependencies:** 001, 014
**Estimated Complexity:** S
**Files Affected:** `tests/integration/helpers/http-client.ts`
**Tests Required:** The `/health` integration test itself.
**Documentation Required:** `docs/guides/testing.md` integration section.
**Educational Notes:** Why testing through the HTTP boundary (not just calling handlers directly) catches serialization/middleware bugs unit tests miss.
**Deliverables:** Reusable HTTP test client.

---

### Issue 016 — EditorConfig & VS Code workspace recommendations
**Description:** Add `.editorconfig` and `.vscode/extensions.json` recommending ESLint/Prettier/EditorConfig extensions.
**Objective:** Reduce "works on my machine" formatting drift across editors/OSes for new contributors.
**Acceptance Criteria:** Opening the repo in VS Code prompts recommended extensions; line endings normalized (LF).
**Dependencies:** 002
**Estimated Complexity:** XS
**Files Affected:** `.editorconfig`, `.vscode/extensions.json`
**Tests Required:** None (config-only).
**Documentation Required:** `CONTRIBUTING.md` editor setup note.
**Educational Notes:** Why line-ending/whitespace drift causes noisy diffs and how EditorConfig fixes it at the source.
**Deliverables:** Editor config files.

---

### Issue 017 — CODEOWNERS and PR template
**Description:** Add `CODEOWNERS`, a PR template requiring linked issue, description, and testing notes, and an issue template for bug reports.
**Objective:** Set contribution quality expectations before external contributors arrive.
**Acceptance Criteria:** Opening a PR/issue in GitHub shows the templates.
**Dependencies:** 001
**Estimated Complexity:** XS
**Files Affected:** `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*`
**Tests Required:** None.
**Documentation Required:** `CONTRIBUTING.md` reference to templates.
**Educational Notes:** How templates reduce maintainer triage load in real OSS projects.
**Deliverables:** GitHub contribution templates.

---

### Issue 018 — Root README v1 (project overview)
**Description:** Write the public-facing README: what Verixa is, quickstart, architecture summary, links to docs, contribution pointer, license badge.
**Objective:** Give a first-time visitor a clear, accurate picture of the project within 60 seconds of reading.
**Acceptance Criteria:** README covers what/why/quickstart/architecture-link/contributing-link/license; all commands in it actually work as written.
**Dependencies:** 001, 011, 013
**Estimated Complexity:** S
**Files Affected:** `README.md`
**Tests Required:** N/A; verified manually by running every documented command.
**Documentation Required:** This *is* the documentation deliverable.
**Educational Notes:** What makes an effective OSS README (problem statement first, not feature list first).
**Deliverables:** Published README v1.

---

### Issue 019 — LICENSE and NOTICE
**Description:** Add an OSI-approved license (MIT) and a NOTICE file for any third-party attributions, plus SPDX headers guidance.
**Objective:** Make Verixa legally usable/forkable from day one — a hard requirement for grant/fellowship eligibility.
**Acceptance Criteria:** `LICENSE` file present at repo root; README references it; `package.json` `license` fields set.
**Dependencies:** 001
**Estimated Complexity:** XS
**Files Affected:** `LICENSE`, `NOTICE`, `package.json` files
**Tests Required:** None.
**Documentation Required:** README license section.
**Educational Notes:** MIT vs. Apache-2.0 vs. AGPL tradeoffs for infrastructure libraries (patent grant, copyleft implications).
**Deliverables:** License in place.

---

### Issue 020 — Architecture Decision Record (ADR) process
**Description:** Add `docs/adr/0000-adr-process.md` defining the ADR template and workflow, and backfill ADR-0001 (from Issue 001) into the correct location.
**Objective:** Ensure every non-trivial architectural decision from here on is recorded with its rationale, not just its outcome.
**Acceptance Criteria:** ADR template exists; ADR-0001 and ADR-0002 (this process) both present and correctly numbered.
**Dependencies:** 001
**Estimated Complexity:** XS
**Files Affected:** `docs/adr/0000-adr-process.md`, `docs/adr/0001-monorepo-and-stack.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable *is* documentation.
**Educational Notes:** Why "we chose X" without "because Y" becomes technical debt in institutional memory within a year.
**Deliverables:** ADR process + first two ADRs.
