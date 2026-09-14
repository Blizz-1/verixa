# Phase 20 — Docker & Deployment Infra (Issues 381–400)

Hardens the base Dockerfile (Issue 012) and dev docker-compose (Issue 013) into production-grade
container images, orchestration, environment configuration, migration-on-deploy tooling, and a
publishable deployment guide.

---

### Issue 381 — Production-hardened multi-stage `apps/api` Dockerfile
**Description:** Extend Issue 012's Dockerfile with a dedicated `production` build target: pinned base-image digest (not just tag), `pnpm deploy --prod` pruning of devDependencies, minimal final layer (distroless or `node:XX-slim`), and explicit `HEALTHCHECK` instruction.
**Objective:** Shrink the attack surface and image size of the image that actually ships, without disturbing the existing dev-oriented build target.
**Acceptance Criteria:** Production target image excludes devDependencies and source maps by default; image digest pin documented; `docker inspect` shows a working `HEALTHCHECK`; final image is measurably smaller than the dev target.
**Dependencies:** 012
**Estimated Complexity:** M
**Files Affected:** `apps/api/Dockerfile`, `.dockerignore`
**Tests Required:** CI job building the `production` target and asserting image size stays under a documented budget; healthcheck-status assertion.
**Documentation Required:** `docs/guides/docker.md` production-build section.
**Educational Notes:** Why pinning by digest (not tag) prevents silent base-image drift, and why devDependencies in a production image is both bloat and attack surface.
**Deliverables:** Slim, pinned, health-checked production image.

---

### Issue 382 — Multi-stage Dockerfiles for `packages/*` service extraction readiness
**Description:** Per-package Dockerfile templates (parameterized by package name) proving any `packages/<context>` could be built and run standalone, matching ARCHITECTURE.md's "service-ready later" principle.
**Objective:** Validate the modular-monolith-to-services seam at the infra layer, not just the code layer.
**Acceptance Criteria:** At least one bounded context (e.g. `packages/notifications`) builds and runs as an isolated container exposing only its own interface; template documented for reuse by other contexts.
**Dependencies:** 381
**Estimated Complexity:** M
**Files Affected:** `infra/docker/package.Dockerfile.template`, `packages/notifications/Dockerfile`
**Tests Required:** CI job building the templated Dockerfile for the pilot package.
**Documentation Required:** `docs/guides/docker.md` "extracting a context to its own service" section.
**Educational Notes:** How Dockerfile-per-context proves architectural boundaries are real, not aspirational — a build that only works when everything is present indicates a leaky boundary.
**Deliverables:** Reusable per-package Dockerfile template plus one working example.

---

### Issue 383 — Multi-architecture image builds (amd64/arm64)
**Description:** `docker buildx` configuration building and publishing `apps/api` images for both `linux/amd64` and `linux/arm64` under a single manifest tag.
**Objective:** Support both traditional cloud VMs and ARM-based deployment targets (e.g. Graviton, Apple Silicon dev machines) from one image tag.
**Acceptance Criteria:** `docker buildx build --platform linux/amd64,linux/arm64` succeeds; manifest list published; image runs correctly on both architectures in CI.
**Dependencies:** 381
**Estimated Complexity:** M
**Files Affected:** `infra/docker/buildx-bake.hcl`, `.github/workflows/docker-publish.yml`
**Tests Required:** CI matrix job running the built image on both architectures and curling `/health`.
**Documentation Required:** `docs/guides/docker.md` multi-arch section.
**Educational Notes:** How manifest lists let a single tag resolve to the correct architecture-specific image at pull time, and why QEMU emulation in CI is slow but sufficient for occasional cross-builds.
**Deliverables:** Published multi-arch image manifest.

---

### Issue 384 — Layer-caching optimization for CI build speed
**Description:** Reorder Dockerfile instructions and adopt `--mount=type=cache` for pnpm store, plus registry-based BuildKit cache export/import in CI, to minimize rebuild time on dependency-unchanged commits.
**Objective:** Keep CI feedback loops fast as the monorepo grows, without sacrificing reproducibility.
**Acceptance Criteria:** A source-only change (no dependency change) rebuilds in a documented fraction of a cold-build time; cache correctness verified (no stale-dependency false negatives).
**Dependencies:** 381
**Estimated Complexity:** S
**Files Affected:** `apps/api/Dockerfile`, `.github/workflows/docker-publish.yml`
**Tests Required:** CI timing assertion comparing cached vs. cold build; cache-invalidation test on `package.json` change.
**Documentation Required:** `docs/guides/docker.md` build-cache section.
**Educational Notes:** BuildKit cache mounts vs. layer caching — why dependency-install layers benefit from a persistent cache mount rather than relying on layer reuse alone.
**Deliverables:** Faster, verified CI image builds.

