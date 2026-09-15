# Authentication Flows

How Verixa verifies a password, and — more importantly — what it refuses to
tell you when that fails.

Implementation:
`packages/credentials/application/use-cases/authenticate-with-password.ts`.
The HTTP surface is `POST /auth/login` in `apps/api/src/routes/auth.ts`.

## The rule

**Every failed login returns the same error, in the same time, whatever went
wrong.**

There are five ways authentication can fail:

1. No account with that email address.
2. The email address was not even well-formed.
3. The account exists but has no password credential (SSO-only, passkey-only).
4. The password was wrong.
5. The account is suspended.

A caller can distinguish none of them. All five produce
`AUTHENTICATION_FAILED`, HTTP 401, message `Invalid email or password.`, with
no field errors.

## Why: user enumeration

An endpoint that distinguishes "no such user" from "wrong password" is an
**account enumeration oracle**. OWASP lists it directly, and the Web Security
Testing Guide gives it its own test (WSTG-IDNT-04).

The attack is cheap. Post a list of email addresses; read which ones come back
"wrong password"; you now hold a list of addresses that have accounts. Two
things follow, and the second is usually the worse one:

- **Credential stuffing gets much cheaper.** The expensive half of that attack
  is finding valid usernames. Handed a verified list, an attacker only has to
  guess passwords for accounts already known to be real.
- **Membership leaks.** For an identity, verification and compliance platform,
  _who has an account here_ is frequently more sensitive than any individual
  password. "Is this person a customer of yours" is a question the login
  endpoint should not answer to anyone who asks.

### The cost, stated plainly

The error message is genuinely worse. Someone who mistypes their email address
is told exactly what someone who mistypes their password is told, and neither
is told which. That is a real usability cost and it is accepted deliberately,
not overlooked.

The place it gets resolved is password reset (Issue 069), which has the same
property for the same reason: it always reports "if that address has an
account, we've sent a link", and the actual answer arrives over a channel that
has already proven the recipient controls the address.

## Why timing is handled explicitly

Matching the message is not sufficient. If a missing user returns in 2ms while
a wrong password takes 60ms because it ran a real argon2 verification, the
**response time** answers the question the message declines to. That gap is
large, consistent, and measurable over a local network — and it is invisible to
any test that only inspects the response body.

So when there is no credential to verify against, the use case verifies the
submitted password against a **decoy hash** instead, and discards the result.
The decoy is a genuine argon2 hash of a password nobody holds, produced by the
same hasher at the same cost parameters. Both paths perform exactly one hash
verification.

The decoy is cached per hasher instance rather than globally. A decoy built at
one set of cost parameters is worthless for disguising a hasher configured with
different ones — it would look like it worked, cost the wrong amount, and leave
the channel open.

### What this does not claim

**Not constant time.** Argon2 verification is not constant-time with respect to
the parameters encoded in the stored hash; a database miss is faster than a
hit; and JIT warm-up, allocation and network jitter add noise that dwarfs both.
The first failed login in a process is also slower than later ones, because
that is when the decoy is computed.

Getting to "indistinguishable under statistical analysis" requires a fixed
response deadline — hold every response until a constant wall-clock budget has
elapsed — which is a heavier mechanism with its own failure modes, and more
than this threat warrants at this stage.

The claim made here is narrower and true: **the obvious order-of-magnitude
difference is gone.** The attacks that scale against the remainder are
addressed from the other side, by account lockout (Issue 067) and rate limiting
(Phase 15), which make the volume of attempts an enumeration attack needs
impractical regardless of what each one leaks.

## Ordering: password first, status second

The status check runs **after** the password is verified. This looks
backwards — why do expensive work for a suspended account? — and is
deliberate.

Checking status first means a suspended account can be identified without
knowing its password. "This account is suspended" answers "does this account
exist" to anyone who asks. Verifying first means a suspended account fails
exactly like a wrong password does.

`pending` users **can** authenticate. Registration leaves a user pending until
their email is verified (Issue 068), so refusing them would mean nobody could
sign in after signing up. Email verification gates what an account may _do_,
not whether its owner may prove who they are; conflating the two produces a
product that cannot tell an unverified user why they are stuck. Authorization
for unverified accounts is Phase 07's concern, and it can see the status.

The set of authenticable statuses is written as an allowlist rather than as
`status !== "suspended"`, so adding a state to `UserStatus` fails closed: a new
status is not authenticable until someone decides it is.

## Transparent rehashing

A successful login is the only moment the plaintext password exists in memory,
which makes it the only moment an existing hash can be upgraded.

Cost parameters must rise over time as hardware gets faster. Without this,
raising them would mean every existing hash stays at its old strength forever,
or a mass password reset. Instead, on each successful login the stored hash is
checked against current parameters and re-hashed if it falls short. Passwords
migrate gradually as people sign in. Nobody is emailed and nothing is visible.

Two properties worth knowing:

- **It happens outside the authentication transaction.** Partly because
  hashing is slow and holds a connection for no reason, but mainly for
  correctness: the upgrade is best-effort, and a `try`/`catch` _inside_ a
  transaction cannot deliver that. A failed write has already marked the
  transaction for rollback, so swallowing the error only defers the failure to
  the commit, where nothing remains to catch it.
- **Its failure never fails the login.** The user supplied correct
  credentials. Refusing them because a background optimisation did not work
  would turn a cosmetic problem into an outage, and the upgrade is retried on
  their next login anyway.

## What login does not yet do

`POST /auth/login` returns the authenticated user and **no session or token**.
Sessions are Phase 05.

Until then the endpoint is deliberately not enough to stay logged in with.
Returning a placeholder token would be worse than returning none: clients would
store it, and replacing it with a real one later would be a breaking change to
a field that never worked.

## Related

- `docs/security/password-storage.md` — argon2id parameters, the PHC format,
  and why the hash is self-describing.
- `docs/security/token-storage.md` — how tokens are stored once they exist.
