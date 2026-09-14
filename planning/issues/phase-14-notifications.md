# Phase 14 — Notifications & Messaging (Issues 261–280)

Builds `packages/notifications`: domain events → templated, retried, multi-channel
delivery (email/SMS/webhook) with user-controlled preferences, finally implementing
the email-sending capability that credential flows (Issues 068–070) deferred to it.

---

### Issue 261 — Notification domain model: `Notification` and `NotificationChannel`
**Description:** Define the `Notification` entity (`id`, `recipientId`, `templateKey`, `channel` — `email`/`sms`/`webhook`, `payload` data for templating, `status` — `pending`/`sent`/`failed`/`suppressed`, `organizationId`) and a `NotificationChannel` value object enumerating supported channels.
**Objective:** Establish a single notification shape before any adapter or delivery logic exists.
**Acceptance Criteria:** `Notification` immutable once constructed except for status transitions via explicit methods; invalid channel/status transitions rejected; unit tests cover construction and transition rules.
**Dependencies:** 004, 005, 006
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/domain/entities/notification.ts`, `packages/notifications/domain/value-objects/notification-channel.ts`
**Tests Required:** Unit tests for construction, valid/invalid status transitions.
**Documentation Required:** `docs/guides/domain-modeling.md` notifications section.
**Educational Notes:** Modeling delivery state as an explicit finite state machine (`pending → sent | failed | suppressed`) rather than a loose string field prevents impossible states like "sent" reverting to "pending."
**Deliverables:** Tested `Notification` domain model.

---

### Issue 262 — `NotificationTemplate` domain model and registry
**Description:** `NotificationTemplate` value object (`key`, `channel`, `subjectTemplate`/`bodyTemplate` or channel-appropriate equivalent, `requiredPayloadFields`) plus an in-process `TemplateRegistry` mapping template keys to definitions, validated at startup.
**Objective:** Decouple "what event triggers a notification" from "what that notification says," so template content can change without touching use-case code.
**Acceptance Criteria:** Registry rejects duplicate keys and templates missing required fields at startup; unit tests cover registry validation and lookup.
**Dependencies:** 261
**Estimated Complexity:** S
**Files Affected:** `packages/notifications/domain/entities/notification-template.ts`, `packages/notifications/domain/services/template-registry.ts`
**Tests Required:** Unit tests for registration, duplicate rejection, missing-field validation.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Registries as a lightweight alternative to a database-backed template store — appropriate when template content ships with code, not authored by end users.
**Deliverables:** Tested template registry.

---

### Issue 263 — Domain events: `NotificationRequested`, `NotificationSent`, `NotificationFailed`
**Description:** Define the notification lifecycle's own domain events, published via the in-process event bus (Issue 026), distinct from the upstream domain events (e.g. `PasswordResetRequested`) that trigger notifications in the first place.
**Objective:** Make notification delivery itself observable to downstream consumers (audit, metrics) without those consumers depending on delivery internals.
**Acceptance Criteria:** Each event carries enough context (notification id, channel, template key, timestamp, failure reason where applicable) for audit consumption; unit tests cover event shape.
**Dependencies:** 026, 261
**Estimated Complexity:** XS
**Files Affected:** `packages/notifications/domain/events/notification-requested.ts`, `notification-sent.ts`, `notification-failed.ts`
**Tests Required:** Unit tests for event construction.
**Documentation Required:** `docs/guides/domain-events.md` notifications section.
**Educational Notes:** Distinguishing "trigger events" (business events that happen to cause a notification) from "delivery events" (facts about the notification pipeline itself) — a common source of event-model confusion.
**Deliverables:** Tested notification lifecycle events.

---

### Issue 264 — `NotificationSender` port and `SendNotification` use case
**Description:** Application-layer port `NotificationSender` (`send(notification): Promise<DeliveryResult>`) implemented per channel by infrastructure adapters, plus a `SendNotification` use case that resolves the template, renders it, selects the channel adapter, and records the outcome.
**Objective:** Provide the single controlled entry point through which every notification is dispatched, keeping channel-specific detail out of application logic.
**Acceptance Criteria:** Use case renders template before dispatch; unresolvable template or missing payload field fails fast without calling the adapter; success/failure both produce the corresponding lifecycle event from Issue 263.
**Dependencies:** 262, 263
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/application/ports/notification-sender.ts`, `packages/notifications/application/use-cases/send-notification.ts`
**Tests Required:** Unit tests (fakes) for render-then-dispatch ordering, missing-field failure, event emission on both outcomes.
**Documentation Required:** `docs/guides/use-cases.md` notifications section.
**Educational Notes:** Ports and adapters applied to an outbound integration: the application layer knows only "send," never "call SMTP" or "call Twilio," so swapping providers touches infrastructure only.
**Deliverables:** Tested `SendNotification` use case.

