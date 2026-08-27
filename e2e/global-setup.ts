import { assertLocalSupabase, seedFixtures } from "./fixtures/seed";
import { mintAdminStorageState } from "./auth";

/**
 * Runs once before the suite: verify we target a local stack, seed deterministic
 * fixtures, and mint a genuine admin session into storageState.
 */
export default async function globalSetup(): Promise<void> {
  assertLocalSupabase();
  await seedFixtures();
  await mintAdminStorageState();
}
