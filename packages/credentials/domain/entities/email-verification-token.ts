import { createId, type Id, Result, ValidationError } from "@verixa/shared-kernel";

import { generateToken, hashToken, tokenMatchesDigest } from "../value-objects/token-digest.js";

export type EmailVerificationTokenId = Id<"EmailVerificationTokenId">;

/** A `UserId` from the identity context, referenced by value. See `Credential`. */
export type EmailVerificationUserId = Id<"UserId">;

/**
 * Default lifetime: 24 hours.
 *
 * Long enough to survive an email sitting unread overnight, short enough that
 * a link forwarded, logged by a mail scanner, or left in a shared inbox stops
 * working within a day. Verification is a one-time act at a moment the user
 * chose, so there is no reason for the window to be generous.
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface EmailVerificationTokenProps {
  readonly id: EmailVerificationTokenId;
  readonly userId: EmailVerificationUserId;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | undefined;
  readonly createdAt: Date;
}

/** A token plus the one-time raw value issued with it. */
export interface IssuedEmailVerificationToken {
  readonly token: EmailVerificationToken;
  /**
   * The raw token, returned exactly once and never stored.
   *
   * Returned alongside the entity rather than on it so there is no property
   * for a log line, a serializer, or an API response to reach. Once this
   * value is discarded it is unrecoverable from the system — which is the
   * property that makes a database leak useless.
   */
  readonly rawToken: string;
}

/**
 * Proof that someone controls the email address they registered with.
 *
 * Single-use and short-lived, and both of those are load-bearing rather than
 * tidy defaults:
 *
 * **Single-use** because a verification link travels through channels nobody
 * controls — a mail provider, a corporate scanner that follows links, a
 * forwarded message, a shared inbox, browser history on a borrowed laptop. A
 * reusable link is a permanent credential scattered across all of them. Once
 * consumed, a leaked copy is worthless.
 *
 * **Short-lived** because it bounds how long any of those copies matter.
 *
 * Distinct from a session token, which is the comparison worth holding onto:
 * a session says "this request is from someone who already proved who they
 * are" and is presented on every request, so it is long-lived and renewable.
 * This says "whoever holds this controls that mailbox" and is presented once.
 * Giving them the same lifecycle is how a system ends up with a
 * never-expiring link in an old email that logs someone in.
 */
export class EmailVerificationToken {
  readonly id: EmailVerificationTokenId;
  readonly userId: EmailVerificationUserId;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | undefined;
  readonly createdAt: Date;

  private constructor(props: EmailVerificationTokenProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.consumedAt = props.consumedAt;
    this.createdAt = props.createdAt;
  }

  /** SHA-256 of a raw token, hex-encoded. The only form ever persisted. */
  static hashToken(token: string): string {
    return hashToken(token);
  }

  /**
   * Issues a token for `userId`.
   *
   * The raw value is generated here and returned separately; the entity keeps
   * only its digest.
   */
  static issue(params: {
    userId: EmailVerificationUserId;
    ttlMs?: number;
    now?: Date;
  }): IssuedEmailVerificationToken {
    const now = params.now ?? new Date();
    const rawToken = generateToken();

    return {
      rawToken,
      token: new EmailVerificationToken({
        id: createId<"EmailVerificationTokenId">(),
        userId: params.userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(now.getTime() + (params.ttlMs ?? DEFAULT_TTL_MS)),
        consumedAt: undefined,
        createdAt: now,
      }),
    };
  }

  /** Rebuilds from already-trusted data (a database row). */
  static reconstitute(props: EmailVerificationTokenProps): EmailVerificationToken {
    return new EmailVerificationToken(props);
  }

  /** Whether `candidate` is the raw token this was issued with, compared in constant time. */
  matchesToken(candidate: string): boolean {
    return tokenMatchesDigest(candidate, this.tokenHash);
  }

  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  get isConsumed(): boolean {
    return this.consumedAt !== undefined;
  }

  /**
   * Retires the token without redeeming it.
   *
   * Distinct from {@link consume}, which enforces the redemption rules and
   * refuses an expired token. Retiring is not redeeming: when a replacement
   * link is issued, every outstanding token must stop working, and an already
   * expired one is no exception. Routing that through `consume` would leave
   * expired tokens un-retired on a technicality.
   *
   * Idempotent — retiring an already-consumed token leaves it alone, so the
   * original redemption time survives for the audit trail.
   */
  invalidate(now: Date = new Date()): EmailVerificationToken {
    if (this.isConsumed) {
      return this;
    }
    return new EmailVerificationToken({ ...this, consumedAt: now });
  }

  /**
   * Marks the token used.
   *
   * Refuses a token that is already consumed or expired, and says which —
   * safely, because reaching this method at all requires already holding a
   * valid token. There is nothing left to enumerate: the caller has proved
   * possession, so telling them *why* their link failed is helpful rather
   * than disclosing. That is the opposite of the login path, and the
   * difference is worth noticing rather than copying one rule everywhere.
   */
  consume(now: Date = new Date()): Result<EmailVerificationToken, ValidationError> {
    if (this.isConsumed) {
      return Result.err(
        new ValidationError("This verification link has already been used.", {
          token: ["already_used"],
        }),
      );
    }

    if (this.isExpiredAt(now)) {
      return Result.err(
        new ValidationError("This verification link has expired.", { token: ["expired"] }),
      );
    }

    return Result.ok(new EmailVerificationToken({ ...this, consumedAt: now }));
  }

  /**
   * The digest is a secret in the same sense a password hash is: anyone
   * holding it can check guesses offline. It has no business in a log line.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      userId: this.userId,
      tokenHash: "[REDACTED]",
      expiresAt: this.expiresAt,
      consumedAt: this.consumedAt,
      createdAt: this.createdAt,
    };
  }

  [Symbol.for("nodejs.util.inspect.custom")](): Record<string, unknown> {
    return this.toJSON();
  }
}
