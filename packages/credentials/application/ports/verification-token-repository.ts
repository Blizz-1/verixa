import type {
  EmailVerificationToken,
  EmailVerificationUserId,
} from "../../domain/entities/email-verification-token.js";
import type {
  PasswordResetToken,
  PasswordResetUserId,
} from "../../domain/entities/password-reset-token.js";

/**
 * Persistence for email verification tokens.
 *
 * `findByTokenHash` rather than `findByToken`, and that is the whole security
 * posture of this port in one method name. The raw token never reaches the
 * repository: the use case hashes it and looks up the digest, so a query log,
 * a slow-query trace, or an APM span capturing parameters records a value
 * that cannot be replayed.
 *
 * `invalidateOutstandingForUser` marks every unconsumed token for a user as
 * consumed. Reissuing a link has to retire the previous one — otherwise a
 * user who requests three emails ends up with three working links, and two of
 * them are sitting in a mailbox nobody is watching.
 */
export interface EmailVerificationTokenRepository {
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | undefined>;
  save(token: EmailVerificationToken): Promise<void>;
  invalidateOutstandingForUser(userId: EmailVerificationUserId, now: Date): Promise<void>;
}

/**
 * Persistence for password reset tokens.
 *
 * Same shape and same reasoning as above, with the stakes raised: these
 * tokens are account takeover in a URL, so retiring the previous one on
 * reissue is not housekeeping but a security requirement.
 */
export interface PasswordResetTokenRepository {
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  save(token: PasswordResetToken): Promise<void>;
  invalidateOutstandingForUser(userId: PasswordResetUserId, now: Date): Promise<void>;
}
