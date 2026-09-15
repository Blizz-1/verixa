import { createId, type Id, Result, ValidationError } from "@verixa/shared-kernel";

import { generateToken, hashToken, tokenMatchesDigest } from "../value-objects/token-digest.js";

export type PasswordResetTokenId = Id<"PasswordResetTokenId">;

/** A `UserId` from the identity context, referenced by value. See `Credential`. */
export type PasswordResetUserId = Id<"UserId">;

/**
 * Default lifetime: one hour.
 *
 * Much shorter than email verification's 24 hours, and the asymmetry is
 * deliberate. This token can *change a password* — it is a complete account
 * takeover in a URL, and the only thing standing between an attacker and the
 * account is that they do not have it. Verification only confirms a fact
 * about an address someone already registered.
 *
 * An hour is comfortably longer than the minute or two a real reset takes,
 * and short enough that a link sitting in a mail archive, a forwarded thread,
 * or a scanner's log is almost always already dead.
 */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface PasswordResetTokenProps {
  readonly id: PasswordResetTokenId;
  readonly userId: PasswordResetUserId;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | undefined;
  readonly createdAt: Date;
}

/** A token plus the one-time raw value issued with it. */
export interface IssuedPasswordResetToken {
  readonly token: PasswordResetToken;
  /** The raw token, returned exactly once and never stored. */
  readonly rawToken: string;
}

/**
 * Authority to set a new password without knowing the old one.
 *
 * The most dangerous token in the system, which is why it is the shortest
 * lived and the most narrowly scoped. Holding one is equivalent to holding
 * the account.
 *
 * Single-use matters more here than anywhere else. A reusable reset link in
 * an old email is a permanent backdoor that survives every subsequent
 * password change — the user picks a new password, believes they are safe,
 * and the link still works.
 */
export class PasswordResetToken {
  readonly id: PasswordResetTokenId;
  readonly userId: PasswordResetUserId;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | undefined;
  readonly createdAt: Date;

  private constructor(props: PasswordResetTokenProps) {
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

  static issue(params: {
    userId: PasswordResetUserId;
    ttlMs?: number;
    now?: Date;
  }): IssuedPasswordResetToken {
    const now = params.now ?? new Date();
    const rawToken = generateToken();

    return {
      rawToken,
      token: new PasswordResetToken({
        id: createId<"PasswordResetTokenId">(),
        userId: params.userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(now.getTime() + (params.ttlMs ?? DEFAULT_TTL_MS)),
        consumedAt: undefined,
        createdAt: now,
      }),
    };
  }

  /** Rebuilds from already-trusted data (a database row). */
  static reconstitute(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
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

  /** Whether the token can still be redeemed. */
  isUsableAt(now: Date): boolean {
    return !this.isConsumed && !this.isExpiredAt(now);
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
  invalidate(now: Date = new Date()): PasswordResetToken {
    if (this.isConsumed) {
      return this;
    }
    return new PasswordResetToken({ ...this, consumedAt: now });
  }

  /**
   * Marks the token used.
   *
   * Unlike email verification, the reason is **not** reported to the end
   * user by the use case above this. The domain still distinguishes the two
   * cases, because the audit log and operator need to; the HTTP layer
   * collapses them. See `ConfirmPasswordReset` for why.
   */
  consume(now: Date = new Date()): Result<PasswordResetToken, ValidationError> {
    if (this.isConsumed) {
      return Result.err(
        new ValidationError("This reset link has already been used.", { token: ["already_used"] }),
      );
    }

    if (this.isExpiredAt(now)) {
      return Result.err(
        new ValidationError("This reset link has expired.", { token: ["expired"] }),
      );
    }

    return Result.ok(new PasswordResetToken({ ...this, consumedAt: now }));
  }

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