---

### Issue 385 — Production `docker-compose.prod.yml`
**Description:** Extend Issue 013's dev compose file with a `docker-compose.prod.yml` overlay: production image targets, resource limits (CPU/memory), restart policies, no bind-mounted source, and no exposed dev ports.
**Objective:** Give small/self-hosted deployments a supported single-host production topology without requiring Kubernetes.
**Acceptance Criteria:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up` runs API + Postgres + Redis in production mode; containers restart on failure; no host bind-mounts of source code present.
**Dependencies:** 013, 381
**Estimated Complexity:** M
**Files Affected:** `docker-compose.prod.yml`, `docker-compose.yml`
**Tests Required:** Manual verification checklist plus a CI smoke job bringing the stack up and curling `/health`.
**Documentation Required:** `docs/guides/deployment.md` single-host section.
**Educational Notes:** Compose overlays as a way to keep one base file DRY across environments, mirroring the dev/prod parity principle from Issue 013 while diverging only where production genuinely differs.
**Deliverables:** Working single-host production compose stack.

---

### Issue 386 — Postgres and Redis persistence & backup volumes in compose
**Description:** Named Docker volumes for Postgres data and Redis AOF/RDB persistence in `docker-compose.prod.yml`, plus a documented backup/restore procedure using `pg_dump`/`redis-cli --rdb` run against the running containers.
**Objective:** Prevent data loss on container recreation for self-hosted single-host deployments, and give operators a tested recovery path.
**Acceptance Criteria:** Recreating containers (`docker compose down && up`, without `-v`) preserves data; documented backup command produces a restorable dump; restore procedure verified end-to-end.
**Dependencies:** 385
**Estimated Complexity:** S
**Files Affected:** `docker-compose.prod.yml`, `infra/docker/scripts/backup.sh`, `infra/docker/scripts/restore.sh`
**Tests Required:** CI or manual test performing a backup, destroying the volume, and restoring from the dump.
**Documentation Required:** `docs/guides/deployment.md` backup-and-restore section.
**Educational Notes:** Why named volumes (not anonymous or bind mounts) are the right default for stateful containers, and why "the container is disposable, the volume is not" is the core mental model.
**Deliverables:** Persistent, backed-up-and-restorable data volumes.

---

### Issue 387 — Reverse proxy / TLS termination compose service
**Description:** Add an nginx (or Caddy) reverse-proxy service to `docker-compose.prod.yml` terminating TLS in front of `apps/api`, with a documented Let's Encrypt/certbot flow for self-hosted deployments.
**Objective:** Give the single-host deployment path a supported way to serve HTTPS without requiring an external load balancer.
**Acceptance Criteria:** Proxy forwards to `apps/api` over the internal compose network; TLS termination verified with a self-signed cert in CI and documented for real certs in production; HTTP requests redirect to HTTPS.
**Dependencies:** 385
**Estimated Complexity:** M
**Files Affected:** `infra/docker/nginx/nginx.conf`, `docker-compose.prod.yml`
**Tests Required:** CI smoke test asserting HTTP→HTTPS redirect and a successful TLS handshake against the proxy.
**Documentation Required:** `docs/guides/deployment.md` TLS section.
**Educational Notes:** Why TLS termination belongs at the edge (proxy) rather than in the application process — separation of transport security from application logic.
**Deliverables:** HTTPS-capable single-host compose stack.

---

### Issue 388 — Graceful shutdown & container signal handling
**Description:** Ensure `apps/api`'s Fastify process handles `SIGTERM` by draining in-flight requests, closing DB/Redis connections, and exiting cleanly within a bounded grace period; verify Docker's default signal forwarding reaches the Node process (correct `ENTRYPOINT` exec form, no shell-wrapping PID 1 issues).
**Objective:** Avoid dropped requests and connection leaks during rolling deploys or container restarts.
**Acceptance Criteria:** Sending `SIGTERM` to the container stops accepting new requests, completes in-flight ones, and exits within the configured grace period; process is PID 1 and receives the signal directly (no zombie/orphan issue).
**Dependencies:** 381
**Estimated Complexity:** S
**Files Affected:** `apps/api/main.ts`, `apps/api/Dockerfile`
**Tests Required:** Integration test sending `SIGTERM` mid-request and asserting the response still completes; container-level test asserting exit code and timing.
**Documentation Required:** `docs/guides/deployment.md` graceful-shutdown section.
**Educational Notes:** The PID 1 problem in containers — why shell-form `CMD`/`ENTRYPOINT` swallows signals, and why graceful shutdown is a prerequisite for zero-downtime deploys.
**Deliverables:** Verified graceful shutdown behavior.

---

### Issue 389 — Environment configuration matrix (dev/test/staging/production)
**Description:** A documented matrix mapping every environment variable from Issue 007's config schema to its expected value/source per environment (dev/test/staging/production), including which are secrets (vault/secret-manager-sourced) vs. plain config.
**Objective:** Give operators and contributors a single source of truth for what must be set where, preventing misconfigured deploys.
**Acceptance Criteria:** Matrix covers every variable in `packages/config/schema.ts`; secrets clearly flagged as such; matrix kept in sync via a CI check that fails if the schema and matrix diverge.
**Dependencies:** 007
**Estimated Complexity:** S
**Files Affected:** `docs/guides/deployment.md` environment-matrix section, `infra/ci/check-env-matrix.ts`
**Tests Required:** CI check diffing `packages/config/schema.ts` keys against the documented matrix.
**Documentation Required:** This issue's deliverable is the matrix itself.
**Educational Notes:** Why environment-variable drift between docs and code is a common source of production incidents, and how a CI-enforced sync check keeps documentation honest.
**Deliverables:** Enforced, current environment configuration matrix.

---

### Issue 390 — `.env.example` per-environment templates
**Description:** Split the single `.env.example` from Issue 013 into `.env.example` (dev), `.env.test.example`, and `.env.staging.example`/`.env.production.example` templates, each populated with safe placeholder values and inline comments referencing Issue 389's matrix.
**Objective:** Reduce first-run friction and misconfiguration risk across environments beyond local dev.
**Acceptance Criteria:** Each template loads successfully through the Zod config schema with placeholder values substituted; comments cross-reference the environment matrix; no real secrets committed.
**Dependencies:** 389
**Estimated Complexity:** XS
**Files Affected:** `.env.example`, `.env.test.example`, `.env.staging.example`, `.env.production.example`
**Tests Required:** CI check loading each template through the config schema in permissive/placeholder mode.
**Documentation Required:** `docs/guides/deployment.md` env-template section.
**Educational Notes:** Twelve-factor config principle extended across environments — templates as executable documentation, not just comments.
**Deliverables:** Environment-specific config templates.

---

### Issue 391 — Secrets management guidance & provider abstraction
**Description:** Document (and lightly abstract via a `SecretsSource` port) how production secrets are sourced — environment injection from a secret manager (e.g. AWS Secrets Manager, Doppler, Vault) rather than committed files — with a local no-op adapter reading from `.env` for dev.
**Objective:** Prevent secrets from ever needing to live in the repository or plain compose files in production, while keeping local dev friction-free.
**Acceptance Criteria:** `SecretsSource` port defined; dev adapter reads `.env`; documented integration pattern for at least one real secret manager; no production secret ever required in a committed file.
**Dependencies:** 007, 389
**Estimated Complexity:** M
**Files Affected:** `packages/config/secrets-source.ts`, `docs/guides/deployment.md` secrets section
**Tests Required:** Unit tests for the dev adapter; contract test the port must satisfy.
**Documentation Required:** This issue's deliverable is the guidance doc itself.
**Educational Notes:** Why "secrets as environment variables sourced from a manager" beats "secrets in a committed encrypted file" — rotation, audit trail, and blast-radius arguments.
**Deliverables:** Documented, port-abstracted secrets strategy.

---

### Issue 392 — Migrations-on-deploy: `prisma migrate deploy` job
**Description:** A dedicated migration step (compose one-shot service and/or CI deploy job) running `prisma migrate deploy` against the target database before the API container starts, distinct from the `prisma migrate dev` flow used locally.
**Objective:** Ensure schema migrations run deterministically and separately from application startup, avoiding race conditions when multiple API replicas boot simultaneously.
**Acceptance Criteria:** Migration job runs to completion and exits before any API replica begins accepting traffic; running it twice in a row is a no-op; migration failures block the deploy rather than starting the API against a stale schema.
**Dependencies:** 381
**Estimated Complexity:** M
**Files Affected:** `infra/docker/scripts/migrate.sh`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml`
**Tests Required:** CI test running the migration job twice and asserting idempotency; test asserting API container waits for migration completion.
**Documentation Required:** `docs/guides/deployment.md` migrations-on-deploy section.
**Educational Notes:** Why `migrate deploy` (not `migrate dev`) is the correct production command, and why running migrations as a separate pre-start step avoids the "N replicas all racing to migrate" failure mode.
**Deliverables:** Deterministic, race-free migration-on-deploy step.

