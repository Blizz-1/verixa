import { Prisma } from "@verixa/database";
import { ConflictError, NotFoundError } from "@verixa/shared-kernel";
import { describe, expect, it } from "vitest";

import { mapPrismaError, withMappedErrors } from "./error-mapper.js";

/**
 * Constructs a real `PrismaClientKnownRequestError` rather than a stub. The
 * mapper narrows with `instanceof`, so a plain object shaped like one would
 * pass straight through to the rethrow branch and the test would assert
 * nothing about the mapping it claims to cover.
 */
function prismaError(code: string, meta?: Record<string, unknown>): Error {
  return new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "test",
    ...(meta === undefined ? {} : { meta }),
  });
}

describe("mapPrismaError", () => {
  it("maps a unique constraint violation to ConflictError", () => {
    expect(() => {
      mapPrismaError(prismaError("P2002", { target: ["email"] }), "User");
    }).toThrow(ConflictError);
  });

  it("names the violated fields in the message when Prisma reports them", () => {
    try {
      mapPrismaError(prismaError("P2002", { target: ["email"] }), "User");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ConflictError).message).toContain("email");
      expect((error as ConflictError).message).toContain("User");
    }
  });

  it("tolerates a unique violation with no field metadata", () => {
    // `meta.target` is loosely typed and varies by database and Prisma
    // version. Missing metadata must degrade to a plainer message, not crash
    // the mapper — the error being reported matters more than its detail.
    expect(() => {
      mapPrismaError(prismaError("P2002"), "User");
    }).toThrow(ConflictError);
  });

  it("tolerates a unique violation whose target is a bare string", () => {
    expect(() => {
      mapPrismaError(prismaError("P2002", { target: "users_email_key" }), "User");
    }).toThrow(ConflictError);
  });

  it("maps a foreign key violation to NotFoundError", () => {
    expect(() => {
      mapPrismaError(prismaError("P2003"), "OrganizationMembership");
    }).toThrow(NotFoundError);
  });

  it("maps a missing-record error to NotFoundError", () => {
    expect(() => {
      mapPrismaError(prismaError("P2025"), "User");
    }).toThrow(NotFoundError);
  });

  it("rethrows an unrecognized Prisma error unchanged", () => {
    // A code with no domain meaning keeps its original type. Flattening it
    // into a domain error would claim the failure was expected and discard
    // what actually went wrong.
    const original = prismaError("P9999");

    expect(() => {
      mapPrismaError(original, "User");
    }).toThrow(original);
  });

  it("rethrows a non-Prisma error unchanged", () => {
    const original = new Error("connection reset");

    expect(() => {
      mapPrismaError(original, "User");
    }).toThrow(original);
  });
});

describe("withMappedErrors", () => {
  it("returns the value when nothing throws", async () => {
    await expect(withMappedErrors("User", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("translates a Prisma error thrown inside the callback", async () => {
    await expect(
      withMappedErrors("User", () => Promise.reject(prismaError("P2002", { target: ["email"] }))),
    ).rejects.toThrow(ConflictError);
  });

  it("leaves an unrelated failure alone", async () => {
    const original = new Error("socket hang up");

    await expect(withMappedErrors("User", () => Promise.reject(original))).rejects.toThrow(
      original,
    );
  });
});
