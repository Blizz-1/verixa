# Phase 19 — CI/CD & DevOps Automation (Issues 361–380)

Extends Issue 011's CI skeleton into a full pipeline suite — lint/test/security/build matrices, semantic-release-driven versioning off Issue 010's Conventional Commits, automated dependency updates, and ephemeral per-PR preview environments.

---

### Issue 361 — CI pipeline foundation: build matrix & caching
**Description:** Extend Issue 011's minimal `.github/workflows/ci.yml` skeleton into a proper build matrix (Node LTS versions × OS, though OS matrix may collapse to `ubuntu-latest` for cost) with pnpm store caching and workspace-aware install, replacing the placeholder single-job pipeline.
**Objective:** Give every subsequent workflow a fast, reliable, cached foundation instead of reinstalling the full monorepo on every run.
**Acceptance Criteria:** `pnpm install --frozen-lockfile` cache-hits on unchanged lockfile; matrix runs green on a clean PR; job completes materially faster than an uncached baseline (documented in the workflow comment).
**Dependencies:** 011
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/ci.yml`, `.github/actions/setup-workspace/action.yml`
**Tests Required:** N/A (infra); verified via a workflow dry-run on a scratch PR.
**Documentation Required:** `docs/guides/ci-cd.md`
**Educational Notes:** Why caching keyed on lockfile hash (not branch name) is both correct and safe — cache poisoning risks of overly broad cache keys.
**Deliverables:** Cached, matrixed CI foundation all later workflows build on.

---

### Issue 362 — Lint & typecheck workflow
**Description:** Dedicated `.github/workflows/lint.yml` job running ESLint (Issue 011's config) and `tsc --noEmit --strict` across all workspaces in parallel with the test job, failing fast on either.
**Objective:** Catch style and type-safety regressions before they reach test/build stages, giving contributors fast feedback.
**Acceptance Criteria:** Job runs on every PR and push to `main`; fails the check on any lint error or type error; annotates offending lines via GitHub's PR-annotation format.
**Dependencies:** 361
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/lint.yml`
**Tests Required:** N/A; verified by an intentionally-broken scratch PR during review.
**Documentation Required:** `docs/guides/ci-cd.md` pipeline-stages section.
**Educational Notes:** Why lint/typecheck should run as an independent, parallel job rather than a step inside the test job — isolating failure signal and shortening feedback loops.
**Deliverables:** Standalone, fast-failing lint/typecheck gate.

---