---

### Issue 393 — Migration rollback & forward-only migration policy
**Description:** Document and tool-check Verixa's forward-only migration policy (no destructive down-migrations relied upon in production), including a documented procedure for correcting a bad migration via a new forward migration rather than reverting.
**Objective:** Avoid the common footgun of relying on auto-generated down-migrations, which are frequently lossy or untested.
**Acceptance Criteria:** Policy documented; a lint/CI check flags migrations that drop columns/tables without an accompanying documented data-preservation note; example "fix-forward" migration included as a template.
**Dependencies:** 392
**Estimated Complexity:** S
**Files Affected:** `infra/ci/check-migration-safety.ts`, `docs/guides/deployment.md` migration-policy section
**Tests Required:** CI check test against a fixture migration with an undocumented destructive change.
**Documentation Required:** This issue's deliverable is the policy doc itself.
**Educational Notes:** Why "roll forward, don't roll back" is the safer default for production databases — down-migrations are rarely exercised and often silently broken by the time they're needed.
**Deliverables:** Enforced forward-only migration policy.

---

### Issue 394 — Zero-downtime migration compatibility checklist
**Description:** A checklist and CI advisory check (not hard-blocking) for expand/contract migration patterns (add-nullable-column-first, backfill, then enforce constraint in a later deploy) so schema changes stay compatible with the previous API version during a rolling deploy window.
**Objective:** Prevent a deploy from breaking the still-running previous-version replicas during a rolling update.
**Acceptance Criteria:** Checklist documented with concrete before/after migration examples; CI check flags migrations that add a `NOT NULL` column without a default in a single step, with guidance to split it.
**Dependencies:** 392, 393
**Estimated Complexity:** M
**Files Affected:** `infra/ci/check-migration-safety.ts`, `docs/guides/deployment.md` zero-downtime section
**Tests Required:** CI check test against fixture migrations covering compatible and incompatible patterns.
**Documentation Required:** This issue's deliverable is the checklist itself.
**Educational Notes:** The expand/contract pattern for schema evolution — why "old code, new schema" must always be a valid combination during a rolling deploy.
**Deliverables:** Documented and partially-enforced zero-downtime migration pattern.

