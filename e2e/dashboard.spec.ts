import { test, expect } from "@playwright/test";
import { TEST_ADMIN } from "./fixtures/seed";

/**
 * Example E2E covering the template's admin auth guard. It exercises the whole
 * stack — genuine Supabase session cookies → Next.js proxy → server-side
 * requireAdmin() → rendered page — with no email round-trip and no production
 * data. Use it as the pattern for your own journeys (see e2e/fixtures/seed.ts
 * to seed domain fixtures, then assert on them here).
 */
test.describe("Admin dashboard auth guard", () => {
  test("an authenticated admin can load the dashboard", async ({ page }) => {
    // The page inherits the genuine admin session from the config's storageState.
    await page.goto("/dashboard");

    // Not bounced to login, and the signed-in admin's email is rendered.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(TEST_ADMIN.email)).toBeVisible();
  });

  test("an anonymous visitor is redirected to login", async ({ browser }) => {
    // Fresh context with no storageState → no session cookies. (A default context
    // would otherwise inherit the admin storageState from the config's `use`.)
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anon.newPage();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    await anon.close();
  });
});
