# Phase 18 — Observability (Issues 341–360)

Extends Issue 008's pino logger with correlation IDs and a request-context foundation, adds a Prometheus metrics endpoint and OpenTelemetry tracing hooks, delivers liveness/readiness checks, and ships dashboards-as-code for the whole platform.

---

### Issue 341 — Request-context foundation via `AsyncLocalStorage`
**Description:** `packages/observability/infrastructure/request-context.ts` wrapping Node's `AsyncLocalStorage` to carry a per-request context object (correlation ID, trace ID, actor ID once authenticated) across async boundaries without threading it through every function signature.
**Objective:** Establish the propagation mechanism every other issue in this phase (correlation IDs, log enrichment, trace linkage) depends on.
**Acceptance Criteria:** Context set at request entry is readable from any nested async call within that request; contexts from concurrent requests never leak into each other (verified under concurrent load); accessing context outside a request returns a safe default, not a throw.
**Dependencies:** None
**Estimated Complexity:** M
**Files Affected:** `packages/observability/infrastructure/request-context.ts`, `packages/observability/domain/request-context.ts`
**Tests Required:** Unit tests for context isolation under concurrent async operations; test asserting no context leakage across interleaved requests.
**Documentation Required:** `docs/guides/observability.md` (new) request-context section.
**Educational Notes:** Why thread-local-style storage (`AsyncLocalStorage`) beats manually passing a context object through every function — and the concurrency pitfalls of global mutable state it must avoid.
**Deliverables:** Tested, leak-free request-context primitive.

---

### Issue 342 — Correlation ID generation & Fastify hook
**Description:** `onRequest` Fastify hook generating a correlation ID (or accepting a caller-supplied `X-Request-Id`, validated as a UUID) at request entry, storing it in Issue 341's request context, and echoing it back on the response.
**Objective:** Give every request a stable identifier that ties together its logs, metrics, and traces.
**Acceptance Criteria:** Every response includes `X-Request-Id`; a caller-supplied ID is reused if valid, otherwise a fresh UUID is generated; malformed inbound IDs are rejected (regenerated) rather than trusted verbatim.
**Dependencies:** 341
**Estimated Complexity:** S
**Files Affected:** `apps/api/plugins/correlation-id.ts`
**Tests Required:** Integration tests for generated vs. supplied IDs, malformed-ID rejection, response header presence.
**Documentation Required:** `docs/guides/observability.md` correlation-ID section.
**Educational Notes:** Why inbound trace/correlation headers must be validated, not trusted blindly — an unvalidated header is an injection vector into logs and downstream systems.
**Deliverables:** Tested correlation-ID hook.

---

### Issue 343 — Correlation ID propagation to outbound calls & background jobs
**Description:** Extend Issue 342's correlation ID onto outbound HTTP calls (notifications, verification adapters) as a forwarded header, and onto any deferred/background work (e.g. Phase 09's notification dispatch) so async work started by a request remains traceable to it.
**Objective:** Preserve the request's identity across process and call boundaries, not just within the originating request's lifetime.
**Acceptance Criteria:** Outbound HTTP clients automatically attach the current correlation ID header; background job payloads carry the originating correlation ID; jobs with no originating request get a freshly generated ID, never `undefined`.
**Dependencies:** 342, and Phase 09's notification dispatch
**Estimated Complexity:** M
**Files Affected:** `packages/observability/infrastructure/http-client-correlation.ts`, `packages/notifications/infrastructure/job-correlation.ts`
**Tests Required:** Integration tests asserting outbound headers and job payloads carry the correct ID across boundary types.
**Documentation Required:** `docs/guides/observability.md` propagation section.
**Educational Notes:** Why correlation loses value the moment it stops at a process boundary — end-to-end traceability requires deliberate propagation, it is never automatic.
**Deliverables:** Correlation ID propagated across outbound calls and async jobs.

---

