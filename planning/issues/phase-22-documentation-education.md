# Phase 22 — Documentation & Education (Issues 421–440)

Rebuilds Verixa's documentation as a coherent, navigable product — README, a proper docs site, architecture guides, a "build your own auth" tutorial series, and contributor onboarding — pulling together the scattered per-phase docs and tutorials from Issues 001–420 into one discoverable whole.

---

### Issue 421 — README overhaul
**Description:** Rewrite the root `README.md` from scratch: what Verixa is, who it's for, a 5-minute quickstart (clone, `pnpm install`, `docker-compose up`, run one auth flow), architecture diagram, and links into the new docs site.
**Objective:** Give a first-time visitor a correct, current, and honest first impression — the current README predates most of Phases 01–21 and no longer reflects reality.
**Acceptance Criteria:** Quickstart commands verified to work on a clean checkout; README under ~400 lines with details deferred to `docs/`; badges (CI, coverage, license) reflect real pipelines from Phase 19.
**Dependencies:** 001, 019 (CI), Phase 19
**Estimated Complexity:** M
**Files Affected:** `README.md`, `docs/assets/architecture-overview.svg`
**Tests Required:** Quickstart steps run in CI as a smoke test (link to Phase 18/19 pipeline).
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** A README is a funnel, not a manual — it should answer "what is this, is it for me, how do I try it" in under a minute, deferring depth to linked docs rather than inlining everything.
**Deliverables:** Accurate, tested, quickstart-verified README.

---

### Issue 422 — Docs site scaffolding
**Description:** Stand up a static docs site generator (VitePress, chosen for TypeScript-native config and low operational overhead) rooted at `docs/`, consuming existing Markdown without requiring immediate rewrites.
**Objective:** Turn the flat `docs/` folder of loose Markdown files into a browsable, searchable site instead of a folder contributors have to `grep`.
**Acceptance Criteria:** `pnpm docs:dev` serves the site locally; existing `docs/guides/*.md` and `docs/adr/*.md` render without broken links; build produces static output deployable as an artifact.
**Dependencies:** 001
**Estimated Complexity:** M
**Files Affected:** `docs/.vitepress/config.ts`, `package.json`, `docs/index.md`
**Tests Required:** Build smoke test (`pnpm docs:build` exits 0) wired into CI.
**Documentation Required:** `docs/guides/writing-docs.md` (how to add a new doc page).
**Educational Notes:** Docs-as-code: treating documentation as a build artifact with the same CI discipline as source code prevents the two from drifting apart, which is the single most common way project docs go stale.
**Deliverables:** Buildable, locally-servable docs site.

---

### Issue 423 — Docs site navigation, search, and versioning
**Description:** Configure sidebar navigation grouped by audience (Getting Started, Architecture, Tutorials, Security, Contributing, API Reference), local full-text search, and a version banner noting the docs track `main`.
**Objective:** Make the ~40+ existing doc/tutorial files (Phases 01–21) findable by task rather than by memorizing filenames.
**Acceptance Criteria:** Every existing `docs/**/*.md` file reachable within two sidebar clicks from the homepage; search returns results for at least 10 spot-checked terms (e.g. "token bucket", "RLS", "ADR").
**Dependencies:** 422
**Estimated Complexity:** S
**Files Affected:** `docs/.vitepress/config.ts`, `docs/index.md`
**Tests Required:** Link-check script (see Issue 440) run against the built site.
**Documentation Required:** N/A (structural, self-documenting).
**Educational Notes:** Information architecture matters as much as content quality — a correct doc nobody can find has the same practical value as no doc at all.
**Deliverables:** Navigable, searchable docs site structure.

---

