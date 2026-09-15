import { Result, ValidationError } from "@verixa/shared-kernel";

/**
 * Rules a password must satisfy. Configurable because deployments differ, but
 * the defaults follow NIST SP 800-63B rather than folklore.
 */
export interface PasswordPolicy {
  readonly minLength: number;
  readonly maxLength: number;
}

/**
 * NIST SP 800-63B, and specifically *not* the rules most systems still use.
 *
 * **Length over complexity.** No "must contain an uppercase, a digit, and a
 * symbol" rule. Those requirements measurably reduce entropy in practice:
 * faced with them people produce `Password1!`, and attackers know the
 * patterns the rules force. 800-63B recommends dropping composition rules
 * entirely in favour of length plus a breach check.
 *
 * **No forced rotation.** Periodic expiry makes people pick weaker, more
 * predictable passwords (`Summer2026!` → `Autumn2026!`). Rotate on evidence
 * of compromise, not on a calendar.
 *
 * `minLength` is 12 rather than the 800-63B minimum of 8: 8 is the floor for
 * *permissible*, and 12 is a modest step up that costs users little.
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  /**
   * An upper bound exists for denial of service, not for security.
   *
   * Hashing is deliberately expensive, so an endpoint accepting unbounded
   * input lets anyone hand the server a multi-megabyte "password" and make it
   * pay. 256 is far above any real passphrase and comfortably above the 64
   * characters 800-63B requires be accepted.
   *
   * Note what this is *not*: a truncation limit. bcrypt silently ignores
   * everything past 72 bytes; this rejects, visibly, so nobody ends up with a
   * password shorter than they believe.
   */
  maxLength: 256,
};

/**
 * Checks a password against known-breached credentials.
 *
 * Interface only — no provider yet. The intended implementation is the
 * k-anonymity model (send the first 5 characters of the SHA-1 hash, receive
 * every matching suffix, compare locally), so the password never leaves the
 * server in any form.
 *
 * This is the single highest-value password check there is. A breached
 * password is *already* in an attacker's dictionary, which makes its length
 * and composition irrelevant — the guess costs one attempt.
 */
export interface BreachedPasswordChecker {
  isBreached(plaintext: string): Promise<boolean>;
}

const REDACTED = "[REDACTED]";

/**
 * A plaintext password that has passed policy validation.
 *
 * Exists to make two separate mistakes hard:
 *
 * 1. **Using an unvalidated password.** A function taking `RawPassword`
 *    cannot be handed an arbitrary string.
 * 2. **Leaking it.** `toString`, `toJSON`, and Node's inspect hook are all
 *    overridden to return `[REDACTED]`, so the value survives neither
 *    `console.log`, a logger, `JSON.stringify`, nor an error serializer.
 *    Reaching the plaintext requires calling {@link reveal} — a name chosen
 *    to be conspicuous in review.
 *
 * The second is not paranoia. Passwords appearing in logs is one of the most
 * common credential disclosures there is, and it almost never happens on
 * purpose: an object gets logged for debugging, or included in an error
 * payload, and the secret rides along.
 */
export class RawPassword {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static create(
    plaintext: string,
    policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  ): Result<RawPassword, ValidationError> {
    // Deliberately not trimmed. Leading and trailing spaces are legitimate
    // password characters, and silently stripping them would mean a password
    // that cannot be typed back in — the user would be locked out by a
    // convenience nobody asked for.
    if (plaintext.length < policy.minLength) {
      return Result.err(
        new ValidationError(`Password must be at least ${String(policy.minLength)} characters.`, {
          password: ["too_short"],
        }),
      );
    }

    if (plaintext.length > policy.maxLength) {
      return Result.err(
        new ValidationError(`Password must be at most ${String(policy.maxLength)} characters.`, {
          password: ["too_long"],
        }),
      );
    }

    return Result.ok(new RawPassword(plaintext));
  }

  /**
   * The plaintext. Named to stand out: every call site is somewhere a secret
   * escapes this wrapper, and should be reviewed as such. Legitimately called
   * in exactly one place — passing the password to the hasher.
   */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  /**
   * Node's `util.inspect` hook, which is what `console.log` actually uses for
   * objects. Without it, `toString` would be bypassed and the field printed
   * in full — the exact accident this class exists to prevent.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
