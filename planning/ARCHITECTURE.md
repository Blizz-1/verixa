# Verixa — System Architecture

> The system-level design Verixa is built against. Published so contributors
> can see not just what the code does but what it is *aiming at* — and can
> disagree with it. Decisions that have been settled are recorded as ADRs in
> `docs/adr/`; the open questions at the end of this document are genuinely
> open.

## 1. Vision

Verixa is reusable backend infrastructure for **authentication, authorization,
identity, verification, audit logging, security, and governance** — built as a
teaching-grade, production-grade open-source platform. Every subsystem should be
usable on its own (as a library) or as part of the full platform (as a service).

The reference repository (`safetrustcr/backend-SafeTrust`) is used *only* to
understand the problem domain (trust/identity verification for a marketplace). No
code, naming, folder structure, or architecture is copied from it. Verixa's domain is
broader: general-purpose identity/auth/governance infrastructure, not a single
marketplace's trust layer.

## 2. Guiding Principles

1. **Clean Architecture / Hexagonal boundaries.** Domain logic never depends on
   frameworks, databases, or transport. Dependencies point inward.
2. **Domain-Driven Design where it earns its keep.** Bounded contexts: Identity,
   Credentials, Sessions, Authorization, Verification, Audit, Governance,
   Notifications. Shared kernel kept intentionally small.
3. **Security-first.** Every issue that touches secrets, credentials, or user data
   carries explicit threat-modeling and security-review requirements.
4. **Educational by construction.** Code is written to be read by newcomers. Every
   completed issue ships with a "why," not just a "what."
5. **Modular monolith first, service-ready later.** Bounded contexts are physically
   separated (own folder, own DB schema/tables, communicate via defined interfaces)
   so they can be extracted into services later without a rewrite.
6. **Composable over monolithic.** Each capability (auth, RBAC, audit log, etc.) is
   also usable as a standalone npm package from `packages/`.

## 3. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict mode) | Type safety end-to-end, great tooling, huge contributor pool |
| Runtime | Node.js (LTS) | Ubiquitous, easy onboarding for contributors |
| HTTP framework | Fastify | Schema-first, high performance, first-class plugin/DI model that maps well to clean architecture |
| API styles | REST (primary), GraphQL (secondary, added once REST core is stable) | REST for simplicity/education; GraphQL added with clear justification (flexible client queries for admin/governance UIs) |
| ORM / DB access | Prisma + PostgreSQL | Strong typing, migrations, readable schema as documentation |
| Cache / sessions store | Redis | Session/token revocation lists, rate limiting counters |
| Validation | Zod | Runtime validation that also derives static types |
| Testing | Vitest (unit/integration), Supertest (HTTP), Testcontainers (DB integration) | Fast, TS-native, realistic integration tests |
| Lint/Format | ESLint + Prettier | Consistent style, enforced in CI |
| Static analysis | TypeScript compiler (`--strict`), ESLint security plugins, `npm audit` / `osv-scanner` | Defense in depth |
| CI/CD | GitHub Actions | Free for OSS, well understood |
| Containers | Docker + docker-compose | Local parity with production, easy onboarding |
| Package management | pnpm workspaces (monorepo) | Efficient monorepo installs, workspace protocol for internal packages |
| Docs | Markdown in `/docs`, ADRs in `/docs/adr`, generated API docs (OpenAPI) | Docs-as-code |
| Versioning | Semantic Versioning + Conventional Commits | Predictable releases, automatable changelogs |

## 4. Monorepo Layout

```
verixa/
├── apps/
│   └── api/                 # Fastify HTTP app (composition root)
├── packages/
│   ├── identity/            # Identity bounded context (domain + application)
│   ├── credentials/         # Password/credential management
│   ├── sessions/            # Session & token issuance/revocation
│   ├── authorization/       # RBAC + policy (ABAC) engine
│   ├── verification/        # Identity verification workflows
│   ├── audit/                # Audit logging (write-once event trail)
│   ├── governance/          # Admin/governance domain (roles, policies, orgs)
│   ├── notifications/       # Email/SMS/webhook dispatch
│   ├── shared-kernel/       # Cross-context primitives (Result type, IDs, errors, clock)
│   └── config/               # Typed environment/config loading
├── infra/
│   ├── docker/
│   └── ci/
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   └── guides/
├── planning/                  # This file, the roadmap, and the 500 issue specs
└── tests/
    └── integration/
```

Each `packages/*` context follows the same internal shape:

```
packages/<context>/
├── domain/           # Entities, value objects, domain services, domain events
├── application/       # Use cases / command & query handlers, ports (interfaces)
├── infrastructure/     # Adapters: Prisma repositories, Redis clients, external APIs
└── interface/          # Fastify route handlers / GraphQL resolvers for this context
```

Dependency rule: `interface → application → domain`, `infrastructure → application`'s
ports (implements them), never the reverse. `apps/api` wires everything together
(composition root / dependency injection) and owns no business logic itself.

## 5. Core Bounded Contexts (Phase → Context Map)

| Context | Responsibility |
|---|---|
| Identity | User/organization identity records, profile data |
| Credentials | Password hashing/policy, credential lifecycle, recovery |
| Sessions | Login sessions, JWT/opaque tokens, refresh, revocation |
| MFA | TOTP, WebAuthn/passkeys, backup codes |
| Authorization | RBAC roles/permissions, ABAC policy engine |
| Verification | KYC-style identity verification workflows, document/ evidence review |
| Audit | Immutable audit event log, query API |
| Governance | Admin operations, organizational policy, compliance workflows |
| Notifications | Transactional email/SMS/webhooks triggered by domain events |
| Developer Tooling | SDKs, CLI, local dev experience |

## 6. Cross-Cutting Concerns

- **Security**: threat modeling per context, secrets never logged, all auth flows
  rate-limited, timing-safe comparisons, secure defaults documented in `docs/security/`.
- **Observability**: structured logging (pino), request correlation IDs, metrics
  (Prometheus format), OpenTelemetry tracing hooks.
- **Governance of the codebase itself**: CONTRIBUTING.md, CODE_OF_CONDUCT.md, ADRs
  for every non-trivial architectural decision, RFC process for major features.

## 7. Why This Architecture (vs. Alternatives Considered)

- **Modular monolith vs. microservices from day one**: microservices add
  operational complexity (service discovery, distributed tracing, network
  failure modes) that would slow early contributors and obscure the educational
  goal. A modular monolith with strict internal boundaries gets 90% of the
  benefit (testability, replaceability, clear ownership) with 10% of the
  operational cost, and can be split into services later along the same seams.
- **Fastify vs. Express/NestJS**: Express lacks schema validation and structure
  out of the box; NestJS's heavy DI/decorator model is powerful but adds a steep
  learning curve for beginners and obscures plain TypeScript, which conflicts
  with the "beginner-friendly" goal. Fastify sits in between: structured, fast,
  but still close to plain functions and objects.
- **Prisma vs. raw SQL / Knex / TypeORM**: Prisma's generated types keep the
  domain layer honest about what the database actually returns, and its schema
  file doubles as living documentation — valuable for an educational project.

## 8. Open Questions (tracked as ADRs once decided)

- GraphQL gateway: single schema vs. per-context schema stitching.
- ~~Multi-tenancy model: schema-per-tenant vs. row-level tenant_id~~ —
  **decided**: row-level `organization_id` + Postgres RLS. See
  `docs/adr/0002-multi-tenancy-model.md`.
- Event bus: in-process event emitter now, message broker (e.g. NATS) later if
  cross-context async workflows justify it.
