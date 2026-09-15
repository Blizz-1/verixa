import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Issuing and checking single-use bearer tokens — the mechanism shared by
 * email verification (Issue 068) and password reset (Issue 069).
 *
 * Shared as *mechanism*, deliberately not as a base class. The two tokens are
 * separate aggregates with genuinely different rules — one activates a user,
 * the other replaces a credential and kills sessions — and a common
 * `AbstractToken` would put the interesting differences behind a shape chosen
 * for the boring similarity. What they actually share is three functions.
 *
 * See `docs/security/token-storage.md`.
 */

/** Bytes of entropy in an issued token. */
const TOKEN_BYTES = 32;

/**
 * Generates a raw bearer token.
 *
 * 256 bits, from a CSPRNG. `randomUUID()` would be convenient and is what
 * `Invitation` uses, but a v4 UUID carries 122 bits because six of them are
 * fixed by the format — fine, and less than this costs. For a value whose
 * sole protection is being unguessable, taking the larger number is free.
 *
 * base64url rather than hex: same entropy in two-thirds the characters, and
 * safe in a URL without escaping, which is where these tokens spend their
 * lives.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * SHA-256 of a raw token, hex-encoded. The only form ever persisted.
 *
 * A plain hash, not argon2, and that difference is worth understanding
 * because it looks like an inconsistency with how passwords are stored.
 *
 * Password hashing is slow on purpose because passwords are low-entropy and
 * human-chosen: an attacker with the database can guess `Summer2026!` in
 * microseconds unless each attempt is made expensive. These tokens are 256
 * random bits. There is no dictionary to try and no guess worth making, so
 * the slowness would buy nothing — while costing real latency on a link a
 * user just clicked.
 *
 * What hashing *does* buy here is the same thing it buys for passwords: a
 * leaked database does not hand over working tokens.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Whether `token` hashes to `digest`, compared in constant time.
 *
 * `===` on the hex strings would leak, by returning faster the earlier the
 * first differing character appears. That is enough to reconstruct a digest
 * one character at a time given enough samples — a real attack against
 * anything that compares secrets naively, and cheap to avoid.
 *
 * Note this compares *digests*, not raw tokens, so an attacker who could
 * exploit the timing would recover a hash rather than a token. That makes
 * this belt-and-braces rather than load-bearing, which is the right place for
 * a two-line function to sit.
 */
export function tokenMatchesDigest(token: string, digest: string): boolean {
  const candidate = Buffer.from(hashToken(token), "hex");
  const actual = Buffer.from(digest, "hex");

  // `timingSafeEqual` throws on length mismatch rather than returning false,
  // which would turn a malformed stored digest into a 500 instead of a failed
  // check. Lengths are equal for any two SHA-256 digests, so this only fires
  // on corruption — and corruption should read as "no match".
  if (candidate.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(candidate, actual);
}
