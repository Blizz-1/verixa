/**
 * Delivery of the one-time links these flows produce.
 *
 * A port with no real implementation yet — sending is Phase 14 — and that is
 * the point rather than a gap. The *security-relevant* half of email
 * verification and password reset is token issuance, storage and redemption,
 * and none of it depends on how a message reaches an inbox. Defining the
 * boundary now lets 068–070 be built and tested in full, and lets Phase 14
 * arrive as an adapter rather than a rewrite.
 *
 * ## Why the raw token is a parameter here and nowhere else
 *
 * Every other layer sees only digests. This is the single point where the raw
 * token legitimately leaves the use case, because it has to reach the user
 * somehow. Making that an explicit, narrow, named boundary is what keeps it
 * reviewable: there is exactly one place to check that a token is not being
 * logged, returned in a response, or persisted.
 *
 * An implementation **must not** log the token. `NullCredentialNotifier`
 * documents this by doing nothing at all.
 */
export interface CredentialNotifier {
  /**
   * Sends an email verification link.
   *
   * Implementations should treat failure as retryable and must not throw in a
   * way that fails the calling use case — the token has already been issued
   * and stored, and a delivery failure is recoverable by requesting another.
   */
  sendEmailVerification(params: {
    readonly email: string;
    readonly rawToken: string;
    readonly expiresAt: Date;
  }): Promise<void>;

  /** Sends a password reset link. */
  sendPasswordReset(params: {
    readonly email: string;
    readonly rawToken: string;
    readonly expiresAt: Date;
  }): Promise<void>;
}

/**
 * A notifier that delivers nothing.
 *
 * The default until Phase 14, and deliberately silent rather than a stub that
 * logs "would have sent: <token>". That version is the one that ends up in
 * production for a fortnight while every reset token in the system is written
 * to a log aggregator, readable by anyone with dashboard access.
 *
 * Doing nothing is honest: in a deployment without a mail adapter, no link is
 * delivered, and the flow visibly does not work rather than appearing to.
 */
export class NullCredentialNotifier implements CredentialNotifier {
  sendEmailVerification(): Promise<void> {
    return Promise.resolve();
  }

  sendPasswordReset(): Promise<void> {
    return Promise.resolve();
  }
}
