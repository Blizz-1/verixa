-- Single-use, expiring tokens for email verification (Issue 068) and password
-- reset (Issue 069).
--
-- Two tables rather than one with a `kind` column. They look identical today
-- and are not the same thing: the lifetimes differ by a factor of 24, one
-- activates a user while the other rewrites a credential and kills sessions,
-- and the retention rules in Phase 24 will differ too. A shared table would
-- make every one of those differences a conditional, and would let a bug in
-- one flow redeem a token issued by the other.

CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    -- Hex-encoded SHA-256 of the token. The raw value is never stored, so a
    -- leaked table yields nothing usable.
    "token_hash" TEXT NOT NULL,

    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    -- When it was redeemed; NULL means unused. A timestamp rather than a
    -- `used` boolean: "when" is what an audit answers questions with, and the
    -- boolean is derivable from it while the reverse is not.
    "consumed_at" TIMESTAMPTZ(3),

    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique on the digest, not merely indexed. Lookup is by token, so the index
-- is needed regardless; making it unique means a digest collision or a
-- replayed insert is a constraint violation rather than two rows that both
-- redeem.
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key"
    ON "email_verification_tokens" ("token_hash");
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key"
    ON "password_reset_tokens" ("token_hash");

-- "The outstanding tokens for this user" — needed by the reissue path, which
-- invalidates previous tokens, and by the Phase 24 retention sweep.
CREATE INDEX "email_verification_tokens_user_id_idx"
    ON "email_verification_tokens" ("user_id");
CREATE INDEX "password_reset_tokens_user_id_idx"
    ON "password_reset_tokens" ("user_id");

-- "Everything that expired before N" — the cleanup sweep. A range query, so
-- a btree on the column is exactly right.
CREATE INDEX "email_verification_tokens_expires_at_idx"
    ON "email_verification_tokens" ("expires_at");
CREATE INDEX "password_reset_tokens_expires_at_idx"
    ON "password_reset_tokens" ("expires_at");

-- CASCADE, matching `credentials` and for the same reason: a token belonging
-- to a deleted user is unusable by definition, and retaining it would keep a
-- link between an address and an account that no longer exists — precisely
-- the data erasure is supposed to remove.
ALTER TABLE "email_verification_tokens"
    ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
