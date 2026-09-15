# Password Storage

Verixa hashes passwords with **argon2id** at OWASP's recommended minimum
parameters, through a port so the algorithm can be replaced without touching
application code.

Implementation: `packages/credentials/infrastructure/argon2-password-hasher.ts`.

## The rule

**Never store a password. Store a hash, and compare hashes.**

More precisely: store the output of a _password hashing function_ — a
deliberately slow, memory-hard KDF. Not encryption (which is reversible, and
the key will leak with the database), and not a general-purpose cryptographic
hash.

## Why argon2id

argon2 has three variants:

| Variant      | Strength                                                | Weakness                             |
| ------------ | ------------------------------------------------------- | ------------------------------------ |
| argon2d      | Best GPU/TMTO resistance                                | Vulnerable to side channels          |
| argon2i      | Side-channel resistant                                  | Weaker against time-memory tradeoffs |
| **argon2id** | **Runs argon2i for the first half pass, argon2d after** | **Neither extreme, most of both**    |

RFC 9106 names argon2id the default choice. Pick it unless you have a
specific reason not to.

### Against bcrypt and scrypt

bcrypt is not broken and remains defensible. Two real limits:

- **A fixed ~4 MiB working set** that cannot be raised. It has not become
  meaningfully harder to attack as hardware improved, because the one
  parameter that matters most against specialized hardware is the one bcrypt
  cannot change.
- **72-byte input truncation.** Anything past 72 bytes is silently ignored,
  turning a long passphrase into a shorter one with no error. Our test suite
  asserts argon2 has no such limit rather than assuming it.

scrypt is memory-hard and fine. argon2id is the newer design that won the
Password Hashing Competition and addressed scrypt's tradeoffs directly.

### What actually matters

The choice among argon2id, scrypt, and bcrypt is a detail. **Using anything
else is the failure.**

MD5, SHA-1, SHA-256, SHA-512 and every other general-purpose hash are wrong
here, salted or not. They are engineered to be _fast_ — which is precisely
the property you do not want when an attacker holds your database and is
making billions of guesses per second on rented GPUs. A salt stops
precomputed rainbow tables; it does nothing about raw guessing speed.

If you see any of these hashing a password in a PR, reject it.

## Parameters

```ts
export const DEFAULT_ARGON2_PARAMETERS = {
  memoryCost: 19_456, // 19 MiB per hash
  timeCost: 2, // passes over memory
  parallelism: 1, // lanes
};
```

These are OWASP's current **minimum**, so treat them as a floor rather than a
target.

**`memoryCost` is the parameter that matters.** argon2's resistance to
specialized cracking hardware comes from forcing each guess to allocate real
memory. A GPU with thousands of cores has nowhere near thousands of times the
memory bandwidth, so memory-hardness is what stops an attacker trading
silicon for speed. Raising `timeCost` alone buys much less.

### Tuning for your hardware

Raise `memoryCost` until a single hash takes as long as your latency budget
allows — commonly 50–250ms on a login path.

Two constraints to respect:

1. **Memory is per concurrent hash.** At 19 MiB, 100 simultaneous logins need
   ~1.9 GiB. Raising memory without checking peak concurrency is how you turn
   a login spike into an OOM kill.
2. **Login is on the critical path.** A 500ms hash is 500ms every user waits.

The constructor rejects obviously-too-weak parameters. Misconfiguration is
the realistic failure mode here — not a flawed algorithm — and a hasher
running at 1 KiB is indistinguishable from a correct one from the outside,
until someone dumps the database.

## Salting

Handled by the library: a fresh 16-byte CSPRNG salt per call, stored inside
the hash string. There is no API to supply your own, which is correct.

Without a per-hash salt, two users with the same password get the same hash —
so cracking one cracks both, and the database itself shows an attacker which
accounts to attack together.

## Peppering — not implemented, deliberately

A _pepper_ is a server-side secret mixed in before hashing, held outside the
database (ideally in a KMS). It means a database-only disclosure yields
hashes that cannot be attacked at all without also obtaining the pepper.

Verixa does not implement one yet. The protection is real but so is the cost:
rotating a pepper requires re-hashing every password, which can only happen
as users log in, so you carry two peppers through a long transition. Adding
it before there is a KMS to hold the secret would mean a "pepper" sitting in
an environment variable next to the database URL — protecting against exactly
nothing.

The `PasswordHasher` port is the seam where a pepper would be added, and
adding one later requires no change above it.

## The stored format, and why it matters

```
$argon2id$v=19$m=19456,t=2,p=1$<base64 salt>$<base64 hash>
```

This PHC string is **self-describing**: algorithm, version, parameters and
salt all travel with the digest.

That is what makes parameter changes survivable. An old hash carries the
parameters it was created with, so it remains verifiable years after the
defaults moved. Storing a bare digest and keeping parameters in config would
make every parameter change a forced password reset for every user.

## Upgrading hashes over time

Cost parameters must rise as hardware improves. But existing hashes cannot be
recomputed — the plaintext is gone.

The only moment it exists is **a successful login**:

```ts
if (await hasher.verify(password, credential.hash)) {
  if (hasher.needsRehash(credential.hash)) {
    await credentials.save(credential.withHash(await hasher.hash(password)));
  }
  // ... continue login
}
```

Passwords upgrade gradually, as people sign in. No reset emails, nothing for
the user to notice.

**`needsRehash` only reports upgrades, never downgrades.** If someone lowers a
parameter to shed load, "different parameters" would silently re-hash every
password _down_ to the weaker setting on next login — degrading the entire
system while looking like routine maintenance. Only increases propagate.

## Things this layer does _not_ do

Worth stating, because assuming otherwise is how gaps appear:

- **It does not prevent user enumeration.** Verifying a password for a
  nonexistent user returns immediately, while a real user pays the full KDF
  cost — a timing difference that reveals which addresses are registered. The
  fix belongs in the login use case: hash against a dummy value when no user
  is found, so both paths cost the same.
- **It does not rate-limit.** An attacker who can make unlimited attempts does
  not need to crack your hashes. Phases 11 and 15.
- **It does not check password strength.** That is Issue 062's
  `RawPassword` policy — length over complexity rules, and a breach-list
  check, per NIST 800-63B.
- **It does not log.** Nothing here should ever appear in a log line. A
  password reaching a logger is a disclosure regardless of what happens next.

## Review checklist

For any PR touching credentials:

- [ ] No general-purpose hash (MD5/SHA-*) used for a password
- [ ] No plaintext password stored, logged, or included in an error message
- [ ] Cost parameters come from config, not hard-coded at a call site
- [ ] `needsRehash` is checked after a successful verify
- [ ] Verification failures are indistinguishable to the client — wrong
      password, unknown user, and malformed stored hash all look the same
- [ ] No password in a URL, query string, or `GET` request
- [ ] Tests cover the wrong-password path, not only the happy path
