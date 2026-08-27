import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./e2e/auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Playwright config for the E2E suite.
 *
 * This config and the e2e/ directory are test-only — they are not imported by
 * the Next.js app and are not part of `next build`. The suite is wired to a
 * local `supabase start` stack by scripts/e2e.sh (which exports the local
 * Supabase env this process and the webServer inherit).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Inherits the local Supabase env exported by scripts/e2e.sh.
  },
});