---

### Issue 265 — Templating engine integration and rendering safety
**Description:** Integrate a templating approach (e.g. a minimal, sandboxed interpolation engine — not a full scripting templating language) for rendering `subjectTemplate`/`bodyTemplate` against payload data, with automatic HTML-escaping for email bodies and plain-text rendering for SMS.
**Objective:** Render user- and system-derived data into templates without introducing injection or markup-breakage vulnerabilities.
**Acceptance Criteria:** Payload values containing HTML/script fragments are escaped in email output; SMS rendering strips/rejects HTML; unit tests cover an adversarial payload fixture per channel.
**Dependencies:** 262
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/infrastructure/templating/render-template.ts`
**Tests Required:** Unit tests with adversarial payload fixtures (script tags, template-delimiter characters) per channel.
**Documentation Required:** `docs/security/notification-rendering.md`
**Educational Notes:** Why templating engines chosen for untrusted-adjacent data must forbid arbitrary code execution — the same class of risk as SSTI (server-side template injection) in web frameworks.
**Deliverables:** Tested, escaping-safe template renderer.

---

### Issue 266 — SMTP email adapter
**Description:** `SmtpEmailSender` implementing `NotificationSender` for the `email` channel, using a configurable SMTP transport (e.g. `nodemailer`), reading connection config via Issue 011's typed config loader, with a `DevConsoleEmailSender` fallback for local development that logs instead of sending.
**Objective:** Deliver the actual email-sending capability that credential flows (Issues 068–070) deferred, closing that gap for real.
**Acceptance Criteria:** Adapter sends via SMTP in integration tests against a test SMTP server (e.g. Mailhog/Testcontainers); malformed recipient address rejected before a network call is attempted; dev fallback never sends over the network.
**Dependencies:** 011, 264, 265
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/infrastructure/adapters/smtp-email-sender.ts`, `dev-console-email-sender.ts`
**Tests Required:** Integration tests against a test SMTP server; unit tests for recipient validation.
**Documentation Required:** `docs/guides/notifications-setup.md`
**Educational Notes:** Environment-conditional adapters (dev vs. prod) as a pattern for avoiding accidental external side effects during local development and CI.
**Deliverables:** Tested SMTP email adapter with safe dev fallback.

---

### Issue 267 — SMS adapter
**Description:** `SmsSender` implementing `NotificationSender` for the `sms` channel via a pluggable provider client (e.g. Twilio-shaped interface), with the same dev-fallback pattern as Issue 266, and message-length truncation/warning for payloads exceeding SMS segment limits.
**Objective:** Add a second real delivery channel, proving the port abstraction from Issue 264 generalizes beyond email.
**Acceptance Criteria:** Adapter dispatches via a fake provider client in tests; oversized message triggers documented truncation behavior (not silent data loss beyond the truncation point); dev fallback logs instead of calling the provider.
**Dependencies:** 264, 265, 266
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/infrastructure/adapters/sms-sender.ts`, `dev-console-sms-sender.ts`
**Tests Required:** Unit tests for truncation behavior; integration tests against a fake provider client.
**Documentation Required:** `docs/guides/notifications-setup.md` update.
**Educational Notes:** SMS segment limits (GSM-7 vs. UCS-2 encoding affecting the 160/70-character thresholds) as a real-world constraint templating must respect.
**Deliverables:** Tested SMS adapter.

---

### Issue 268 — Outbound webhook adapter
**Description:** `WebhookSender` implementing `NotificationSender` for the `webhook` channel, POSTing a signed JSON payload (HMAC signature header, using a per-subscriber secret) to a configured URL, with a strict request timeout.
**Objective:** Support notifying external systems/integrators, not just end users, as a first-class delivery channel.
**Acceptance Criteria:** Outgoing payload includes a verifiable HMAC signature header; requests to non-HTTPS URLs rejected by default (configurable override documented); timeout enforced and surfaced as a failure, not a hang.
**Dependencies:** 264, 265
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/infrastructure/adapters/webhook-sender.ts`, `domain/services/webhook-signature.ts`
**Tests Required:** Unit tests for signature computation; integration tests for timeout and non-HTTPS rejection.
**Documentation Required:** `docs/security/webhook-signing.md`
**Educational Notes:** HMAC payload signing as the standard way a receiver verifies a webhook genuinely came from the claimed sender — the same pattern used by Stripe, GitHub, and similar webhook providers.
**Deliverables:** Tested, signed webhook adapter.