### Issue 424 — Architecture guide: Clean Architecture in Verixa
**Description:** Write `docs/guides/architecture/clean-architecture.md` explaining the `domain → application → infrastructure/interface` layering used throughout `packages/*`, with a concrete walk through one context (Identity, from Phase 02) as the running example.
**Objective:** Give newcomers a single canonical explanation of the layering rule referenced implicitly by every phase, rather than making them reconstruct it from scattered per-issue notes.
**Acceptance Criteria:** Explains the dependency rule from `planning/ARCHITECTURE.md` section 4; shows a real file from each layer with line references; includes a "what breaks if you violate this" example (e.g. domain importing Prisma).
**Dependencies:** 021–039 (Identity context, Phase 02)
**Estimated Complexity:** M
**Files Affected:** `docs/guides/architecture/clean-architecture.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Layered architecture is easiest to teach through a violation example — showing what breaks (untestable domain logic, framework lock-in) makes the rule memorable in a way that abstract diagrams don't.
**Deliverables:** Published architecture guide.

---

### Issue 425 — Architecture guide: bounded contexts and the context map
**Description:** Write `docs/guides/architecture/bounded-contexts.md` documenting each context from `planning/ARCHITECTURE.md` section 5 (Identity, Credentials, Sessions, MFA, Authorization, Verification, Audit, Governance, Notifications, Rate Limiting), its responsibility, and its integration points with neighboring contexts.
**Objective:** Make Verixa's DDD decomposition legible as a whole, since individual phase docs each explain their own context in isolation but nothing ties the map together.
**Acceptance Criteria:** One section per context with responsibility, key entities, and "talks to" relationships; diagram showing context boundaries and communication (in-process calls vs. events).
**Dependencies:** Phases 02, 04–10, 14, 15, 16
**Estimated Complexity:** M
**Files Affected:** `docs/guides/architecture/bounded-contexts.md`, `docs/assets/context-map.svg`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** DDD's context map is the artifact that keeps a modular monolith from becoming a "big ball of mud" — explicit boundaries and integration contracts are what make future service extraction (ARCHITECTURE.md section 2.5) possible.
**Deliverables:** Published context-map guide.

---

### Issue 426 — Architecture guide: composition root and dependency injection
**Description:** Write `docs/guides/architecture/composition-root.md` explaining how `apps/api` wires ports to adapters, using the rate-limiting retrofit (Issues 283, 294–297) as the worked example of a seam being filled in after the fact.
**Objective:** Explain the DI pattern used everywhere but never centrally documented — every phase's "Files Affected" references a composition file without an owning explanation.
**Acceptance Criteria:** Shows a port interface, a no-op adapter, a real adapter, and the composition-root binding switch between them; explicitly connects to the "seam" concept used in Issues 074, 283.
**Dependencies:** 074, 283, 297
**Estimated Complexity:** M
**Files Affected:** `docs/guides/architecture/composition-root.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** The composition root pattern is what lets cross-cutting concerns (rate limiting, notifications) be retrofitted with zero call-site changes — this is dependency inversion's practical payoff, not just a textbook principle.
**Deliverables:** Published composition-root guide.

---

### Issue 427 — Architecture guide: ports & adapters cookbook
**Description:** Write `docs/guides/architecture/ports-and-adapters-cookbook.md`, a recipe-style reference for adding a new port: define the interface, write a contract test suite, implement a no-op/stub adapter, implement a real adapter, wire it in composition.
**Objective:** Turn a pattern contributors have seen repeated across ~10 phases into a reusable checklist they can follow when adding their own.
**Acceptance Criteria:** Each step includes a real file reference from an existing port (e.g. `RateLimiter`, `CaptchaVerifier`, `NotificationSender`); includes a checklist a reviewer can use on new-port PRs.
**Dependencies:** 074, 283, 290, Phase 14
**Estimated Complexity:** S
**Files Affected:** `docs/guides/architecture/ports-and-adapters-cookbook.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Codifying a repeated pattern into a checklist is how a codebase's tacit conventions become explicit, teachable, and enforceable in review — without it, the pattern survives only as long as institutional memory does.
**Deliverables:** Published cookbook guide.

---

### Issue 428 — ADR index and ADR-writing guide
**Description:** Write `docs/adr/README.md` indexing all existing Architecture Decision Records with status (accepted/superseded) and a short guide on when and how to write a new ADR, using the `docs/adr` template implied by `planning/ARCHITECTURE.md` section 3.
**Objective:** Make the accumulated decision history (Fastify vs. Express, Prisma vs. raw SQL, modular monolith vs. microservices, etc.) discoverable instead of buried in the architecture doc's prose.
**Acceptance Criteria:** Index lists every ADR with a one-line summary and status; guide specifies the required sections (context, decision, consequences, alternatives considered) and links the ARCHITECTURE.md "Open Questions" section as the ADR backlog.
**Dependencies:** None
**Estimated Complexity:** S
**Files Affected:** `docs/adr/README.md`, `docs/adr/template.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** ADRs record the "why not" as much as the "why" — future contributors re-litigating a settled decision waste less time when the rejected alternatives and their reasons are written down.
**Deliverables:** Published ADR index and template.

