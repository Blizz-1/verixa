-- Append-only, hash-chained audit log, plus the records that commit its head
-- to an external ledger (Phase 10 + Issue 190A).

CREATE TABLE "audit_log_entries" (
    "id" UUID NOT NULL,

    -- Position in the chain, from 1.
    "sequence" INTEGER NOT NULL,

    "action" TEXT NOT NULL,

    -- Plain UUID columns, deliberately NOT foreign keys. An audit row has to
    -- survive the deletion of the user it refers to; an FK with CASCADE would
    -- erase precisely the evidence that matters most, and one with RESTRICT
    -- would make the audit log block account deletion.
    "actor_id" UUID,
    "subject_id" UUID,

    "metadata" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    -- The predecessor's hash; 64 zeroes for the first entry, so every row
    -- hashes over the same shape and verification needs no special case.
    "previous_hash" TEXT NOT NULL,

    -- SHA-256 over this entry's canonical form, including previous_hash.
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- Unique, not merely indexed, and this is the load-bearing constraint of the
-- whole design. Two concurrent appends read the same predecessor, build two
-- entries claiming the same sequence, and without this both commit -- leaving
-- a forked chain that verifies in neither direction. With it, the second
-- insert fails and the caller retries against the new head.
CREATE UNIQUE INDEX "audit_log_entries_sequence_key" ON "audit_log_entries" ("sequence");

-- Also unique. A repeated hash would mean two entries with identical content
-- at identical positions, which cannot happen honestly.
CREATE UNIQUE INDEX "audit_log_entries_hash_key" ON "audit_log_entries" ("hash");

-- "What happened between these times" and "what did this actor do" are the
-- two questions an audit log is actually asked.
CREATE INDEX "audit_log_entries_occurred_at_idx" ON "audit_log_entries" ("occurred_at");
CREATE INDEX "audit_log_entries_actor_id_idx" ON "audit_log_entries" ("actor_id");

CREATE TABLE "anchor_records" (
    "id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "chain_hash" TEXT NOT NULL,

    -- The Stellar transaction hash. Unique: anchoring twice to the same
    -- transaction would be a bug, and two rows claiming it would make the
    -- evidence ambiguous.
    "anchor_ref" TEXT NOT NULL,

    -- e.g. "stellar:testnet". Recorded because a testnet anchor is not a
    -- mainnet one, and evidence that does not say which is misleading.
    "network" TEXT NOT NULL,

    "anchored_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anchor_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "anchor_records_anchor_ref_key" ON "anchor_records" ("anchor_ref");
CREATE INDEX "anchor_records_sequence_idx" ON "anchor_records" ("sequence");
