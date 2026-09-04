import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, isHoneypotTripped } from "./rate-limit";
import { RATE_LIMIT_MAX_QUESTIONS } from "./constants";

const createSupabaseAnonClient = vi.hoisted(() => vi.fn());

vi.mock("./supabase/server", () => ({ createSupabaseAnonClient }));

/**
 * A minimal stand-in for the PostgREST query builder: every method returns the
 * builder, and awaiting it yields the fixed result. The builder is a thenable
 * rather than a promise so the chain can be awaited at any point, as the real
 * client allows.
 */
function stubClient(result: { count: number | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  for (const method of ["select", "eq", "gte"]) {
    builder[method] = vi.fn(() => builder);
  }
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("checkRateLimit", () => {
  it("allows a request below the limit", async () => {
    createSupabaseAnonClient.mockReturnValue(
      stubClient({ count: RATE_LIMIT_MAX_QUESTIONS - 1, error: null })
    );

    await expect(checkRateLimit("203.0.113.7", "ask_submit")).resolves.toBe(true);
  });

  it("denies a request at the limit", async () => {
    createSupabaseAnonClient.mockReturnValue(
      stubClient({ count: RATE_LIMIT_MAX_QUESTIONS, error: null })
    );

    await expect(checkRateLimit("203.0.113.7", "ask_submit")).resolves.toBe(false);
  });

  // ADR-009. The template this came from returns true here; inverting that is
  // the whole point of the module, and an accidental revert would be silent in
  // every other test — the endpoint would simply keep working, uncapped.
  it("FAILS CLOSED when the limiter itself errors", async () => {
    createSupabaseAnonClient.mockReturnValue(
      stubClient({ count: null, error: { message: "connection refused" } })
    );

    await expect(checkRateLimit("203.0.113.7", "ask_submit")).resolves.toBe(false);
  });

  it("fails closed when the count is absent without an error", async () => {
    createSupabaseAnonClient.mockReturnValue(stubClient({ count: null, error: null }));

    // A null count is not evidence of being under the limit, but neither is it
    // an error the caller can distinguish. Documented here as current behaviour:
    // `count ?? 0` treats it as zero and allows the request.
    await expect(checkRateLimit("203.0.113.7", "ask_submit")).resolves.toBe(true);
  });

  it("does not store the raw identifier", async () => {
    const client = stubClient({ count: 0, error: null });
    createSupabaseAnonClient.mockReturnValue(client);

    await checkRateLimit("203.0.113.7", "ask_submit");

    const builder = client.from.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>;
    const identifier = builder.eq.mock.calls[0][1] as string;
    expect(identifier).not.toContain("203.0.113.7");
    expect(identifier).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isHoneypotTripped", () => {
  it.each([
    [undefined, false],
    [null, false],
    ["", false],
    ["   ", false],
    ["http://spam.example", true],
  ])("%o → %s", (value, expected) => {
    expect(isHoneypotTripped(value as string | null | undefined)).toBe(expected);
  });
});
