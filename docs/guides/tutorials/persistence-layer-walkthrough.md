# Tutorial: The Persistence Layer (Issues 041–059)

This walks through how Verixa persists data, using the Identity context as the
worked example. It assumes you've read
[Building the Identity Context](./build-the-identity-context.md), which covers
the domain side.

The persistence layer is the one most tutorials get wrong, and the failure is
always the same shape: ORM concepts leak upward until the domain model _is_
the database schema. This is a tour of the machinery that prevents that, and
why each piece is there.

## The problem in one paragraph

An ORM wants to be your model. Prisma generates a `User` type from your
schema, and it is _right there_, already typed, already shaped like your
table. Using it directly as the domain model is the path of least resistance
and it costs you two things immediately: business rules now live wherever
someone remembered to put them (because a generated type can't enforce an
invariant), and every schema change for a database reason ripples through
application code that had no stake in it.

Verixa's answer is four pieces: a **port**, an **adapter**, a **mapper**, and
a **contract test**. They're worth understanding as a set, because each one
is doing a job the others can't.

## Stop 1 — The port: what the application needs

`packages/identity/application/ports/user-repository.ts`

```ts
export interface UserRepository {
  findById(id: UserId): Promise<User | undefined>;
  findByEmail(email: Email): Promise<User | undefined>;
  findByIdIncludingDeleted(id: UserId): Promise<User | undefined>;
  save(user: User): Promise<void>;
  existsByEmail(email: Email): Promise<boolean>;
}
```

No Prisma. No SQL. No `WHERE`. This is _what the application needs from
persistence_, written before deciding how to provide it — and it is defined
in the application layer, not the infrastructure layer, which is the part
people get backwards. The consumer owns the interface; the implementation
conforms to it, not the other way round.

Read the doc comment on that file. It is longer than the interface, and the
interesting content is the **contract**: `find*` returns `undefined` rather
than throwing, because a missing user is an ordinary outcome and not an
error; `save` is an idempotent upsert, so callers never distinguish create
from update; `existsByEmail` exists separately from `findByEmail` because a
yes/no question shouldn't reconstruct an aggregate.

Those rules are the actual interface. The method signatures are just how they
are written down.

## Stop 2 — The mapper: where the ORM stops

`packages/identity/infrastructure/persistence/user-mapper.ts`

```ts
toDomain(row: UserRow): User
toRow(user: User): UserRow
```

This file is the entire reason `@verixa/database` never appears in the domain
or application layers. Everything Prisma-shaped stops here.

Two things about it are deliberate and both look like extra work:

**It's hand-written, not generic.** A generic object-to-object mapper would
be shorter and would quietly do the wrong thing: `Email`, `DisplayName`, and
`PersonName` are _validated value objects_, not strings. Rebuilding them is
the step where a generic mapper would assign a string and produce a
structurally-valid, semantically-broken aggregate.

**It throws rather than returning a `Result` on bad data.** If a row holds an
email the domain rejects, that is not user error — nothing invalid should
ever have been written. It means the database and the domain have diverged,
which is a broken invariant, and continuing would propagate corruption
silently. See [error handling](../error-handling.md) for when `Result` is
right and when throwing is.

Notice too that `toDomain` calls `User.reconstitute`, not `User.register`.
Loading a user is not registering one: registration assigns a new id and a
`pending` status, which would be actively wrong when rebuilding a row that
already has both.

## Stop 3 — The adapter: one implementation

`packages/identity/infrastructure/persistence/prisma-user-repository.ts`

```ts
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
  // ...
}
```

The constructor parameter matters more than it looks. The repository is
_given_ a client rather than creating one — which is what lets a caller hand
it a transaction client instead, so the same repository can participate in
somebody else's transaction (Stop 6). A repository that owned its connection
could not.

Worth reading in that file:

- `findByEmail` uses plain equality with no `LOWER()` wrapper, because the
  column is `citext`. That is the payoff of the schema decision: correctness
  lives in the column type where a call site can't forget it.
- `existsByEmail` selects a single column instead of reconstructing a `User`,
  honoring the port's stated reason for existing.
- Writes are wrapped in `withMappedErrors`; reads are not. Only writes
  produce constraint violations a caller can act on.

## Stop 4 — The contract test: proving the fake is honest

`packages/identity/infrastructure/testing/contracts/user-repository.contract.ts`

Every use case in the codebase is unit-tested against
`InMemoryUserRepository` — a `Map`. That is only legitimate if the fake
behaves like the real thing, and _hoping_ it does is not a strategy.

So the contract is a plain exported function, not a `.spec.ts` file:

```ts
export function userRepositoryContract(createRepository: () => UserRepository): void {
  // assertions...
}
```

Called twice. Once against the fake
(`infrastructure/testing/repository-contract.spec.ts`), once against Prisma
(`infrastructure/persistence/prisma-repositories.spec.ts`). One suite, two
implementations, both proven to behave the same.

**This has already earned its keep twice**, and both times are worth knowing
about because they're the kind of thing that stays invisible otherwise:

1. The contract originally asserted `toBe` — _reference identity_ — on
   returned aggregates. That passes for a `Map` handing back the object it
   stored, and can never pass for anything that persists and rebuilds. The
   contract was testing the fake's internals. It only surfaced when Prisma
   became the second implementation.
2. Running it against a real database revealed that **the fakes don't enforce
   referential integrity**. Fixtures referencing a nonexistent user pass
   against a `Map` and fail against actual foreign keys.