---

### Issue 269 — Delivery retry policy with exponential backoff
**Description:** `RetryPolicy` domain service computing retry delays (exponential backoff with jitter, capped max attempts) for failed deliveries, applied uniformly across all three channel adapters via the `SendNotification` use case.
**Objective:** Recover from transient delivery failures (provider timeouts, rate limits) without hammering the provider or losing the notification.
**Acceptance Criteria:** Backoff delays grow exponentially with jitter within a documented bound; max-attempts exhaustion marks the notification `failed` and emits `NotificationFailed`; unit tests cover delay computation determinism given a fixed seed.
**Dependencies:** 264, 266, 267, 268
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/domain/services/retry-policy.ts`
**Tests Required:** Unit tests for backoff sequence and max-attempts exhaustion.
**Documentation Required:** `docs/guides/notifications-setup.md` retry section.
**Educational Notes:** Exponential backoff with jitter versus fixed-interval retry — jitter avoids the "thundering herd" of synchronized retries from many failed notifications retrying in lockstep.
**Deliverables:** Tested retry/backoff policy.

---

### Issue 270 — Delivery queue and worker for asynchronous dispatch
**Description:** A durable outbound queue (Redis-backed, reusing Issue 046's Redis client) holding pending/retrying notifications, with a worker process that pulls due items and invokes `SendNotification`, rescheduling per Issue 269's policy on failure.
**Objective:** Decouple notification triggering from delivery, so a slow or down provider doesn't block the request path that triggered the notification.
**Acceptance Criteria:** Enqueue is synchronous and fast (no network call to the provider on the triggering request path); worker processes retries at their scheduled time, not immediately; integration test verifies end-to-end enqueue → deliver → status update.
**Dependencies:** 046, 269
**Estimated Complexity:** L
**Files Affected:** `packages/notifications/infrastructure/queue/delivery-queue.ts`, `infrastructure/queue/delivery-worker.ts`
**Tests Required:** Integration tests for enqueue/dequeue timing and scheduled-retry correctness.
**Documentation Required:** `docs/guides/notifications-setup.md` queue section.
**Educational Notes:** Why notification dispatch belongs off the request/response critical path — coupling user-facing latency to a third-party provider's response time is a common reliability mistake.
**Deliverables:** Tested async delivery queue and worker.

---

### Issue 271 — Dead-letter handling for exhausted deliveries
**Description:** Notifications exhausting Issue 269's max attempts move to a dead-letter set/table rather than being discarded, with a query surface for operators to inspect and optionally manually replay them.
**Objective:** Preserve visibility into permanently failed deliveries instead of losing them silently after the last retry.
**Acceptance Criteria:** Exhausted notification appears in the dead-letter store with its full failure history; manual replay use case re-enqueues it through the normal delivery path; integration test covers exhaustion → dead-letter → replay.
**Dependencies:** 269, 270
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/application/use-cases/replay-dead-letter-notification.ts`, `infrastructure/persistence/dead-letter-store.ts`
**Tests Required:** Integration tests for exhaustion transition and replay.
**Documentation Required:** `docs/guides/notifications-setup.md` update.
**Educational Notes:** Dead-letter queues as the standard pattern for "give up gracefully" in asynchronous messaging systems, preserving operator visibility instead of silent data loss.
**Deliverables:** Tested dead-letter handling with replay.

---

