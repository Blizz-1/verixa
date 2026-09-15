import { buildApp } from "@verixa/api/app";
import type { Container } from "@verixa/api/composition-root";
import supertest from "supertest";

/**
 * Boots a real `apps/api` Fastify instance in-process (no network port bound
 * by us — Supertest talks to the underlying HTTP server directly over a
 * local socket) and returns a Supertest agent bound to it, plus a `close()`
 * that tears the instance down cleanly.
 *
 * Deliberately imports `@verixa/api/app` (which only builds the app) rather
 * than `@verixa/api` (which is `server.ts` — it loads config and calls
 * `listen()` as a module-load side effect, which is exactly what a test
 * harness must avoid).
 */
export interface HttpTestClient {
  /** A Supertest agent — call `.get("/path")`, `.post("/path")`, etc. */
  request: ReturnType<typeof supertest>;
  /** Closes the underlying Fastify instance. Always call this, even on failure. */
  close: () => Promise<void>;
}

export async function createHttpTestClient(container?: Container): Promise<HttpTestClient> {
  const app = buildApp(container === undefined ? {} : { container });
  await app.ready();

  return {
    request: supertest(app.server),
    close: () => app.close(),
  };
}