Neither was a bug in the production code. Both were wrong assumptions that
only a second implementation could expose — which is the whole argument for
contract testing rather than testing each implementation separately.

The discipline that makes it work: **assert observable behavior, never
implementation detail.** A contract that leaks how one implementation works
cannot run unmodified against another.

## Stop 5 — The database: constraints as a second line

Application-level checks and database constraints are not redundant. They
fail differently, and that's the point.

`OrganizationMembership.create()` already rejects a duplicate active
membership. The database _also_ enforces it, via a partial unique index:

```sql
CREATE UNIQUE INDEX "organization_memberships_active_unique"
    ON "organization_memberships" ("user_id", "organization_id")
    WHERE "status" = 'active';
```

The domain check gives a typed, friendly `ConflictError` on the normal path.
The index holds under concurrency, where two simultaneous requests can both
read "no active membership" before either writes — a race no amount of
application-level checking can close.

Note it's _partial_. A plain composite `UNIQUE` would also forbid rejoining
an organization after leaving it, which is ordinary behavior.

Same pattern elsewhere in the schema:

- `email` is `citext`, so a case-differing duplicate is impossible even for
  code that bypasses `Email.create()`.
- `organizations.owner_id` is `ON DELETE RESTRICT` — deleting a user who owns
  an organization _fails_ rather than cascading and destroying it.
- Timestamps are `timestamptz`, not Prisma's `timestamp` default, which
  silently reinterprets instants against the session timezone.

See [the database guide](../database.md) for the reasoning on each.

## Stop 6 — Transactions: the unit of work

`packages/identity/application/ports/unit-of-work.ts`

`CreateOrganization` writes two aggregates — an `Organization` and the
owner's `OrganizationMembership` — and an organization with no owner-member
is a corrupt state nothing downstream knows how to interpret. Two independent
`save` calls produce exactly that if the process dies between them.

The port hands the caller a _set of repositories_, not a transaction handle:

```ts
export interface UnitOfWork {
  run<T>(work: (repositories: IdentityRepositories) => Promise<T>): Promise<T>;
}
```

That shape is the whole design. A use case must not know whether it is inside
a Postgres transaction, a savepoint, or an in-memory fake — only that
everything in the callback commits together or not at all. Exposing a
`PrismaTransactionClient` would put an ORM type in the application layer and
undo the point of the ports.

`InMemoryUnitOfWork` is honest about not rolling back, and says so in its
doc comment. Faking rollback would make tests pass against a mechanism
nothing in production shares. Atomicity is verified separately, against a
real database, where the guarantee actually lives.

## Stop 7 — Row-Level Security: defense in depth

`docs/security/multi-tenancy.md`

Repositories filter by organization. Postgres _also_ filters, via RLS
policies keyed on a per-transaction setting.

The asymmetry is the argument: application-level filtering **fails open** —
forget the `WHERE` and you get everything. RLS **fails closed** — forget the
tenant context and you get nothing. A wrong query returning no rows is a bug;
a wrong query returning another tenant's rows is a breach.

Three details there are load-bearing and each fails silently if missed:
`FORCE ROW LEVEL SECURITY` (or the table owner is exempt), `WITH CHECK`
alongside `USING` (or cross-tenant _writes_ are permitted), and
transaction-scoped `set_config` rather than session-scoped `SET` (or tenant
context leaks across pooled connections).

That last one is the worst bug in this entire system if got wrong, and it is
one keyword. Read that document before touching anything tenant-scoped.

## Stop 8 — Error mapping: the anti-corruption layer

`packages/identity/infrastructure/persistence/error-mapper.ts`

Prisma's vocabulary stops at the repository boundary, the same way its types
stop at the mapper. A `PrismaClientKnownRequestError` with `code: "P2002"`
becomes a `ConflictError`.

Without it, a use case would have to know what `P2002` means — depending on
Prisma not by importing it but by _understanding_ it, which the ports cannot
prevent and which makes swapping the ORM a rewrite of every error branch.

Note what is deliberately _not_ mapped: connection failures, timeouts, and
unrecognized codes are rethrown untouched. They are not part of any use
case's contract — there is no sensible `err` branch for "the database is
unreachable" — and flattening them would discard diagnostics while pretending
the failure was expected.

## Putting it together

`apps/api/src/composition-root.ts` is the one place allowed to know concrete
implementations exist:

```ts
const users = new PrismaUserRepository(prisma);
const registerUser = new RegisterUser(users);
```

Everything else depends on interfaces. `RegisterUser` knows it needs _a_
`UserRepository`; it has no idea one is backed by Prisma. That is what makes
the entire application layer testable without a database — and it only holds
because "which implementation" is concentrated in one file instead of
scattered across the modules that use them.

**The rule to preserve: nothing outside that file imports a `Prisma*` class.**
The moment a route handler constructs its own repository, dependency
inversion is gone and that handler can no longer be tested without a
database.

## Exercise

Add a `findBySlug` variant that includes soft-deleted organizations, mirroring
`findByIdIncludingDeleted` on `UserRepository`.

It touches every layer this tour visited: add the method to the port with a
doc comment explaining the contract, implement it in the Prisma adapter _and_
the in-memory fake, add contract assertions so both are held to the same
behavior, and check whether the RLS policy on `organizations` affects what
you can see.

Then ask the question the tour is really about: should it be a separate
method, or a `{ includeDeleted }` option? `UserRepository` chose separate
methods deliberately — the reasoning is in its doc comment. Decide whether
you agree, and whether consistency with it matters more than your own
preference.
