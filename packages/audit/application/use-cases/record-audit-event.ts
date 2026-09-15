import type { AuditAction, AuditLogEntry } from "../../domain/entities/audit-log-entry.js";
import { AuditLogEntry as Entry } from "../../domain/entities/audit-log-entry.js";
import type { AuditLogRepository } from "../ports/audit-log-repository.js";

export interface RecordAuditEventCommand {
  readonly action: AuditAction;
  readonly actorId?: string | undefined;
  readonly subjectId?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Appends one entry to the audit log.
 *
 * ## Why this returns nothing and throws nothing
 *
 * Audit recording sits alongside the operation being audited, not in front of
 * it. A login that succeeded should not be reported as failed because the
 * audit write failed, and a caller should not have to decide what to do about
 * it — so failures are swallowed here and reported through the logger.
 *
 * That is a real trade and worth being explicit about: it means an attacker
 * who can reliably break audit writes can act unrecorded. The mitigation is
 * not to fail the user's request, which mostly produces an outage; it is that
 * a gap in the sequence is *visible* — `verifyChain` reports `sequence_gap`,
 * and the anchored chain head will not match what the operator expects.
 *
 * ## Serialization
 *
 * Appends must not run concurrently. Two entries built from the same
 * predecessor produce two chains claiming the same sequence, and the second
 * insert fails on the unique index — which is the correct outcome, but only
 * because the index is there. This is why `sequence` is unique in the schema
 * rather than merely indexed.
 */
export class RecordAuditEvent {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  async execute(command: RecordAuditEventCommand): Promise<AuditLogEntry | undefined> {
    try {
      const previous = await this.repository.findLatest();

      const entry = Entry.append({
        action: command.action,
        actorId: command.actorId,
        subjectId: command.subjectId,
        metadata: command.metadata ?? {},
        previous,
      });

      await this.repository.append(entry);
      return entry;
    } catch (error) {
      // Never propagates. See the class comment: the audited operation
      // already happened, and failing it now would be reporting a false
      // negative to the user.
      this.onError(error);
      return undefined;
    }
  }
}