### Issue 344 — Pino logger contextual bindings & field taxonomy
**Description:** Extend Issue 008's base pino logger with automatic per-log bindings (correlation ID, trace ID, route, actor ID) pulled from Issue 341's request context, and a documented, enforced field-name taxonomy (`req.id`, `actor.id`, `event.name`, etc.) so logs are machine-parseable across contexts.
**Objective:** Turn ad hoc per-call-site logging into consistently structured, queryable log lines without repeating boilerplate at every call site.
**Acceptance Criteria:** Every log emitted during a request automatically includes correlation ID and route without the caller passing them explicitly; a lint rule or test flags log calls using non-taxonomy field names.
**Dependencies:** 008, 341, 342
**Estimated Complexity:** M
**Files Affected:** `packages/observability/infrastructure/logger.ts`, `packages/observability/domain/log-fields.ts`
**Tests Required:** Unit tests verifying automatic binding injection; taxonomy-conformance test over sample log calls.
**Documentation Required:** `docs/guides/observability.md` structured-logging field reference.
**Educational Notes:** Why a shared field taxonomy is what makes "structured logging" actually queryable at scale — inconsistent field names defeat the purpose of structured logs in log-aggregation tooling.
**Deliverables:** Context-enriched, taxonomy-conformant logger.

---

### Issue 345 — Log redaction extension for observability fields
**Description:** Extend Issue 008's existing secret-redaction config to cover new fields introduced by this phase (trace/span IDs are safe to log, but any inadvertently-logged tokens, headers, or PII carried in request context must still be redacted).
**Objective:** Ensure the richer per-request context introduced by Issues 341–344 doesn't reopen a secrets-in-logs risk the base logger already closed.
**Acceptance Criteria:** Redaction test suite extended to cover request-context fields; a deliberately-added sensitive field (e.g. `authorization` header) is verified redacted in log output, not just in isolated unit fixtures.
**Dependencies:** 008, 344
**Estimated Complexity:** S
**Files Affected:** `packages/observability/infrastructure/logger.ts`, `packages/observability/infrastructure/redaction-paths.ts`
**Tests Required:** Regression tests asserting no sensitive field appears in serialized log output across representative request contexts.
**Documentation Required:** `docs/security/secrets-management.md` update (redaction paths list).
**Educational Notes:** Why every extension to what gets auto-logged must be paired with a redaction review — enrichment features are a common source of accidental secret leakage into logs.
**Deliverables:** Extended, tested redaction coverage.

---

### Issue 346 — Environment-based log level policy & runtime override
**Description:** `LogLevelPolicy` resolving the effective pino log level from Issue 007's typed config (per-environment defaults: `debug` in dev, `info` in production) plus a protected admin endpoint to raise verbosity temporarily for live debugging without a redeploy.
**Objective:** Balance log volume/cost against the need for deeper visibility during incident investigation.
**Acceptance Criteria:** Default levels differ correctly by environment; the override endpoint requires an authenticated admin/governance role (Phase 08); overrides are time-bounded and automatically revert; override changes are audit-logged.
**Dependencies:** 007, 344, and Phase 08's admin authorization
**Estimated Complexity:** S
**Files Affected:** `packages/observability/application/log-level-policy.ts`, `apps/api/interface/routes/admin/log-level.ts`
**Tests Required:** Unit tests for environment defaults; integration tests for override authorization, expiry, and audit emission.
**Documentation Required:** `docs/guides/observability.md` log-level operations section.
**Educational Notes:** Why a temporary, audited, auto-reverting override beats leaving debug logging permanently on — verbosity has both a cost and an information-disclosure surface.
**Deliverables:** Tested, auditable log-level control.

---

### Issue 347 — Metrics port abstraction
**Description:** `MetricsRecorder` port in `packages/observability/application/ports/metrics.ts` defining `incrementCounter`, `recordHistogram`, and `setGauge` operations, decoupling call sites from any specific metrics backend.
**Objective:** Let domain and application code emit metrics through a stable seam, mirroring the port pattern established for the rate limiter (Issue 074) and audit sink.
**Acceptance Criteria:** Port has no dependency on `prom-client` or any concrete backend; a no-op adapter satisfies it for unit tests; the port's shape supports labeled metrics (route, status code, etc.).
**Dependencies:** None
**Estimated Complexity:** S
**Files Affected:** `packages/observability/application/ports/metrics.ts`, `packages/observability/infrastructure/noop-metrics-recorder.ts`
**Tests Required:** Contract tests defining the port's expected behavior, satisfied by both adapters.
**Documentation Required:** `docs/guides/observability.md` metrics-port section.
**Educational Notes:** The same seam-first discipline as Issue 074 — defining the interface before the implementation keeps the metrics backend swappable and keeps domain code framework-agnostic.
**Deliverables:** Tested metrics port and no-op adapter.

