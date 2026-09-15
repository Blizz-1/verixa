import { inspect } from "node:util";

import { Result } from "@verixa/shared-kernel";
import { describe, expect, it } from "vitest";

import { DEFAULT_PASSWORD_POLICY, RawPassword } from "./raw-password.js";

const VALID = "correct horse battery staple";

function create(plaintext: string): RawPassword {
  const result = RawPassword.create(plaintext);
  if (!Result.isOk(result)) throw new Error("fixture setup failed");
  return result.value;
}

describe("RawPassword", () => {
  it("accepts a password meeting the policy", () => {
    const result = RawPassword.create(VALID);

    expect(Result.isOk(result)).toBe(true);
    expect(Result.isOk(result) && result.value.reveal()).toBe(VALID);
  });

  it("rejects a password shorter than the minimum", () => {
    const result = RawPassword.create("short");

    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.fieldErrors["password"]).toContain("too_short");
    }
  });

  it("rejects a password longer than the maximum", () => {
    // The bound exists for denial of service, not strength: hashing is
    // deliberately expensive, so unbounded input lets anyone make the server
    // pay for a multi-megabyte "password".
    const result = RawPassword.create("a".repeat(DEFAULT_PASSWORD_POLICY.maxLength + 1));

    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.fieldErrors["password"]).toContain("too_long");
    }
  });

  it("rejects rather than truncating an over-long password", () => {
    const tooLong = "a".repeat(DEFAULT_PASSWORD_POLICY.maxLength + 10);
    const result = RawPassword.create(tooLong);

    // The bcrypt failure mode, avoided: silently truncating would leave a
    // user with a password shorter than the one they chose, and no way to
    // know. Rejecting is visible.
    expect(Result.isErr(result)).toBe(true);
  });

  it("accepts the boundary lengths exactly", () => {
    expect(Result.isOk(RawPassword.create("a".repeat(DEFAULT_PASSWORD_POLICY.minLength)))).toBe(
      true,
    );
    expect(Result.isOk(RawPassword.create("a".repeat(DEFAULT_PASSWORD_POLICY.maxLength)))).toBe(
      true,
    );
  });

  it("does not require uppercase, digits or symbols", () => {
    // NIST 800-63B: composition rules measurably reduce entropy, because
    // people respond to them with predictable patterns like `Password1!`.
    // Length plus a breach check is the better trade.
    expect(Result.isOk(RawPassword.create("all lowercase words here"))).toBe(true);
  });

  it("preserves leading and trailing whitespace instead of trimming", () => {
    // Spaces are legitimate password characters. Silently stripping them
    // would produce a password the user cannot type back in.
    const padded = "  a password with spaces  ";
    const result = RawPassword.create(padded);

    expect(Result.isOk(result) && result.value.reveal()).toBe(padded);
  });

  it("accepts a custom policy", () => {
    const lax = { minLength: 4, maxLength: 8 };

    expect(Result.isOk(RawPassword.create("abcd", lax))).toBe(true);
    expect(Result.isErr(RawPassword.create("abc", lax))).toBe(true);
  });

  describe("redaction", () => {
    // Passwords in logs is one of the most common credential disclosures
    // there is, and it essentially never happens deliberately — an object is
    // logged while debugging, or lands in an error payload, and the secret
    // rides along. Each of these is a separate escape route and each is
    // covered separately, because closing three of four is worth nothing.

    it("redacts under String() and template interpolation", () => {
      const password = create(VALID);

      expect(String(password)).toBe("[REDACTED]");
      // Interpolating a non-string is exactly the accident this guards
      // against — a developer writing `Tried password: ${password}` into a log
      // line. The rule is right to flag it in production code and wrong to
      // stop the test that proves it is safe.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      expect(`${password}`).not.toContain(VALID);
    });

    it("redacts under JSON.stringify", () => {
      const password = create(VALID);

      expect(JSON.stringify(password)).not.toContain(VALID);
      expect(JSON.stringify({ password })).not.toContain(VALID);
    });

    it("redacts under util.inspect, which is what console.log uses", () => {
      const password = create(VALID);

      // The escape route toString alone would miss: console.log does not call
      // toString on objects, it calls inspect.
      expect(inspect(password)).not.toContain(VALID);
      expect(inspect({ nested: { password } }, { depth: 5 })).not.toContain(VALID);
    });

    it("keeps the value out of enumerable properties", () => {
      const password = create(VALID);

      // A #private field is genuinely unreachable, unlike a `private`
      // modifier, which is erased at compile time and leaves the value
      // visible to Object.values and any spread.
      expect(Object.values(password)).not.toContain(VALID);
      expect(JSON.stringify({ ...password })).not.toContain(VALID);
    });

    it("still exposes the plaintext through reveal()", () => {
      const password = create(VALID);

      // Named conspicuously: every call site is a place a secret leaves the
      // wrapper. There should be exactly one, passing it to the hasher.
      expect(password.reveal()).toBe(VALID);
    });
  });
});