---

### Issue 429 — "Build Your Own Auth" tutorial series: index and learning path
**Description:** Write `docs/guides/tutorials/build-your-own-auth/README.md`, an index tying together the existing standalone tutorials (Issues 040, 060, 080, 300, and Phase 06/07/08's equivalents) into an ordered curriculum with prerequisites and estimated time per module.
**Objective:** Convert scattered per-phase tutorials into a named, discoverable series — the project's flagship educational deliverable per `planning/ARCHITECTURE.md` section 2's "educational by construction" principle.
**Acceptance Criteria:** Lists every tutorial in learning order (identity → credentials → sessions → MFA → RBAC/ABAC → rate limiting); each entry links the real tutorial file and states prerequisites; includes a suggested "weekend project" path for newcomers.
**Dependencies:** 040, 060, 080, 300
**Estimated Complexity:** S
**Files Affected:** `docs/guides/tutorials/build-your-own-auth/README.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** A curriculum is more than a list of links — sequencing (prerequisites, growing complexity) is itself pedagogical content, and its absence is why many projects' scattered tutorials go unread.
**Deliverables:** Published tutorial-series index.

---

### Issue 430 — Tutorial: password hashing and storage from scratch
**Description:** Write `docs/guides/tutorials/build-your-own-auth/01-password-hashing.md`, teaching why plaintext and fast hashes (MD5/SHA-256) fail, then walking through Argon2id parameter choice and Verixa's real hashing adapter as the worked example.
**Objective:** Give the series its foundational module — every subsequent module assumes this reasoning.
**Acceptance Criteria:** Explains rainbow tables, GPU cracking, and why slow/memory-hard hashing defeats both; links Verixa's actual `packages/credentials` hashing code and its tests; includes a runnable exercise (hash and verify a password locally).
**Dependencies:** Phase 04 (credential hashing implementation)
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-your-own-auth/01-password-hashing.md`
**Tests Required:** None (tutorial; exercise is self-contained, not part of CI).
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Argon2id's memory-hardness specifically targets GPU/ASIC parallelism, which is why it's preferred over bcrypt/PBKDF2 for new systems — the tutorial makes this cost/security tradeoff concrete with real parameter numbers.
**Deliverables:** Published tutorial module 1.

---

### Issue 431 — Tutorial: sessions and tokens from scratch
**Description:** Write `docs/guides/tutorials/build-your-own-auth/02-sessions-and-tokens.md`, contrasting stateful sessions vs. stateless JWTs, then explaining Verixa's actual choice (Phase 05) and its revocation strategy.
**Objective:** Teach the session/token design space, not just Verixa's specific answer, so readers can make an informed choice in their own projects.
**Acceptance Criteria:** Covers session fixation, token replay, and revocation-list tradeoffs; links Phase 05's real implementation and tests; includes a diagram of the login → token issuance → refresh → revocation lifecycle.
**Dependencies:** Phase 05 (sessions & tokens)
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-your-own-auth/02-sessions-and-tokens.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Stateless JWTs trade revocability for scalability — Verixa's hybrid approach (short-lived tokens plus a revocation list) is a concrete case study in choosing a middle point on that tradeoff deliberately rather than by default.
**Deliverables:** Published tutorial module 2.

---

### Issue 432 — Tutorial: multi-factor authentication from scratch
**Description:** Write `docs/guides/tutorials/build-your-own-auth/03-mfa.md` explaining TOTP's HMAC-based algorithm, WebAuthn/passkey's public-key model, and backup codes, using Phase 06's implementation as the worked example.
**Objective:** Demystify MFA mechanics (often treated as a black box even by engineers who implement it) with real, runnable code references.
**Acceptance Criteria:** Derives TOTP from HOTP plus a time step in plain terms; explains why WebAuthn resists phishing in a way TOTP does not; links Phase 06's real TOTP and WebAuthn adapters and tests.
**Dependencies:** Phase 06 (MFA)
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-your-own-auth/03-mfa.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** WebAuthn's phishing resistance comes from binding a credential to an origin at the protocol level — a mechanical property, not a policy one — which is why it succeeds where user-education-based defenses against phishing largely fail.
**Deliverables:** Published tutorial module 3.

---

### Issue 433 — Tutorial: RBAC and ABAC from scratch
**Description:** Write `docs/guides/tutorials/build-your-own-auth/04-authorization.md` contrasting role-based and attribute-based access control, using Phase 07 (RBAC) and Phase 08 (ABAC policy engine) as worked examples of when each model fits.
**Objective:** Teach the authorization design space, since RBAC-only tutorials are common but ABAC's added expressiveness (and complexity cost) is rarely explained well.
**Acceptance Criteria:** Shows a scenario RBAC handles cleanly and one that needs ABAC (e.g. "own resource" or time-of-day policies); links real policy-engine code and tests from Phase 08.
**Dependencies:** Phase 07, Phase 08
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-your-own-auth/04-authorization.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** RBAC answers "what role does this user have"; ABAC answers "given this user, resource, and context, is this action allowed" — the tutorial makes the case that most real systems eventually need both, layered rather than chosen exclusively.
**Deliverables:** Published tutorial module 4.

---

### Issue 434 — Tutorial: rate limiting from scratch (series capstone)
**Description:** Write `docs/guides/tutorials/build-your-own-auth/05-rate-limiting.md`, a shorter capstone module that cross-links Issue 300's existing deep-dive tutorial (`designing-a-rate-limiter.md`) rather than duplicating it, framing rate limiting as the layer that protects everything built in modules 1–4.
**Objective:** Close the series by connecting abuse prevention back to every mechanism taught earlier (password brute force, token replay, MFA code guessing all need rate limits).
**Acceptance Criteria:** Explicitly states which prior module's attack surface each rate-limiting strategy (Issues 285–287) protects; links Issue 300's tutorial rather than re-explaining the token-bucket algorithm.
**Dependencies:** 300, 430, 431, 432, 433
**Estimated Complexity:** S
**Files Affected:** `docs/guides/tutorials/build-your-own-auth/05-rate-limiting.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Reiterating the series' throughline: every authentication mechanism has a corresponding brute-force or abuse surface, and rate limiting is the generic defense layered on top of all of them rather than a bolt-on afterthought.
**Deliverables:** Published tutorial module 5, series complete.

---

### Issue 435 — Security documentation consolidation
**Description:** Write `docs/security/README.md` indexing every threat model and security guide produced across Phases 04–15 (authentication flows, MFA, RBAC/ABAC, verification, audit, rate limiting) with a consolidated STRIDE coverage summary.
**Objective:** Give security reviewers and auditors one entry point instead of requiring them to know every phase's doc filename.
**Acceptance Criteria:** Every `docs/security/*.md` file indexed with a one-line summary; coverage table maps STRIDE categories to the threat models that address them; gaps (if any) explicitly noted rather than implied.
**Dependencies:** Phase 04, 06, 07, 08, 09, 10, 15
**Estimated Complexity:** S
**Files Affected:** `docs/security/README.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** A consolidated threat-model index is itself a security control — undiscoverable threat models don't get reviewed or kept current, which is a common way security documentation silently rots.
**Deliverables:** Published security-docs index.

---

### Issue 436 — Contributor onboarding: CONTRIBUTING.md overhaul
**Description:** Rewrite `CONTRIBUTING.md` covering the monorepo layout, the per-context internal shape from `planning/ARCHITECTURE.md` section 4, commit conventions (Conventional Commits per section 3), branch/PR workflow, and where to find an issue to work on.
**Objective:** Replace an assumed-stale or absent contributor guide with one that matches the codebase as it exists after 21 phases.
**Acceptance Criteria:** Walks a new contributor from clone to opened PR; references the ports-and-adapters cookbook (Issue 427) and coverage-gate convention (Issue 037) as the two conventions every PR must satisfy.
**Dependencies:** 037, 427
**Estimated Complexity:** M
**Files Affected:** `CONTRIBUTING.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Onboarding friction is a direct tax on project velocity — every question CONTRIBUTING.md doesn't answer becomes a maintainer's time instead of a contributor's self-service read.
**Deliverables:** Rewritten, accurate CONTRIBUTING.md.

---

### Issue 437 — Local development environment guide
**Description:** Write `docs/guides/local-development.md` covering `docker-compose up`, environment variable setup (`.env.example`), running migrations, seeding data, and running the test suite locally (unit, integration, Testcontainers).
**Objective:** Consolidate environment setup steps currently scattered across `.env.example` comments and individual phase docs into one authoritative walkthrough.
**Acceptance Criteria:** Followed start-to-finish on a clean machine, results in a running API and passing test suite; troubleshooting section covers the most common setup failures (Docker not running, port conflicts, missing env vars).
**Dependencies:** 001, Phase 19 (CI parity)
**Estimated Complexity:** S
**Files Affected:** `docs/guides/local-development.md`
**Tests Required:** Steps validated in CI as part of the docs build smoke test (Issue 440).
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Docker Compose exists precisely to eliminate "works on my machine" — documenting the intended path reinforces that the compose file, not ad hoc local installs, is the source of truth for a working dev environment.
**Deliverables:** Published local-dev guide.

---

### Issue 438 — Code style and review guide
**Description:** Write `docs/guides/code-style-and-review.md` documenting the ESLint/Prettier conventions, the Clean Architecture layering rule as a review checklist item, and what reviewers should look for on security-sensitive PRs (secrets, timing-safe comparisons, input validation).
**Objective:** Make code-review expectations explicit so contributors aren't guessing at unwritten house style.
**Acceptance Criteria:** Includes a PR review checklist covering architecture-boundary violations, missing tests, missing educational notes on new ports; references the security-review requirements from `planning/ARCHITECTURE.md` section 6.
**Dependencies:** 001, Phase 11 (security hardening)
**Estimated Complexity:** S
**Files Affected:** `docs/guides/code-style-and-review.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** A written review checklist converts tacit reviewer judgment into a repeatable, teachable standard — new reviewers ramp up faster and existing reviewers apply the bar consistently.
**Deliverables:** Published review guide.

---

### Issue 439 — Glossary and terminology guide
**Description:** Write `docs/guides/glossary.md` defining domain and architecture terms used throughout the docs (bounded context, port/adapter, aggregate, value object, RLS, token bucket, STRIDE, ADR, composition root, etc.) with links to their first substantive usage.
**Objective:** Lower the vocabulary barrier for newcomers who encounter DDD/security jargon before the guide that explains it.
**Acceptance Criteria:** Covers every term flagged as undefined-on-first-use by a pass through Phases 01–21's docs; each entry links to the guide or ADR where the term is used in context.
**Dependencies:** None (references material from Phases 01–21)
**Estimated Complexity:** S
**Files Affected:** `docs/guides/glossary.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Jargon is a legitimate barrier to entry, not a sign of rigor — a glossary is a small investment that measurably shortens the time to a newcomer's first productive contribution.
**Deliverables:** Published glossary.

---

### Issue 440 — Docs site CI: link checking, lint, and publish gate
**Description:** Add a CI job (extending Phase 19's pipeline) that builds the docs site (Issue 422), runs a link checker across all internal and external links, lints Markdown for style consistency, and blocks merge on failures.
**Objective:** Prevent the newly consolidated documentation from drifting back into the stale, broken-link state that motivated this phase.
**Acceptance Criteria:** CI fails on any broken internal link or docs-build error; external link checks run on a schedule (not blocking, since third-party links can flake) with results surfaced as a report; passing gate required for merge to `main`.
**Dependencies:** 422, Phase 19
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/docs.yml`, `docs/.vitepress/config.ts`
**Tests Required:** CI job itself is the test; includes a fixture PR with an intentionally broken link to verify the gate catches it during initial rollout.
**Documentation Required:** `docs/guides/writing-docs.md` update noting the enforced gate.
**Educational Notes:** Documentation debt accrues the same way code debt does — the only durable fix is treating docs correctness as a CI-enforced invariant rather than a best-effort convention, closing the loop this phase opened.
**Deliverables:** Enforced docs CI gate; Phase 22 complete.

---