---

### Issue 348 — Prometheus `prom-client` adapter
**Description:** `PrometheusMetricsRecorder` implementing Issue 347's port using `prom-client`, registering counters/histograms/gauges in a shared registry and exposing it for scraping.
**Objective:** Deliver the concrete production metrics backend behind the stable port.
**Acceptance Criteria:** Adapter passes the same contract tests as the no-op adapter; metric names/labels follow Prometheus naming conventions (`verixa_http_request_duration_seconds`, etc.); registry is a singleton shared across the app.
**Dependencies:** 347
**Estimated Complexity:** M
**Files Affected:** `packages/observability/infrastructure/prometheus-metrics-recorder.ts`
**Tests Required:** Contract tests shared with the no-op adapter; unit tests for label cardinality guards (rejecting unbounded label values like raw user IDs).
**Documentation Required:** `docs/guides/observability.md` Prometheus adapter section.
**Educational Notes:** Prometheus naming/labeling conventions, and why unbounded label cardinality (e.g. labeling by user ID) silently degrades a metrics backend — a common production incident class.
**Deliverables:** Tested, port-conformant Prometheus adapter.

---

### Issue 349 — HTTP request metrics middleware
**Description:** Fastify `onResponse` hook recording request duration (histogram), request count (counter), and in-flight requests (gauge), labeled by route template (not raw path, to bound cardinality), method, and status code class.
**Objective:** Provide the baseline "golden signal" HTTP metrics (latency, traffic, errors, saturation) for every route automatically, without per-route instrumentation code.
**Acceptance Criteria:** Metrics recorded for every route without per-handler code changes; route label uses the Fastify route schema (`/users/:id`), never the raw interpolated path; verified against a running app with representative traffic.
**Dependencies:** 348
**Estimated Complexity:** M
**Files Affected:** `apps/api/plugins/http-metrics.ts`
**Tests Required:** Integration tests asserting metric values after known request patterns (counts, status classes, latency buckets present).
**Documentation Required:** `docs/guides/observability.md` HTTP metrics reference.
**Educational Notes:** The "four golden signals" (latency, traffic, errors, saturation) as the minimum useful metrics surface for any HTTP service, per the Google SRE book.
**Deliverables:** Tested, cardinality-safe HTTP metrics middleware.

---

