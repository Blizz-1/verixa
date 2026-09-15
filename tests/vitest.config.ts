import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../vitest.config.js";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "@verixa/integration-tests",

      /**
       * Spec files run one at a time, not in parallel.
       *
       * They share a single Postgres database, and several of them assert on
       * whole-table state (`prisma.user.count()`) or truncate tables in
       * `afterEach`. Run concurrently, those interleave: `index-usage.spec.ts`
       * seeds 3000 users, another file's `afterEach` deletes them mid-run, and
       * assertions see counts belonging to a different file entirely.
       *
       * That is exactly what CI caught — `expected 3002 to be 1`, plus a
       * foreign-key violation where one file deleted users another was still
       * inserting memberships for. Every individual test was correct; the
       * suite was not.
       *
       * Serial execution is the honest fix for a shared resource. It costs
       * wall-clock time, and the alternative — a separate database per spec
       * file — is genuinely better but belongs with the Testcontainers work
       * rather than bolted on here. Noted rather than silently accepted.
       */
      fileParallelism: false,
    },
  }),
);
