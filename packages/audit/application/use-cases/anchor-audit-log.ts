import { Result, ValidationError } from "@verixa/shared-kernel";

import type {
  AnchorFailure,
  AnchorRecord,
  AnchorRecordRepository,
  AuditLogRepository,
  HashAnchorPort,
} from "../ports/audit-log-repository.js";

export interface AnchorAuditLogResult {
  readonly record: AnchorRecord;
  /** Entries covered by this anchor that were not covered by the previous one. */
  readonly newlyCovered: number;
}

export type AnchorAuditLogError = ValidationError | AnchorFailure;

/**
 * Commits the audit log's current head hash to an external ledger.
 *
 * ## What this buys that hash chaining does not
 *
 * The chain makes the log tamper-evident *to someone who already holds an
 * earlier hash*. On its own that is a weaker guarantee than it sounds,
 * because the operator holds the only copy: an attacker with database access
 * can rewrite the log from any point and re-derive every subsequent hash, and
 * the result is internally consistent and indistinguishable from the truth.
 *
 * Anchoring removes the "only copy" part. Once the head hash is in a Stellar
 * transaction, rewriting history also requires altering a record on a public
 * ledger the operator does not control — which is not a thing they can do.
 * Anyone can then check the operator's log against the chain themselves, with
 * no access to the operator's systems and no need to trust them.
 *
 * That last property is the whole point, and it is why the anchor is a public
 * ledger rather than, say, a second database or a signed file. An auditor, a
 * regulator, or a suspicious user can verify independently.
 *
 * ## Only the hash
 *
 * A hash and nothing else. The log's *contents* stay in the operator's
 * database, and must — putting audit content on a public ledger would be an
 * irreversible data leak, and audit records are exactly the records most
 * likely to contain something sensitive. A digest proves the records existed
 * unchanged while revealing nothing about them.
 *
 * ## Why this is a scheduled operation, not a per-entry one
 *
 * Anchoring every entry would mean a Stellar transaction per login. That
 * costs a fee and several seconds each time, and buys almost nothing: the
 * chain already links entries to one another, so anchoring the head commits
 * to *every* entry beneath it at once. Anchoring periodically bounds the
 * window in which undetected tampering is possible to the time since the last
 * anchor, which is a knob an operator can turn.
 */
export class AnchorAuditLog {
  constructor(
    private readonly auditLog: AuditLogRepository,
    private readonly anchors: AnchorRecordRepository,
    private readonly hashAnchor: HashAnchorPort,
  ) {}

  async execute(): Promise<Result<AnchorAuditLogResult, AnchorAuditLogError>> {
    const head = await this.auditLog.findLatest();
    if (head === undefined) {
      return Result.err(
        new ValidationError("There is nothing to anchor: the audit log is empty.", {
          auditLog: ["empty"],
        }),
      );
    }

    const previous = await this.anchors.findLatest();
    if (previous !== undefined && previous.chainHash === head.hash) {
      // Nothing has been logged since the last anchor. Submitting the same
      // hash again would spend a fee to record a fact already on-chain.
      return Result.err(
        new ValidationError("The current chain head is already anchored.", {
          auditLog: ["already_anchored"],
        }),
      );
    }

    const receipt = await this.hashAnchor.anchor(head.hash);
    if (Result.isErr(receipt)) {
      // Returned rather than thrown: a scheduled anchor that cannot reach the
      // network should log and retry on the next tick, not crash the process.
      return receipt;
    }

    const record: AnchorRecord = {
      sequence: head.sequence,
      chainHash: head.hash,
      anchorRef: receipt.value.anchorRef,
      network: receipt.value.network,
      anchoredAt: receipt.value.anchoredAt,
    };

    // Persisted *after* the ledger accepted it. The reverse order would let a
    // crash between the two leave a record claiming an anchor that does not
    // exist — a false proof, which is worse than a missing one.
    await this.anchors.save(record);

    return Result.ok({
      record,
      newlyCovered: head.sequence - (previous?.sequence ?? 0),
    });
  }
}
