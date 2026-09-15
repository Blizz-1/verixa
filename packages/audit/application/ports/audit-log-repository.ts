import type { AuditLogEntry } from "../../domain/entities/audit-log-entry.js";

/**
 * Persistence for the audit log.
 *
 * Deliberately has no `update` and no `delete`. Append-only is the guarantee
 * the whole design rests on, and a port offering a way to break it would make
 * the hash chain decorative — the first person in a hurry would reach for it.
 * Retention and erasure (Phase 24) are a different problem with different
 * rules, and will arrive as an explicit, auditable operation rather than as a
 * method that was quietly always there.
 */
export interface AuditLogRepository {
  /**
   * The most recent entry, or `undefined` when the log is empty.
   *
   * Callers need this to append: a new entry commits to its predecessor's
   * hash, so writing one requires having read the tail.
   */
  findLatest(): Promise<AuditLogEntry | undefined>;

  /** Appends an entry. Fails if `sequence` is already taken. */
  append(entry: AuditLogEntry): Promise<void>;

  /** Entries from `fromSequence` onward, in order. Used by verification. */
  findFrom(fromSequence: number, limit: number): Promise<readonly AuditLogEntry[]>;

  /** Total entries in the log. */
  count(): Promise<number>;
}

/** A commitment of the chain head to an external ledger. */
export interface AnchorRecord {
  readonly sequence: number;
  readonly chainHash: string;
  readonly anchorRef: string;
  readonly network: string;
  readonly anchoredAt: Date;
}

/** Persistence for anchoring receipts. */
export interface AnchorRecordRepository {
  save(record: AnchorRecord): Promise<void>;
  findLatest(): Promise<AnchorRecord | undefined>;
  findAll(limit: number): Promise<readonly AnchorRecord[]>;
}
