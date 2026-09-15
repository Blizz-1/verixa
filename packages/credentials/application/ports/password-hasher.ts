/**
 * Turns a plaintext password into something safe to store, and checks a
 * candidate against it.
 *
 * The application layer deliberately knows nothing about *which* algorithm is
 * used. That is not ceremony: password hashing has changed algorithm roughly
 * once a decade (crypt → md5 → bcrypt → scrypt → argon2), and every one of
 * those transitions happened while systems were already live. A codebase that
 * names its algorithm in the application layer has to be edited everywhere
 * when the next transition arrives.
 *
 * See `docs/security/password-storage.md`.
 */
export interface PasswordHasher {
  /**
   * Hashes a plaintext password.
   *
   * The returned string is **self-describing**: it encodes the algorithm, its
   * parameters, and the salt alongside the digest. That is what makes
   * verification work after the defaults change — an old hash carries the
   * parameters it was made with, so it can still be verified years later.
   * Storing a bare digest and keeping parameters in config would make every
   * parameter change a mass password reset.
   *
   * Never returns the same output twice for the same input: a fresh random
   * salt is generated per call. Two users with the same password must not
   * have the same hash, or the database reveals which accounts to attack
   * together.
   */
  hash(plaintext: string): Promise<string>;

  /**
   * Checks a candidate password against a stored hash.
   *
   * Returns `false` for a wrong password, and for a stored value that is
   * malformed or was produced by an algorithm this hasher cannot read. It
   * does not throw on those: a corrupt or unreadable hash means the same
   * thing to a caller as a wrong password — authentication fails — and
   * distinguishing them in the response would tell an attacker something
   * about the account.
   */
  verify(plaintext: string, encodedHash: string): Promise<boolean>;

  /**
   * Whether `encodedHash` was produced with weaker parameters than the
   * current defaults.
   *
   * Cost parameters must rise over time — hardware gets faster, so a hash
   * that took 100ms in 2026 takes considerably less later. But existing
   * hashes cannot be upgraded in place: the plaintext is gone.
   *
   * The only moment it *is* available is a successful login. So the login
   * flow checks this and, when true, re-hashes with current parameters and
   * stores the result. Passwords are upgraded gradually, as people sign in,
   * with no reset email and nothing for the user to notice.
   */
  needsRehash(encodedHash: string): boolean;
}
