import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest covers the deterministic half of the system. What belongs here, what
 * belongs in Playwright, and what belongs in the eval harness is argued in
 * docs/adr/015-testing-strategy.md — the axis is determinism, not stack layer.
 *
 * `e2e/` is excluded on purpose: those are Playwright specs and would otherwise
 * be collected by both runners.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