### Issue 363 — Test workflow with coverage reporting
**Description:** `.github/workflows/test.yml` running Vitest unit/integration suites (including Testcontainers-backed integration tests per Issue 047's pattern) with coverage collection, uploading a coverage summary as a PR check annotation.
**Objective:** Make the existing per-package coverage gates (Issue 037 and its repeats) visible and enforced at the pipeline level, not just locally.
**Acceptance Criteria:** Workflow runs unit and integration suites in separate steps/jobs; coverage report generated and attached to the PR; job fails if any package's coverage gate regresses.
**Dependencies:** 037, 361
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/test.yml`, `.github/actions/coverage-report/action.yml`
**Tests Required:** N/A (meta); a scratch PR with a deliberate coverage drop used to verify the gate fires.
**Documentation Required:** `docs/guides/ci-cd.md` coverage section.
**Educational Notes:** Testcontainers in CI — why ephemeral real dependencies (Postgres, Redis) in the pipeline catch integration bugs that mocked unit tests structurally cannot.
**Deliverables:** Enforced, visible test/coverage gate.

---

### Issue 364 — Security scanning workflow (audit, osv-scanner, CodeQL)
**Description:** `.github/workflows/security.yml` running `npm audit`/`osv-scanner` for dependency vulnerabilities and GitHub CodeQL for static analysis, on a schedule and on every PR touching dependency manifests.
**Objective:** Automate the static-analysis and dependency-vulnerability defense-in-depth layer called for in `ARCHITECTURE.md` §6, rather than relying on manual review.
**Acceptance Criteria:** CodeQL results appear in the Security tab; `osv-scanner` fails the build on high/critical severity findings; scheduled nightly run catches newly disclosed CVEs in unchanged dependencies.
**Dependencies:** 361
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/security.yml`, `.github/codeql/codeql-config.yml`
**Tests Required:** N/A; verified against a scratch PR introducing a known-vulnerable dependency.
**Documentation Required:** `docs/security/ci-security-scanning.md`
**Educational Notes:** Why vulnerability scanning needs both a PR-time gate (new risk) and a scheduled run (newly disclosed risk in code that hasn't changed) — static dependency trees can still become vulnerable overnight.
**Deliverables:** Scheduled + PR-triggered security scanning gate.

---

### Issue 365 — Docker image build & publish workflow
**Description:** `.github/workflows/docker-build.yml` building the `apps/api` production image from Issue-defined Dockerfiles (multi-stage, per `ARCHITECTURE.md`'s Docker choice), tagging by commit SHA and semantic version, and pushing to GitHub Container Registry on `main`.
**Objective:** Produce a reproducible, versioned deployable artifact from every merge to `main`, not just an ad hoc local build.
**Acceptance Criteria:** Image builds successfully from a clean checkout; tags include both `sha-<short>` and, on release, the semantic version; image is not pushed on PR builds (build-only verification), only on `main`/tag events.
**Dependencies:** 361
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/docker-build.yml`, `infra/docker/Dockerfile`
**Tests Required:** N/A; verified by pulling and smoke-running the published image.
**Documentation Required:** `docs/guides/ci-cd.md` image-publishing section.
**Educational Notes:** Multi-stage Docker builds — why separating build and runtime stages shrinks the final image and reduces the production attack surface (no dev dependencies/compilers shipped).
**Deliverables:** Tagged, published container images per merge.

---

### Issue 366 — Branch protection & required status checks policy
**Description:** Document and codify (via a checked-in `settings.yml`/Terraform-lite config or a documented manual-setup checklist, whichever the repo's GitHub plan supports) the required status checks — lint, test, security, coverage — and review requirements for `main`.
**Objective:** Make CI gates actually block merges rather than being advisory-only checks contributors can ignore.
**Acceptance Criteria:** `main` requires all Phase 19 status checks to pass and at least one approving review before merge; policy documented so it's reproducible if the repo is re-created.
**Dependencies:** 362, 363, 364
**Estimated Complexity:** S
**Files Affected:** `.github/branch-protection.md`, `docs/guides/ci-cd.md`
**Tests Required:** N/A.
**Documentation Required:** This issue's deliverable is the policy doc itself.
**Educational Notes:** The gap between "CI runs" and "CI enforces" — a green check that doesn't block merge provides false confidence.
**Deliverables:** Documented, applied branch-protection policy.

---

### Issue 367 — Conventional Commit & PR-title lint enforcement
**Description:** `.github/workflows/commitlint.yml` validating that PR titles (squash-merge commit source) and, optionally, individual commits conform to the Conventional Commits spec established in Issue 010, using `commitlint` with a shared config.
**Objective:** Guarantee every commit reaching `main` is machine-parseable, since semantic-release (Issue 368) derives version bumps and changelogs directly from commit type/scope.
**Acceptance Criteria:** Non-conforming PR titles fail the check with an actionable error message; `commitlint.config.js` matches Issue 010's documented types/scopes exactly; squash-merge default title auto-populates from the PR title.
**Dependencies:** 010, 361
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/commitlint.yml`, `commitlint.config.js`
**Tests Required:** Unit tests for the commitlint config against fixture commit messages (valid and invalid).
**Documentation Required:** `docs/guides/ci-cd.md` commit-conventions section, cross-linking Issue 010's spec.
**Educational Notes:** Why commit-message linting is a prerequisite for release automation, not a style nitpick — machines can't infer semantic intent from free-form prose.
**Deliverables:** Enforced Conventional Commit gate feeding release automation.

---

### Issue 368 — semantic-release setup & configuration
**Description:** Install and configure `semantic-release` at the monorepo root with the `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, and `@semantic-release/github` plugins, parsing Issue 010's Conventional Commit types into major/minor/patch bumps.
**Objective:** Replace manual version bumping and tagging with a deterministic, commit-history-driven release process.
**Acceptance Criteria:** Given a fixture commit history (feat/fix/BREAKING CHANGE mix), `semantic-release --dry-run` computes the expected version bump; config committed and documented; runs only on `main`.
**Dependencies:** 367
**Estimated Complexity:** M
**Files Affected:** `.releaserc.json`, `.github/workflows/release.yml`, `package.json`
**Tests Required:** Dry-run verification against fixture commit sequences (documented in the PR, not a unit test per se).
**Documentation Required:** `docs/guides/release-process.md`
**Educational Notes:** Semantic Versioning as a communication contract, not a counter — why deriving bumps from commit semantics (not human judgment) keeps that contract honest at scale.
**Deliverables:** Working semantic-release dry-run pipeline.

---

### Issue 369 — Automated changelog generation
**Description:** Wire `@semantic-release/changelog` to generate and commit `CHANGELOG.md` entries per release, grouped by Conventional Commit type (Features, Fixes, Breaking Changes), with commit/PR links.
**Objective:** Give contributors and consumers a human-readable release history without manual changelog authoring.
**Acceptance Criteria:** A release run produces a correctly grouped, correctly linked changelog entry matching the release's actual commits; existing changelog history preserved across releases.
**Dependencies:** 368
**Estimated Complexity:** S
**Files Affected:** `.releaserc.json`, `CHANGELOG.md`
**Tests Required:** N/A; verified via dry-run output inspection.
**Documentation Required:** `docs/guides/release-process.md` changelog section.
**Educational Notes:** Changelogs as a byproduct of good commit hygiene — the automation only works because Issue 367 made commit messages structured data, not prose.
**Deliverables:** Auto-generated, accurate `CHANGELOG.md`.

---

### Issue 370 — Monorepo package publishing automation
**Description:** Configure `semantic-release`'s multi-package support (or `changesets` as an alternative evaluated and documented if better suited to pnpm workspaces) to independently version and publish each standalone `packages/*` context (per `ARCHITECTURE.md` §2.6's "composable over monolithic" principle) to npm on release.
**Objective:** Let each bounded-context package (`@verixa/rate-limiting`, `@verixa/authorization`, etc.) be consumed independently, with its own version history reflecting only its own changes.
**Acceptance Criteria:** A change scoped to one package bumps only that package's version and publishes only it; unrelated packages remain untouched; publish requires npm provenance/2FA-safe automation token, never a personal token.
**Dependencies:** 368
**Estimated Complexity:** L
**Files Affected:** `.github/workflows/release.yml`, `packages/*/package.json`, `.changeset/config.json` (if changesets chosen)
**Tests Required:** Dry-run verification across a multi-package fixture change.
**Documentation Required:** `docs/guides/release-process.md` per-package publishing section.
**Educational Notes:** Independent versioning in a monorepo vs. lockstep versioning — the tradeoff between consumer clarity (only the changed package bumps) and coordination overhead.
**Deliverables:** Working per-package npm publish automation.

---

### Issue 371 — GitHub release notes automation
**Description:** Wire `@semantic-release/github` to create a tagged GitHub Release with generated notes (from Issue 369's changelog) and attach the Docker image digest (Issue 365) and any relevant build artifacts.
**Objective:** Make each release a single, discoverable, complete artifact bundle rather than a bare git tag.
**Acceptance Criteria:** A release run creates a GitHub Release with correct notes, correct tag, and linked artifact references; draft releases never leak (all-or-nothing publish).
**Dependencies:** 365, 369
**Estimated Complexity:** S
**Files Affected:** `.releaserc.json`, `.github/workflows/release.yml`
**Tests Required:** N/A; verified via dry-run and one real tagged pre-release.
**Documentation Required:** `docs/guides/release-process.md` GitHub Releases section.
**Educational Notes:** Why a release should be one atomic, traceable bundle (tag + notes + artifact) rather than three loosely-connected side effects a maintainer has to manually reconcile.
**Deliverables:** Fully automated GitHub Release creation.

---

### Issue 372 — Dependency update automation (Renovate/Dependabot)
**Description:** Configure Renovate (preferred for pnpm-workspace-aware grouping) or Dependabot with a `renovate.json`/`dependabot.yml` policy: grouped updates per workspace, scheduled weekly runs, semver-range-aware update strategy, and Conventional Commit-formatted PR titles (satisfying Issue 367's lint).
**Objective:** Keep dependencies current automatically instead of relying on manual audits, closing the loop with Issue 364's vulnerability scanning.
**Acceptance Criteria:** Bot opens grouped PRs on schedule; PR titles pass `commitlint`; lockfile updates included in the same PR as the manifest change; major-version bumps opened separately from patch/minor for review visibility.
**Dependencies:** 367
**Estimated Complexity:** M
**Files Affected:** `renovate.json`, `.github/renovate.json5`
**Tests Required:** N/A; verified via Renovate's dry-run/onboarding PR.
**Documentation Required:** `docs/guides/ci-cd.md` dependency-update section.
**Educational Notes:** Dependency staleness as a security and maintenance liability — why continuous small updates are lower-risk than periodic large ones (smaller diffs, easier bisection on regression).
**Deliverables:** Scheduled, policy-driven dependency-update PRs.

---

### Issue 373 — Auto-merge policy for low-risk dependency updates
**Description:** GitHub Actions workflow auto-approving and auto-merging dependency-bot PRs that are patch/minor version bumps, pass all CI gates (Issues 362–364), and touch no `apps/api` production security-sensitive dependency (an explicit denylist, e.g. auth/crypto libraries always require human review).
**Objective:** Reduce maintainer toil for routine, low-risk updates while keeping a human in the loop for anything security-sensitive or breaking.
**Acceptance Criteria:** Qualifying PRs merge automatically after all checks pass; denylisted-package or major-version PRs are never auto-merged regardless of check status; auto-merge activity is itself logged/auditable.
**Dependencies:** 366, 372
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/auto-merge.yml`, `.github/dependency-review-denylist.json`
**Tests Required:** N/A; verified against fixture PRs simulating patch/minor/major/denylisted cases.
**Documentation Required:** `docs/guides/ci-cd.md` auto-merge policy section.
**Educational Notes:** Automating trust, not automating blindly — the denylist encodes which risk categories still require a human judgment call, a recurring theme from this project's security-first principle.
**Deliverables:** Safe, scoped auto-merge automation.

---

### Issue 374 — Lockfile drift & audit CI gate
**Description:** CI check verifying `pnpm-lock.yaml` is committed and in sync with `package.json` across all workspaces (`pnpm install --frozen-lockfile` failure treated as a hard gate), plus a periodic `pnpm audit --prod` gate distinct from Issue 364's broader scanning.
**Objective:** Prevent "works on my machine" drift where a contributor's local lockfile update never made it into the PR, and catch production-dependency-only vulnerabilities cheaply.
**Acceptance Criteria:** A PR with an out-of-sync lockfile fails CI with a clear remediation message; production-only audit runs faster than the full dev-inclusive scan and is scoped correctly.
**Dependencies:** 361
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/lockfile-check.yml`
**Tests Required:** N/A; verified via a scratch PR with a deliberately stale lockfile.
**Documentation Required:** `docs/guides/ci-cd.md` lockfile-integrity section.
**Educational Notes:** Lockfiles as the actual source of truth for what ships — why `package.json` ranges alone are insufficient for reproducible builds.
**Deliverables:** Enforced lockfile-integrity gate.

---

### Issue 375 — Ephemeral preview environment provisioning per PR
**Description:** `.github/workflows/preview-deploy.yml` that, on PR open/sync, builds the Docker image (Issue 365's build step, reused) and deploys a short-lived, isolated instance of `apps/api` plus its Postgres/Redis dependencies (via docker-compose or a lightweight cloud target) tagged and namespaced by PR number.
**Objective:** Let reviewers and contributors exercise a running instance of the actual PR's changes instead of reasoning about them statically.
**Acceptance Criteria:** Opening a PR provisions a reachable environment within a bounded time budget; the environment reflects the PR's exact commit; a PR comment posts the environment URL automatically.
**Dependencies:** 365
**Estimated Complexity:** L
**Files Affected:** `.github/workflows/preview-deploy.yml`, `infra/docker/docker-compose.preview.yml`
**Tests Required:** N/A; verified via a scratch PR confirming the environment boots and responds to a health check.
**Documentation Required:** `docs/guides/preview-environments.md`
**Educational Notes:** Preview environments as an extension of "test in production-like conditions" — catching integration/config issues that unit and even Testcontainers-based integration tests can't, because they exercise the actual deployed composition root.
**Deliverables:** Working per-PR preview deployments.

---

### Issue 376 — Preview environment teardown automation
**Description:** Workflow trigger on PR close/merge (and a scheduled sweep for orphaned environments past a TTL) that tears down the preview environment and its resources provisioned in Issue 375.
**Objective:** Prevent unbounded resource/cost accumulation from abandoned or stale preview environments.
**Acceptance Criteria:** Closing a PR reliably tears down its environment within a bounded time; a scheduled job catches any environment that survived teardown failure (idempotent, alerts on repeated failure); teardown removes all provisioned resources, not just the compute.
**Dependencies:** 375
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/preview-teardown.yml`, `.github/workflows/preview-sweep.yml`
**Tests Required:** N/A; verified via a scratch PR close and a simulated orphaned-environment sweep.
**Documentation Required:** `docs/guides/preview-environments.md` lifecycle section.
**Educational Notes:** Why ephemeral infrastructure needs an explicit, idempotent teardown path and a backstop sweep — trigger-based cleanup alone silently fails when the triggering event itself doesn't fire (e.g. force-deleted branches).
**Deliverables:** Reliable preview-environment lifecycle management.

---

### Issue 377 — Preview environment secrets & config isolation
**Description:** Scoped, per-PR-environment secrets/config (distinct test-tier database credentials, non-production API keys, isolated Redis namespace) sourced from a dedicated GitHub Environment with restricted access, ensuring preview deploys never touch production credentials or data.
**Objective:** Eliminate the risk of an external-contributor PR (or a compromised workflow) exfiltrating or misusing production secrets via the preview pipeline.
**Acceptance Criteria:** Preview workflow secrets are scoped to a `preview` GitHub Environment separate from `production`; PRs from forks cannot access preview-environment secrets by default (per GitHub's fork-PR secret restrictions) unless explicitly approved; no production connection string ever appears in preview workflow logs or config.
**Dependencies:** 375
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/preview-deploy.yml`, `.github/environments/preview.yml`
**Tests Required:** N/A; verified by attempting (and confirming denial of) secret access from a fork-originated PR.
**Documentation Required:** `docs/security/preview-environment-isolation.md`
**Educational Notes:** The blast radius of CI secrets — why preview/CI pipelines are a common real-world credential-leak vector, and how environment-scoped secrets plus fork-PR restrictions contain that risk.
**Deliverables:** Isolated, least-privilege preview environment secrets.

---

### Issue 378 — Staging/production deployment workflow
**Description:** `.github/workflows/deploy.yml` triggered on a successful semantic-release (Issue 368) run: deploys the newly tagged image (Issue 365) to staging automatically, and to production via a manual approval gate (GitHub Environment protection rule).
**Objective:** Connect the release pipeline to an actual deployment target, closing the loop from commit to running production system.
**Acceptance Criteria:** Every release auto-deploys to staging; production deploy requires an explicit approval from a designated reviewer; failed deploys roll back automatically or block promotion, never leave staging/production in an unknown state.
**Dependencies:** 371, 377
**Estimated Complexity:** L
**Files Affected:** `.github/workflows/deploy.yml`, `.github/environments/production.yml`
**Tests Required:** Post-deploy smoke test step (health-check assertion) required before marking the deploy successful.
**Documentation Required:** `docs/guides/deployment.md`
**Educational Notes:** Progressive delivery — why staging-then-production with a human gate balances deployment automation against the blast radius of an unreviewed production push.
**Deliverables:** Automated staging deploy with gated production promotion.

---

### Issue 379 — CI/CD pipeline observability & failure notifications
**Description:** Workflow-status notifications (failure alerts to a configured channel/webhook — Slack/Discord/email, adapter-based like Phase's notification port pattern) for `main`-branch CI failures, release failures, and deploy failures, plus a lightweight CI dashboard summarizing pipeline health (pass rate, mean duration) sourced from workflow run history.
**Objective:** Ensure pipeline failures on `main` are surfaced actively rather than discovered by a maintainer stumbling onto a red check later.
**Acceptance Criteria:** A `main` CI/release/deploy failure triggers a notification within minutes; notification includes the failing job, commit, and a direct link to logs; dashboard data refreshes on a schedule and reflects at least the last 30 days of runs.
**Dependencies:** 363, 368, 378
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/notify-on-failure.yml`, `scripts/ci-dashboard/generate.ts`
**Tests Required:** Unit tests for the dashboard data-aggregation script.
**Documentation Required:** `docs/guides/ci-cd.md` observability section.
**Educational Notes:** Mean-time-to-detection as a pipeline health metric in its own right — a broken `main` that nobody notices for days defeats the purpose of continuous integration.
**Deliverables:** Active failure alerting and a pipeline-health dashboard.

---

### Issue 380 — CI/CD tutorial & phase closure documentation
**Description:** Write `docs/guides/tutorials/building-a-cicd-pipeline.md` walking through the full Phase 19 pipeline end-to-end — commit convention, CI gates, semantic-release, dependency automation, and preview/deploy environments — with references to the real workflow files built across Issues 361–379.
**Objective:** Deliver the phase's educational artifact, giving contributors a single narrative explanation of how a commit becomes a deployed, versioned release.
**Acceptance Criteria:** Tutorial traces one hypothetical commit through every stage (lint → test → security → merge → release → publish → deploy) with links to the actual workflow files; every claim in the tutorial is verifiable against real, working config from this phase.
**Dependencies:** 361–379
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/building-a-cicd-pipeline.md`, `docs/guides/ci-cd.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the tutorial itself.
**Educational Notes:** CI/CD as applied systems thinking — each Phase 19 issue is a small, composable automation, but the pipeline's real value is the end-to-end guarantee they form together.
**Deliverables:** Published tutorial and consolidated CI/CD guide, closing Phase 19.

---