---

### Issue 395 — Deployment guide: single-host (docker-compose) path
**Description:** End-to-end `docs/guides/deployment.md` walkthrough for deploying Verixa on a single host via `docker-compose.prod.yml`: provisioning, environment setup (Issue 389/390), TLS (Issue 387), migrations (Issue 392), and backup (Issue 386).
**Objective:** Give a solo operator or small team a complete, tested path from a bare VM to a running production instance.
**Acceptance Criteria:** Following the guide on a fresh VM (or CI-simulated equivalent) results in a running, HTTPS-served, migrated instance; every step traceable to a concrete command.
**Dependencies:** 386, 387, 390, 392
**Estimated Complexity:** M
**Files Affected:** `docs/guides/deployment.md`
**Tests Required:** CI job simulating the guide's steps end-to-end against a fresh container/VM image.
**Documentation Required:** This issue's deliverable is the guide itself.
**Educational Notes:** Runbook-as-tested-documentation — why a deployment guide that isn't exercised in CI silently rots.
**Deliverables:** Verified single-host deployment guide.

---

### Issue 396 — Deployment guide: platform-as-a-service path
**Description:** A second `docs/guides/deployment.md` path documenting deployment to a managed container platform (e.g. Fly.io, Render, or Railway — one chosen as the documented reference), including managed Postgres/Redis wiring and the Issue 392 migration step as a release-phase hook.
**Objective:** Offer a lower-ops-burden path for contributors who don't want to manage a VM directly.
**Acceptance Criteria:** Guide results in a working deployed instance on the chosen platform; migration-on-deploy hook documented using that platform's release-phase mechanism; environment matrix (Issue 389) mapped to the platform's secret/env UI.
**Dependencies:** 389, 392
**Estimated Complexity:** M
**Files Affected:** `docs/guides/deployment.md`, `infra/docker/platform.toml` (or platform-specific manifest)
**Tests Required:** Manual verification checklist (platform deploys typically aren't fully CI-simulable); smoke-test script hitting the deployed `/health` endpoint.
**Documentation Required:** This issue's deliverable is the guide itself.
**Educational Notes:** Trade-offs between self-managed and PaaS deployment — operational burden vs. control, and why documenting both paths serves different contributor needs.
**Deliverables:** Verified PaaS deployment path.

---

### Issue 397 — Container image publishing & tagging strategy
**Description:** CI workflow publishing `apps/api` images to a container registry (GitHub Container Registry) on merge to main and on tagged releases, following a documented tagging scheme (`:sha-<shortsha>`, `:latest` for main, `:vX.Y.Z` for releases), integrating Issue 383's multi-arch build.
**Objective:** Give every commit and release a pullable, traceable, immutable image reference for deployment automation to consume.
**Acceptance Criteria:** Every merge to main publishes a `sha`-tagged image; tagged releases publish `vX.Y.Z` and update `latest`; images are immutable (never overwritten under the same sha tag).
**Dependencies:** 383
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/docker-publish.yml`
**Tests Required:** CI test asserting the workflow produces the expected tag set on a simulated push/tag event.
**Documentation Required:** `docs/guides/deployment.md` image-tagging section.
**Educational Notes:** Why immutable, content-addressable-ish tags (sha-based) beat mutable `:latest`-only tagging for reproducible deploys and rollback.
**Deliverables:** Automated, traceable image publishing.

---

### Issue 398 — Rollback procedure & previous-image redeploy drill
**Description:** Documented and scripted rollback procedure: redeploying the previous known-good image tag (per Issue 397's scheme) without running new migrations, plus a "rollback drill" CI job proving it works against a sample deploy.
**Objective:** Ensure a bad deploy can be reverted quickly and confidently, a prerequisite for any team trusting the deployment pipeline.
**Acceptance Criteria:** Rollback script accepts a target tag and redeploys it; drill proves rollback restores the previous version's `/health`/version response; procedure explicitly notes when a migration makes rollback unsafe (ties to Issue 394's compatibility checklist).
**Dependencies:** 394, 397
**Estimated Complexity:** S
**Files Affected:** `infra/docker/scripts/rollback.sh`, `docs/guides/deployment.md` rollback section
**Tests Required:** CI drill deploying tag A, then B, then rolling back to A and asserting the version response matches.
**Documentation Required:** This issue's deliverable is the rollback procedure itself.
**Educational Notes:** Why "can we roll back" is as important a deployment property as "can we deploy," and how schema-compatible migrations (Issue 394) are what make rollback actually safe.
**Deliverables:** Tested, documented rollback procedure.

---

### Issue 399 — Container security scanning gate
**Description:** CI job scanning built `apps/api` images (Trivy or Grype) for known CVEs in OS packages and dependencies, gating merges on no unresolved critical/high findings, with a documented exception/waiver process for accepted-risk findings.
**Objective:** Catch vulnerable base images or transitive dependencies before they reach production, extending Issue 381's hardened image with continuous verification.
**Acceptance Criteria:** Scan runs on every image build; critical/high findings block merge unless explicitly waived with a documented justification and expiry; scan results archived as CI artifacts.
**Dependencies:** 381, 397
**Estimated Complexity:** M
**Files Affected:** `.github/workflows/docker-publish.yml`, `infra/ci/trivyignore.yaml`
**Tests Required:** CI test asserting the gate fails against a fixture image with a known-critical CVE.
**Documentation Required:** `docs/security/` container-scanning section, waiver process.
**Educational Notes:** Why scanning the built artifact (not just `npm audit` on source) catches OS-level and base-image vulnerabilities that dependency scanning alone misses.
**Deliverables:** Enforced container vulnerability scanning gate.

---

### Issue 400 — Deployment infra tutorial & phase closeout
**Description:** `docs/guides/tutorials/deploying-verixa.md` walking a reader from a fresh clone through building, publishing, migrating, and deploying Verixa via both the single-host (Issue 395) and PaaS (Issue 396) paths, tying together every issue in this phase into one coherent narrative; final review of `infra/docker/` and `infra/ci/` for consistency.
**Objective:** Deliver the phase's educational capstone and confirm the deployment infrastructure is coherent end-to-end, closing out Phase 20.
**Acceptance Criteria:** Tutorial links every claim to real scripts/config from Issues 381–399; a fresh reader following it can reach a deployed, migrated, HTTPS-served, monitored instance; no orphaned or contradictory config left across `infra/docker/` and `docker-compose*.yml`.
**Dependencies:** 381–399
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/deploying-verixa.md`, `infra/docker/`, `infra/ci/`
**Tests Required:** CI job executing the tutorial's commands end-to-end where feasible.
**Documentation Required:** This issue's deliverable is the tutorial itself.
**Educational Notes:** Why a capstone deployment walkthrough — connecting build, config, migration, and rollback into one story — cements understanding better than the sum of its isolated issues.
**Deliverables:** Published deployment tutorial and a verified, internally consistent deployment infrastructure.

---
