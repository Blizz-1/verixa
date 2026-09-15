import { buildContainer, type Container } from "@verixa/api/composition-root";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestPrismaClient, databaseAvailability } from "./helpers/database.js";
import { createHttpTestClient, type HttpTestClient } from "./helpers/http-client.js";

/**
 * The login half of the vertical slice: real HTTP → route → use case →
 * repository → Postgres, against a user created through the register
 * endpoint rather than seeded directly.
 *
 * Registering through the API is the point. A fixture that inserted a row
 * with a hash of its own would test login against a credential no production
 * code path ever produces, and would keep passing if registration and login
 * disagreed about how a password is hashed or an email is normalized — which
 * is precisely the failure this suite exists to catch.
 */

const available = await databaseAvailability();

interface AuthenticatedUserBody {
  id: string;
  email: string;
  displayName: string;
  status: string;
}

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

const asUser = (body: unknown): AuthenticatedUserBody => body as AuthenticatedUserBody;
const asError = (body: unknown): ApiErrorBody => body as ApiErrorBody;

describe.skipIf(!available)("POST /auth/login", () => {
  const prisma = createTestPrismaClient();
  let container: Container;
  let client: HttpTestClient;

  beforeAll(async () => {
    container = buildContainer(prisma);
    client = await createHttpTestClient(container);
  }, 60_000);

  afterEach(async () => {
    await prisma.credential.deleteMany({});
    await prisma.invitation.deleteMany({});
    await prisma.organizationMembership.deleteMany({});
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await client.close();
    await prisma.$disconnect();
  }, 60_000);

  const CREDENTIALS = {
    email: "alice@example.com",
    password: "correct horse battery staple",
  };

  async function registerAlice(): Promise<void> {
    const response = await client.request
      .post("/auth/register")
      .send({ ...CREDENTIALS, displayName: "Alice" });
    expect(response.status).toBe(201);
  }

  it("authenticates a registered user, returning 200", async () => {
    await registerAlice();

    const response = await client.request.post("/auth/login").send(CREDENTIALS);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: "alice@example.com",
      displayName: "Alice",
      status: "pending",
    });
    expect(asUser(response.body).id).toBeTruthy();
  });

  it("authenticates a user who has not verified their email", async () => {
    // Registration leaves a user `pending`. If login required `active`, the
    // slice would be broken end to end: nobody could sign in after signing
    // up, and no unit test of either endpoint alone would notice.
    await registerAlice();

    const response = await client.request.post("/auth/login").send(CREDENTIALS);

    expect(response.status).toBe(200);
    expect(asUser(response.body).status).toBe("pending");
  });

  it("accepts the email in a different case than it was registered with", async () => {
    await registerAlice();

    const response = await client.request
      .post("/auth/login")
      .send({ ...CREDENTIALS, email: "ALICE@EXAMPLE.COM" });

    expect(response.status).toBe(200);
  });

  it("never returns the password or its hash", async () => {
    await registerAlice();

    const response = await client.request.post("/auth/login").send(CREDENTIALS);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(CREDENTIALS.password);
    expect(serialized).not.toContain("argon2");
    expect(serialized).not.toContain("passwordHash");
  });

  describe("enumeration resistance over HTTP", () => {
    // The use case's own spec asserts the error objects match. This asserts
    // the same thing survives the trip through Fastify — status code, body,
    // and headers — because the disclosure this prevents is only observable
    // here. An HTTP layer that mapped one cause to 404 and another to 401
    // would reopen it while every unit test stayed green.

    it("returns the same status and body for an unknown email and a wrong password", async () => {
      await registerAlice();

      const unknownUser = await client.request
        .post("/auth/login")
        .send({ email: "nobody@example.com", password: CREDENTIALS.password });
      const wrongPassword = await client.request
        .post("/auth/login")
        .send({ ...CREDENTIALS, password: "wrong password entirely" });

      expect(unknownUser.status).toBe(401);
      expect(wrongPassword.status).toBe(unknownUser.status);
      expect(unknownUser.body).toEqual(wrongPassword.body);
      expect(asError(unknownUser.body).error.code).toBe("AUTHENTICATION_FAILED");
    });

    it("returns that same 401 for a malformed email, not a 400", async () => {
      // The one place the schema is deliberately weaker than registration's.
      // A 400 "email must match format" would tell an attacker their input
      // never reached the credential lookup — the schema answering a question
      // the use case is careful not to.
      await registerAlice();

      const malformed = await client.request
        .post("/auth/login")
        .send({ email: "not-an-email", password: CREDENTIALS.password });
      const wrongPassword = await client.request
        .post("/auth/login")
        .send({ ...CREDENTIALS, password: "wrong password entirely" });

      expect(malformed.status).toBe(401);
      expect(malformed.body).toEqual(wrongPassword.body);
    });

    it("returns that same 401 when the account has no password credential", async () => {
      await registerAlice();
      await prisma.credential.deleteMany({});

      const noCredential = await client.request.post("/auth/login").send(CREDENTIALS);

      expect(noCredential.status).toBe(401);
      expect(asError(noCredential.body).error.code).toBe("AUTHENTICATION_FAILED");
    });

    it("never names the email address in the error", async () => {
      const response = await client.request
        .post("/auth/login")
        .send({ email: "nobody@example.com", password: CREDENTIALS.password });

      expect(JSON.stringify(response.body)).not.toContain("nobody@example.com");
      expect(asError(response.body).error.message).toBe("Invalid email or password.");
    });

    it("carries no field errors that would distinguish the cause", async () => {
      // `ValidationError` attaches `fields`, and a failure that grew one would
      // name what was wrong with the attempt. The authentication error has
      // none, and this asserts the response shape does not acquire any.
      await registerAlice();

      const response = await client.request
        .post("/auth/login")
        .send({ ...CREDENTIALS, password: "wrong password entirely" });

      expect(asError(response.body).error.fields).toBeUndefined();
    });
  });

  describe("request shape", () => {
    it("rejects a missing password with 400 before reaching the use case", async () => {
      // Not an enumeration concern: it reveals something about the *request*,
      // not about which accounts exist. A caller that omitted a field needs to
      // be told, and no account was named.
      const response = await client.request.post("/auth/login").send({ email: CREDENTIALS.email });

      expect(response.status).toBe(400);
    });

    it("rejects unknown properties rather than silently ignoring them", async () => {
      const response = await client.request
        .post("/auth/login")
        .send({ ...CREDENTIALS, status: "active" });

      expect(response.status).toBe(400);
    });
  });

  it("does not modify the credential on a successful login", async () => {
    // The hasher is at current parameters, so `needsRehash` is false and the
    // stored hash must be left exactly as it was. A login that rewrote the
    // credential every time would be doing an expensive write on the hottest
    // path in the system.
    await registerAlice();
    const before = await prisma.credential.findFirst();

    await client.request.post("/auth/login").send(CREDENTIALS);

    const after = await prisma.credential.findFirst();
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });
});
