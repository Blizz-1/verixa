import { Result } from "@verixa/shared-kernel";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";

import type { Container } from "../composition-root.js";
import { sendDomainError, sendError } from "../http/error-response.js";

/**
 * JSON Schema for the registration body.
 *
 * Validates **shape only** — types and presence. Rules like "at least 12
 * characters" are deliberately absent, even though Fastify supports
 * `minLength`, because the password policy lives in `RawPassword` and
 * duplicating it here would create two sources of truth that drift: someone
 * raises the minimum in the domain, the schema still accepts 8, and the
 * mismatch surfaces as a confusing 400 that names a rule nobody can find.
 *
 * The split: schema rejects requests that are malformed. The domain rejects
 * requests that are well-formed and wrong.
 */
const registerBodySchema = {
  type: "object",
  required: ["email", "displayName", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string" },
    displayName: { type: "string" },
    password: { type: "string" },
    givenName: { type: "string" },
    familyName: { type: "string" },
  },
} as const;

interface RegisterBody {
  email: string;
  displayName: string;
  password: string;
  givenName?: string;
  familyName?: string;
}

/**
 * Authentication routes.
 *
 * Handlers here do one thing: translate HTTP to a use case and back. No
 * business logic, no repository access, no knowledge of Prisma. That is what
 * keeps the use cases testable without an HTTP server, and it is the pattern
 * every route added later should copy.
 *
 * Generic over the logger type for the same reason `buildApp` does not
 * annotate its return as a plain `FastifyInstance`: the app is built with a
 * concrete pino `Logger`, which is not structurally identical to Fastify's
 * own `FastifyBaseLogger` (Fastify's does not require `msgPrefix`). Pinning
 * the default here would reject the very instance `buildApp` produces.
 */
export function registerAuthRoutes<TLogger extends FastifyBaseLogger>(
  app: FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    TLogger
  >,
  container: Container,
): void {
  app.post<{ Body: RegisterBody }>(
    "/auth/register",
    { schema: { body: registerBodySchema } },
    async (request, reply) => {
      try {
        const result = await container.credentials.registerUserWithPassword.execute({
          email: request.body.email,
          displayName: request.body.displayName,
          password: request.body.password,
          ...(request.body.givenName === undefined ? {} : { givenName: request.body.givenName }),
          ...(request.body.familyName === undefined ? {} : { familyName: request.body.familyName }),
        });

        if (Result.isErr(result)) {
          sendDomainError(reply, result.error);
          return;
        }

        // Responds with the user, never the credential. The hash is redacted
        // from serialization anyway (see Credential.toJSON), but the right
        // answer is not to put it in the response object at all — belt and
        // braces, because a future refactor could change either one.
        const { user } = result.value;
        await reply.status(201).send({
          id: user.id,
          email: user.email.value,
          displayName: user.displayName.value,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
        });
      } catch (error) {
        sendError(reply, error);
      }
    },
  );
}
