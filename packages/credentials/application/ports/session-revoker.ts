/**
 * Revokes every active session for a user.
 *
 * Sessions are Phase 05, so this has no real implementation yet. It is
 * defined now because the call site is in Issue 070, and a password reset
 * that does not invalidate sessions is the single most commonly missed step
 * in the flow.
 *
 * ## Why a reset must kill sessions
 *
 * The scenario the whole flow exists for is "an attacker has my account". If
 * they got in — phished password, reused credential, borrowed laptop — they
 * are holding a session. Changing the password revokes their knowledge of the
 * *credential*, and does nothing whatsoever about the session they already
 * have. They stay logged in, indefinitely, while the user believes they have
 * just locked them out.
 *
 * That is the failure worth designing against: not that the reset is
 * insecure, but that it is *believed* to have worked. A user who knows they
 * are still compromised takes further action; a user who thinks they are safe
 * does not.
 *
 * So the port exists before the sessions do, and the use case calls it. When
 * Phase 05 lands, it becomes an adapter rather than a step someone has to
 * remember to add.
 */
export interface SessionRevoker {
  /** Revokes all sessions belonging to `userId`. Idempotent. */
  revokeAllForUser(userId: string): Promise<void>;
}

/**
 * A revoker with nothing to revoke.
 *
 * Correct until Phase 05 — there are no sessions, so revoking all of them is
 * genuinely a no-op — and it keeps the call site real rather than commented
 * out. The moment sessions exist, one line in the composition root replaces
 * this, and Issue 070 needs no change.
 */
export class NoSessionsRevoker implements SessionRevoker {
  revokeAllForUser(): Promise<void> {
    return Promise.resolve();
  }
}
