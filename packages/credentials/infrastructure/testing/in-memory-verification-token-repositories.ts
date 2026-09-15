import type {
  EmailVerificationTokenRepository,
  PasswordResetTokenRepository,
} from "../../application/ports/verification-token-repository.js";
import type {
  EmailVerificationToken,
  EmailVerificationUserId,
} from "../../domain/entities/email-verification-token.js";
import type {
  PasswordResetToken,
  PasswordResetUserId,
} from "../../domain/entities/password-reset-token.js";

/**
 * A token keyed by digest, with the two operations both token repositories
 * need.
 *
 * Written once and parameterised rather than copied twice. The two token
 * *aggregates* are deliberately separate — different lifetimes, different
 * consequences — but their in-memory storage genuinely is the same Map, and
 * duplicating it would mean fixing every bug twice.
 */
class InMemoryTokenStore<
  TToken extends {
    readonly id: string;
    readonly tokenHash: string;
    readonly userId: string;
    readonly consumedAt: Date | undefined;
    invalidate(now: Date): TToken;
  },
> {
  protected readonly byId = new Map<string, TToken>();

  findByTokenHash(tokenHash: string): Promise<TToken | undefined> {
    for (const token of this.byId.values()) {
      if (token.tokenHash === tokenHash) {
        return Promise.resolve(token);
      }
    }
    return Promise.resolve(undefined);
  }

  save(token: TToken): Promise<void> {
    this.byId.set(token.id, token);
    return Promise.resolve();
  }

  /** Retires every unconsumed token for `userId`. */
  protected invalidate(userId: string, now: Date, retire: (token: TToken) => TToken): void {
    for (const [id, token] of this.byId) {
      if (token.userId === userId && token.consumedAt === undefined) {
        this.byId.set(id, retire(token));
      }
    }
  }

  /** Test-only introspection: every token held, in insertion order. */
  all(): readonly TToken[] {
    return [...this.byId.values()];
  }
}

/** In-memory `EmailVerificationTokenRepository` for testing without a database. */
export class InMemoryEmailVerificationTokenRepository
  extends InMemoryTokenStore<EmailVerificationToken>
  implements EmailVerificationTokenRepository
{
  invalidateOutstandingForUser(userId: EmailVerificationUserId, now: Date): Promise<void> {
    // `invalidate`, not `consume`. The latter enforces the redemption rules
    // and refuses an expired token, but retiring is not redeeming — an
    // expired outstanding token must stop working too.
    this.invalidate(userId, now, (token) => token.invalidate(now));
    return Promise.resolve();
  }
}

/** In-memory `PasswordResetTokenRepository` for testing without a database. */
export class InMemoryPasswordResetTokenRepository
  extends InMemoryTokenStore<PasswordResetToken>
  implements PasswordResetTokenRepository
{
  invalidateOutstandingForUser(userId: PasswordResetUserId, now: Date): Promise<void> {
    this.invalidate(userId, now, (token) => token.invalidate(now));
    return Promise.resolve();
  }
}