### Issue 272 — Notification preference domain model
**Description:** `NotificationPreference` entity per `(recipientId, notificationCategory, channel)` tuple with an `enabled` flag, plus a small set of non-suppressible categories (e.g. security alerts, password reset) that ignore preference opt-outs.
**Objective:** Let recipients control which non-critical notifications they receive, while guaranteeing security-critical notifications are never silently suppressed by a stale preference.
**Acceptance Criteria:** Non-suppressible categories documented and enforced in code (not just convention); unit tests confirm a disabled preference blocks a suppressible category but not a non-suppressible one.
**Dependencies:** 261
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/domain/entities/notification-preference.ts`, `domain/value-objects/notification-category.ts`
**Tests Required:** Unit tests for suppressible vs. non-suppressible enforcement.
**Documentation Required:** `docs/guides/domain-modeling.md` update.
**Educational Notes:** Distinguishing "the user opted out" from "this must always be delivered" as a modeled invariant, not a runtime judgment call — security notifications (e.g. "your password was changed") must never be quietly disabled by a UI toggle.
**Deliverables:** Tested preference model with non-suppressible categories.

---

### Issue 273 — Preference repository and Prisma persistence
**Description:** `NotificationPreferenceRepository` port and `PrismaNotificationPreferenceRepository` implementation, with a `notification_preferences` table keyed on `(recipientId, category, channel)` and a sensible opt-in/opt-out default per category.
**Objective:** Persist preferences durably and make lookups cheap on the delivery hot path.
**Acceptance Criteria:** Repository upserts idempotently; default preference (when no row exists) matches the documented per-category default; contract tests cover default resolution and explicit overrides.
**Dependencies:** 046, 052, 272
**Estimated Complexity:** S
**Files Affected:** `prisma/schema.prisma`, `packages/notifications/infrastructure/persistence/prisma-notification-preference-repository.ts`
**Tests Required:** Contract tests for upsert idempotency and default resolution.
**Documentation Required:** `docs/guides/notifications-setup.md` update.
**Educational Notes:** Absent-row-as-default is a common and efficient pattern for optional per-user settings — avoids writing a row for every user/category/channel combination up front.
**Deliverables:** Tested preference persistence.

---

### Issue 274 — Preference enforcement in `SendNotification`
**Description:** Extend the Issue 264 use case to consult the preference repository before dispatch, suppressing delivery (status `suppressed`, no adapter call) for disabled, suppressible categories, while non-suppressible categories always proceed.
**Objective:** Make the preference model from Issues 272–273 actually govern real delivery decisions.
**Acceptance Criteria:** Disabled suppressible category never reaches the channel adapter; non-suppressible category always reaches it regardless of preference state; unit tests cover both paths with fakes.
**Dependencies:** 264, 272, 273
**Estimated Complexity:** S
**Files Affected:** `packages/notifications/application/use-cases/send-notification.ts`
**Tests Required:** Unit tests for suppression and override paths.
**Documentation Required:** `docs/guides/use-cases.md` update.
**Educational Notes:** Enforcing a policy at the single choke point (the send use case) rather than scattering preference checks across every caller — a direct application of Issue 264's "single controlled entry point" design.
**Deliverables:** Preference-aware delivery.

---

### Issue 275 — Preference center API
**Description:** REST endpoints (`GET`/`PUT /me/notification-preferences`) letting an authenticated user view and update their own preferences, validated against the registered category/channel set, excluding non-suppressible categories from being toggled off via the API.
**Objective:** Give users a self-service surface for the preference model, rather than requiring operator intervention.
**Acceptance Criteria:** Attempt to disable a non-suppressible category rejected with a clear error; valid updates persist and are reflected in a subsequent `GET`; Zod schemas validate request/response shapes.
**Dependencies:** 272, 273, 274
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/interface/http/preference-routes.ts`, `interface/http/schemas/notification-preference-schemas.ts`
**Tests Required:** Supertest integration tests for view, update, and non-suppressible rejection.
**Documentation Required:** OpenAPI spec update; `docs/guides/notifications-setup.md` preference-center section.
**Educational Notes:** N/A (pattern reuse: REST resource over a use case, per prior phases' interface-layer conventions).
**Deliverables:** Tested preference-center API.

---

### Issue 276 — Wiring credential flows to real email delivery
**Description:** Update the Issues 068–070 flows (email verification, password reset request/confirmation) to publish their trigger events through this phase's `SendNotification` use case with concrete templates, replacing the stubbed/deferred port referenced at the time.
**Objective:** Close the loop explicitly referenced in Issue 069's description — deliver on the "delegated to Phase 14" promise.
**Acceptance Criteria:** Integration test triggers a password reset request end-to-end and asserts a rendered email reaches the dev-console/test SMTP sender with correct recipient and reset-link payload; email verification flow covered equivalently.
**Dependencies:** 068, 069, 070, 262, 266
**Estimated Complexity:** M
**Files Affected:** `packages/notifications/infrastructure/event-handlers/credentials-notification-subscriber.ts`, `packages/notifications/domain/templates/*.ts`
**Tests Required:** Integration tests for both flows, asserting rendered content and delivery invocation.
**Documentation Required:** `docs/security/authentication-flows.md` update marking the deferred item resolved.
**Educational Notes:** Closing a deliberately deferred cross-phase dependency — a concrete example of why documenting "deferred to Phase N" at the point of deferral matters for keeping large, incrementally-built systems coherent.
**Deliverables:** Credential flows delivering real email.

---

### Issue 277 — Composition wiring: notification subscribers and worker registered at startup
**Description:** Wire the credentials subscriber (Issue 276) and any other context's trigger-event subscribers into `apps/api`'s composition root, and start the delivery worker (Issue 270) as part of application/process startup, following the audit phase's subscriber-ordering pattern (Issue 194).
**Objective:** Make notification delivery actually active in the running application.
**Acceptance Criteria:** Application startup registers every notification subscriber before other contexts can publish trigger events; worker process starts and is health-checkable; smoke test triggers a password reset through the composed app and asserts a queued/delivered notification.
**Dependencies:** 194, 270, 276
**Estimated Complexity:** S
**Files Affected:** `apps/api/src/composition/register-notification-subscribers.ts`, `apps/api/src/app.ts`
**Tests Required:** End-to-end smoke test via the composed application.
**Documentation Required:** `docs/guides/composition-root.md` notifications section.
**Educational Notes:** N/A (pattern reuse from Issue 194, generalized to a fifth context).
**Deliverables:** Notification subscribers and worker wired into the running app.

---

### Issue 278 — Threat model: notification abuse and spoofing
**Description:** STRIDE-based threat model covering notification-bombing (triggering excessive sends to harass a recipient), template injection, webhook SSRF via attacker-controlled URLs, and preference-bypass, cross-referencing which issues in this phase mitigate each threat.
**Objective:** Document the security reasoning behind the retry/backpressure, rendering-safety, and webhook-signing design as a coherent whole.
**Acceptance Criteria:** All STRIDE categories relevant to an outbound-messaging subsystem addressed; each threat maps to a mitigating issue or an accepted-risk note with rationale.
**Dependencies:** 265, 268, 269, 274
**Estimated Complexity:** S
**Files Affected:** `docs/security/threat-model-notifications.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** SSRF via webhook URLs as a frequently underestimated risk of any feature that lets a user configure an outbound destination URL.
**Deliverables:** Published threat model.

---

### Issue 279 — `packages/notifications` unit test coverage gate and public API surface
**Description:** Apply the Phase 02 coverage-gate pattern (Issue 037) and the public-API-curation pattern (Issue 038) to `packages/notifications`: enforce coverage in CI, and curate `index.ts` to export use cases/ports/types intended for `apps/api` consumption while keeping adapters and the template registry internal.
**Objective:** Maintain test discipline and encapsulation consistency with every prior context.
**Acceptance Criteria:** CI coverage gate active and passing; deep-import lint rule extended to this package; only intended exports are public.
**Dependencies:** 037, 038, 261–277
**Estimated Complexity:** XS
**Files Affected:** `packages/notifications/vitest.config.ts`, `packages/notifications/index.ts`, `.eslintrc.cjs`
**Tests Required:** N/A (meta-check); lint rule verification.
**Documentation Required:** None beyond existing testing/guide docs.
**Educational Notes:** N/A (pattern reuse).
**Deliverables:** Enforced coverage gate and curated public API.

---

### Issue 280 — Notifications educational walkthrough
**Description:** Write `docs/guides/tutorials/build-a-notification-pipeline.md`, a from-scratch narrative covering the trigger-event-to-delivery pipeline, templating safety, retry/backoff and dead-lettering, and the preference-center tradeoffs, using this phase's code as the worked example and explicitly narrating how it resolves the email-delivery gap deferred since Phase 04.
**Objective:** Deliver the flagship "how to build a reliable multi-channel notification system" educational artifact for this phase.
**Acceptance Criteria:** Walkthrough covers the domain event trigger, templating/rendering safety, all three channel adapters, retry/backoff/dead-letter mechanics, and the preference center, linking every claim to real code/tests in the repo.
**Dependencies:** 261–279
**Estimated Complexity:** M
**Files Affected:** `docs/guides/tutorials/build-a-notification-pipeline.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** N/A.
**Deliverables:** Published tutorial.

---
