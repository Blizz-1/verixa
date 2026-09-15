-- Account lockout state (Issue 067).
--
-- Both columns hang off the credential rather than the user, because the
-- thing being rate-limited is "attempts to prove this password", not the
-- identity. An SSO-only account has no password to guess and so has nothing
-- to lock.

-- `failed_attempts` counts consecutive failures since the last success. A
-- default of 0 with NOT NULL keeps the "never failed" case out of the
-- nullable-integer tri-state, where `NULL` and `0` would mean the same thing
-- and every read would have to coalesce.
ALTER TABLE "credentials"
    ADD COLUMN "failed_attempts" INTEGER NOT NULL DEFAULT 0;

-- `locked_until` is an expiry, deliberately, not a `locked` boolean.
--
-- A boolean needs something to come along and clear it, and the failure mode
-- of that scheduled job not running is an account locked out permanently,
-- with nothing in the request path able to notice. An expiry releases itself:
-- the comparison that decides whether a credential is locked is the same
-- comparison that decides it no longer is.
ALTER TABLE "credentials"
    ADD COLUMN "locked_until" TIMESTAMPTZ(3);

-- Partial, covering only the rows that are ever scanned for.
--
-- Locked credentials are a small fraction of the table, and the operational
-- query ("which accounts are currently locked out", for support and for the
-- metrics in Phase 18) only ever wants those. A full index would carry an
-- entry for every unlocked credential, which is every row, to answer a
-- question about almost none of them.
CREATE INDEX "credentials_locked_until_idx"
    ON "credentials" ("locked_until")
    WHERE "locked_until" IS NOT NULL;