### Issue 350 — Business/domain metrics emitters
**Description:** Instrument key domain events (login success/failure, MFA verification, rate-limit exceeded from Phase 15, audit event ingestion from Phase 10) with counters via Issue 347's port, emitted from application-layer use cases rather than the transport layer.
**Objective:** Make security- and product-relevant events visible in dashboards and alertable, not just recoverable from logs after the fact.
**Acceptance Criteria:** Each instrumented use case increments its counter exactly once per outcome, verified with unit tests using the no-op recorder's call-capture; metric names documented in a central catalog.
**Dependencies:** 347, and the Phase 04/06/15 use cases being instrumented
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/application/use-cases/authenticate-with-password.ts`, `packages/rate-limiting/application/*`, `packages/observability/domain/metric-catalog.ts`
**Tests Required:** Unit tests asserting the correct metric name/labels are recorded for each outcome branch.
**Documentation Required:** `docs/guides/observability.md` metric catalog.
**Educational Notes:** Why business metrics belong at the application layer next to the decision being made, not bolted on afterward in a middleware that can't see domain-level outcomes.
**Deliverables:** Instrumented critical use cases with a documented metric catalog.

---

### Issue 351 — `GET /metrics` endpoint with access control
**Description:** Fastify route exposing Issue 348's Prometheus registry in text-exposition format, protected by an IP allowlist (reusing Issue 289's allowlist config) or a bearer token for scrape authentication, and exempted from Phase 15 rate limiting.
**Objective:** Let a Prometheus server (or compatible scraper) pull metrics without exposing internal counters to arbitrary internet traffic.
**Acceptance Criteria:** Endpoint returns valid Prometheus exposition format; unauthenticated/non-allowlisted requests receive 403; endpoint bypasses rate limiting per Issue 289's allowlist mechanism.
**Dependencies:** 289, 348
**Estimated Complexity:** S
**Files Affected:** `apps/api/interface/routes/metrics.ts`
**Tests Required:** Integration tests for authorized scrape success and unauthorized-access rejection.
**Documentation Required:** `docs/guides/observability.md` metrics-endpoint operations section.
**Educational Notes:** Why an unauthenticated metrics endpoint is an information-disclosure risk (internal request rates, error rates, and route topology are reconnaissance value) even though it carries no user data.
**Deliverables:** Tested, access-controlled metrics endpoint.

---

### Issue 352 — OpenTelemetry SDK bootstrap & resource attributes
**Description:** `packages/observability/infrastructure/otel-bootstrap.ts` initializing the OpenTelemetry Node SDK at process start (before any other module is `require`d, per OTel's instrumentation-hook requirement), setting resource attributes (service name, version, environment, deployment ID).
**Objective:** Establish the tracing foundation as a first-class startup concern, not an afterthought bolted onto an already-running process.
**Acceptance Criteria:** SDK initializes before application modules load (verified via a load-order test/smoke check); resource attributes appear on every emitted span; SDK is disabled cleanly in test environments to avoid noisy CI output.
**Dependencies:** 007
**Estimated Complexity:** M
**Files Affected:** `packages/observability/infrastructure/otel-bootstrap.ts`, `apps/api/instrumentation.ts`
**Tests Required:** Smoke test asserting SDK is active and resource attributes are set; test asserting no-op behavior in the test environment.
**Documentation Required:** `docs/guides/observability.md` OpenTelemetry bootstrap section.
**Educational Notes:** Why OpenTelemetry auto-instrumentation requires being loaded before the modules it patches — a require-order constraint that trips up most first attempts at adding tracing to an existing app.
**Deliverables:** Correctly-ordered OTel bootstrap.

---

### Issue 353 — Auto-instrumentation for Fastify, Prisma, Redis, and outbound HTTP
**Description:** Register OpenTelemetry auto-instrumentation packages for Fastify, Prisma, ioredis/node-redis, and undici/fetch, so spans are created automatically for HTTP requests, DB queries, cache calls, and outbound HTTP without manual span code at each call site.
**Objective:** Get broad tracing coverage across the stack's I/O boundaries with minimal hand-written instrumentation.
**Acceptance Criteria:** A single request touching HTTP entry, a DB query, and a Redis call produces a connected trace with child spans for each; span attributes include the operation (query text redacted/parameterized, not raw SQL with values).
**Dependencies:** 352
**Estimated Complexity:** M
**Files Affected:** `packages/observability/infrastructure/otel-bootstrap.ts`, `apps/api/instrumentation.ts`
**Tests Required:** Integration test asserting a multi-hop request produces a single trace with the expected span tree.
**Documentation Required:** `docs/guides/observability.md` auto-instrumentation coverage table.
**Educational Notes:** Auto-instrumentation vs. manual instrumentation trade-off — broad coverage for free at the cost of coarser-grained, library-defined span boundaries.
**Deliverables:** Tested auto-instrumentation covering the stack's main I/O boundaries.

---

### Issue 354 — Manual spans for critical use-case flows
**Description:** Hand-instrument business-critical, multi-step use cases (password authentication with MFA, verification workflow submission) with explicit child spans marking domain-meaningful steps (e.g. "credential-check", "mfa-verify", "session-issue") that auto-instrumentation can't infer.
**Objective:** Make the parts of a trace that matter most for debugging auth/verification incidents legible, not just a flat list of DB/HTTP spans.
**Acceptance Criteria:** Traced flows show named child spans matching the use case's actual steps; span attributes carry outcome (success/failure reason) without leaking secrets; instrumentation wraps the use case without altering its return type or control flow.
**Dependencies:** 353, and the Phase 04/06 use cases being instrumented
**Estimated Complexity:** M
**Files Affected:** `packages/credentials/application/use-cases/authenticate-with-password.ts`, `packages/observability/infrastructure/traced.ts`
**Tests Required:** Integration tests asserting expected span names/attributes appear for success and failure paths.
**Documentation Required:** `docs/guides/observability.md` manual-instrumentation guidance.
**Educational Notes:** Why the most valuable spans in a trace are usually hand-placed at domain decision points, not auto-generated at I/O boundaries — tracing is most useful when it mirrors the mental model of the flow being debugged.
**Deliverables:** Instrumented, domain-legible traces for critical flows.

---

### Issue 355 — Correlation ID ↔ trace ID linkage
**Description:** Bind the OpenTelemetry trace ID into Issue 341's request context alongside the correlation ID, include both in every structured log line (Issue 344), and echo the trace ID on error responses so a support request ("here's my request ID") resolves directly to both logs and a trace.
**Objective:** Unify the three observability pillars (logs, metrics, traces) around one navigable identifier per request instead of three disconnected systems.
**Acceptance Criteria:** Every log line during a traced request includes both `correlationId` and `traceId`; given either ID, an operator can locate the corresponding trace and all matching log lines; documented in the incident-response runbook.
**Dependencies:** 342, 344, 353
**Estimated Complexity:** S
**Files Affected:** `packages/observability/infrastructure/request-context.ts`, `packages/observability/infrastructure/logger.ts`
**Tests Required:** Integration test asserting log output for a traced request includes a valid, matching trace ID.
**Documentation Required:** `docs/guides/observability.md` "pillars" cross-linking section; `docs/runbooks/incident-response.md` update.
**Educational Notes:** The "three pillars of observability" (logs, metrics, traces) deliver far more value linked together than in isolation — this issue is where that linkage actually happens, not just where it's theorized.
**Deliverables:** Logs and traces navigable from a single shared identifier.

---

### Issue 356 — OTLP exporter configuration & sampling policy
**Description:** Configure the OpenTelemetry SDK's OTLP exporter (collector-agnostic, works with Jaeger/Tempo/vendor collectors) via Issue 007's typed config, with a configurable sampling policy (always-on in dev, probabilistic/tail-based-ready in production) to bound trace volume and cost.
**Objective:** Make tracing exportable to any OTLP-compatible backend without vendor lock-in, and keep production trace volume economically sane.
**Acceptance Criteria:** Exporter endpoint/protocol configurable via env vars; invalid exporter config fails fast at startup; sampling rate is configurable and defaults to 100% in dev, a documented lower rate in production; errors always force-sampled regardless of rate.
**Dependencies:** 007, 352
**Estimated Complexity:** S
**Files Affected:** `packages/observability/infrastructure/otel-bootstrap.ts`, `packages/config/schema.ts`, `.env.example`
**Tests Required:** Config validation tests; unit test asserting error spans are always sampled.
**Documentation Required:** `docs/guides/observability.md` exporter/sampling operations section.
**Educational Notes:** Why 100% trace sampling doesn't scale economically in production, and why "always sample errors" is the standard exception that keeps the signal you need most.
**Deliverables:** Configurable, cost-aware trace export.

---

### Issue 357 — Liveness endpoint (`GET /health/live`)
**Description:** Minimal liveness endpoint returning 200 as long as the process event loop is responsive, with no dependency checks (no DB/Redis calls) — purely "is this process alive and not deadlocked."
**Objective:** Give orchestrators (Kubernetes, load balancers) a cheap, dependency-free signal for whether to restart the container, distinct from readiness.
**Acceptance Criteria:** Endpoint responds in well under typical probe timeouts even under moderate load; never calls out to DB/Redis/external services; excluded from rate limiting and auth via Issue 289's allowlist.
**Dependencies:** 289
**Estimated Complexity:** XS
**Files Affected:** `apps/api/interface/routes/health/live.ts`
**Tests Required:** Integration test asserting fast, dependency-free 200 response.
**Documentation Required:** `docs/guides/observability.md` health-check semantics section.
**Educational Notes:** The liveness/readiness distinction from Kubernetes health-check semantics — conflating them causes cascading restarts when a dependency (not the process itself) is unhealthy.
**Deliverables:** Tested liveness endpoint.

---

### Issue 358 — Readiness endpoint with dependency checks (`GET /health/ready`)
**Description:** Readiness endpoint checking Postgres and Redis connectivity (lightweight ping/query with a short timeout) and reporting per-dependency status, returning 200 only when all required dependencies are reachable.
**Objective:** Let orchestrators route traffic only to instances that can actually serve requests, and detect degraded-dependency states distinct from "process is alive."
**Acceptance Criteria:** Returns 503 with per-dependency detail when any required dependency is unreachable; checks have a bounded timeout so a hanging dependency doesn't hang the probe itself; excluded from rate limiting via Issue 289's allowlist.
**Dependencies:** 289, 357
**Estimated Complexity:** S
**Files Affected:** `apps/api/interface/routes/health/ready.ts`, `packages/observability/application/health-check-registry.ts`
**Tests Required:** Integration tests for all-healthy, one-dependency-down, and dependency-timeout scenarios.
**Documentation Required:** `docs/guides/observability.md` readiness-check operations section.
**Educational Notes:** Why readiness checks must bound their own timeout — an unbounded dependency check turns a slow dependency into a probe failure storm across every instance simultaneously.
**Deliverables:** Tested, timeout-bounded readiness endpoint.

---

### Issue 359 — Dashboards-as-code
**Description:** Grafana dashboard definitions authored as versioned JSON/jsonnet in `infra/observability/dashboards/`, provisioned automatically into a local Grafana instance via `docker-compose` (reusing Issue 052-style local infra patterns), covering HTTP golden signals, business metrics from Issue 350, and health-check status.
**Objective:** Treat dashboards as reviewable, version-controlled artifacts rather than manually clicked-together Grafana state that drifts and is never reproducible.
**Acceptance Criteria:** `docker-compose up` provisions Grafana with all dashboards present and populated from live metrics; dashboard JSON changes go through the same PR review as code; at minimum one dashboard per golden signal category plus one for business metrics.
**Dependencies:** 349, 350, 351
**Estimated Complexity:** M
**Files Affected:** `infra/observability/dashboards/http-golden-signals.json`, `infra/observability/dashboards/business-metrics.json`, `infra/docker/docker-compose.observability.yml`, `infra/observability/grafana-provisioning/`
**Tests Required:** Compose smoke test asserting Grafana starts with dashboards provisioned and datasource connected.
**Documentation Required:** `docs/guides/observability.md` dashboards-as-code section.
**Educational Notes:** Why "dashboards-as-code" matters for the same reason infra-as-code does — reproducibility, reviewability, and the ability to recreate observability tooling from scratch after a disaster.
**Deliverables:** Version-controlled, provisioned Grafana dashboards.

---

### Issue 360 — `packages/observability` composition wiring, coverage gate & tutorial
**Description:** Wire the logger, metrics recorder, OTel bootstrap, and health-check registry into `apps/api`'s composition root and environment config; apply Issue 037's coverage-gate pattern and Issue 038's public-API-surface pattern to `packages/observability`; write `docs/guides/tutorials/adding-observability-to-a-service.md` walking through correlation IDs, metrics, tracing, and health checks as one coherent story.
**Objective:** Close out Phase 18 the way prior cross-cutting phases closed out — a single coherent composition-root concern, an enforced quality gate, and a published educational artifact tying the phase together.
**Acceptance Criteria:** `apps/api` boots with logging, metrics, tracing, and health checks active by default in all environments except test (which uses no-op adapters); coverage gate passing for `packages/observability`; only intended ports/adapters exported from `index.ts`; tutorial links every claim to real code/tests from Issues 341–359.
**Dependencies:** 037, 038, 341–359
**Estimated Complexity:** M
**Files Affected:** `apps/api/composition/observability.ts`, `apps/api/app.ts`, `packages/observability/index.ts`, `packages/observability/vitest.config.ts`, `.eslintrc.cjs`, `docs/guides/tutorials/adding-observability-to-a-service.md`, `.env.example`
**Tests Required:** Startup smoke test verifying all observability plugins register; lint rule verification for the curated export surface.
**Documentation Required:** This issue's deliverable is the tutorial itself, plus final `docs/guides/observability.md` consolidation pass.
**Educational Notes:** Composition-root wiring as the single place cross-cutting concerns become "real," consistent with the pattern established across all prior phases — observability is only as good as its default-on wiring, not its theoretical availability.
**Deliverables:** Fully wired, coverage-gated `packages/observability` with a published tutorial.

---
