import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The integration layer of ADR-015: deterministic code that crosses a real
 * Postgres — unit upsert, locator resolution, and later pgvector top-k.
 *
 * ADR-015 left the runner for this row deliberately open, to be decided when
 * the first such test was written. It is Vitest, not Playwright; see
 * ADR-015 § Amendment and the header of integration/corpus-upsert.test.ts.
 *
 * Separate from `vitest.config.mts` because these need a running Supabase
 * stack. `npm test` must stay sub-second and service-free so that a parser or
 * verifier regression fails CI in seconds rather than after a stack boot.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    // A stack boot plus 2,865-row inserts are not sub-second work.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Shared tables and a truncating `beforeEach` do not survive parallelism.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
