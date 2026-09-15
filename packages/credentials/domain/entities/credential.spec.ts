import { inspect } from "node:util";

import { asId } from "@verixa/shared-kernel";
import { describe, expect, it } from "vitest";

import { Credential } from "./credential.js";

const USER_ID = asId<"UserId">("00000000-0000-4000-8000-000000000001");
const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g";

describe("Credential", () => {
  it("is created from an already-hashed password", () => {
    const credential = Credential.create({ userId: USER_ID, passwordHash: HASH });

    expect(credential.userId).toBe(USER_ID);
    expect(credential.passwordHash).toBe(HASH);
    expect(credential.id).toBeDefined();
    expect(credential.createdAt).toEqual(credential.updatedAt);
  });

  it("offers no way to construct one from a plaintext password", () => {
    // Asserted as a type-level fact rather than a runtime one: there is no
    // overload taking a RawPassword, so the aggregate cannot hash — and
    // therefore cannot hash wrongly or store a plaintext by mistake.
    // @ts-expect-error — create() accepts a hash, never a raw password.
    Credential.create({ userId: USER_ID, password: "correct horse battery staple" });

    expect(Object.keys(Credential)).not.toContain("fromPlaintext");
  });

  it("replaces the hash and bumps updatedAt", async () => {
    const original = Credential.create({ userId: USER_ID, passwordHash: HASH });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const rotated = original.withPasswordHash("$argon2id$v=19$m=65536,t=3,p=1$bmV3$bmV3aGFzaA");

    expect(rotated.passwordHash).not.toBe(HASH);
    expect(rotated.id).toBe(original.id);
    expect(rotated.createdAt).toEqual(original.createdAt);
    expect(rotated.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
  });

  it("reconstitutes from trusted data", () => {
    const now = new Date();
    const rebuilt = Credential.reconstitute({
      id: asId<"CredentialId">("00000000-0000-4000-8000-0000000000aa"),
      userId: USER_ID,
      passwordHash: HASH,
      createdAt: now,
      updatedAt: now,
    });

    expect(rebuilt.passwordHash).toBe(HASH);
  });

  describe("hash redaction", () => {
    // A hash is less damaging than a plaintext but not harmless: leaked, it
    // can be ground offline at the attacker's pace against a target they now
    // know exists. It does not belong in a log line or an API response.

    it("redacts the hash under JSON.stringify", () => {
      const credential = Credential.create({ userId: USER_ID, passwordHash: HASH });

      expect(JSON.stringify(credential)).not.toContain(HASH);
      expect(JSON.stringify({ credential })).not.toContain(HASH);
    });

    it("redacts the hash under util.inspect", () => {
      const credential = Credential.create({ userId: USER_ID, passwordHash: HASH });

      expect(inspect(credential)).not.toContain(HASH);
      expect(inspect({ nested: { credential } }, { depth: 5 })).not.toContain(HASH);
    });

    it("still exposes the hash as a property, since verification needs it", () => {
      const credential = Credential.create({ userId: USER_ID, passwordHash: HASH });

      // Redaction covers accidental serialization, not deliberate access:
      // authentication genuinely has to read this to verify against it.
      expect(credential.passwordHash).toBe(HASH);
    });
  });
});
