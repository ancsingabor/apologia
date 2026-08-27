import crypto from "crypto";
import { createSupabaseAnonClient } from "./supabase/server";
import {
  RATE_LIMIT_MAX_QUESTIONS,
  RATE_LIMIT_WINDOW_MINUTES,
} from "./constants";

/**
 * IP rate limiting for the public ask endpoint.
 *
 * Backed by the `rate_limit_log` table. Identifiers (IPs) are hashed before
 * storage so no raw PII is kept. `action` lets one table serve several
 * endpoints (e.g. "ask_submit").
 *
 * ⚠️ This module fails CLOSED, inverting the behaviour of the template it came
 * from. That template limits contact forms, where dropping a real enquiry costs
 * more than accepting a duplicate one, so an errored check allows the request.
 * Here every accepted request spends money on an embedding call and a
 * generation call, and an outage of the limiter is exactly when an abusive
 * caller is most likely to be the reason. Availability of the ask endpoint is
 * worth less than a bounded bill. See ADR-009.
 */

/** Hash an identifier (IP or email) before storing — avoids keeping raw PII. */
function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Returns true if the request should be allowed (under the limit).
 * Fails closed: if the check itself errors, the request is denied.
 */
export async function checkRateLimit(
  ip: string,
  action: string
): Promise<boolean> {
  const supabase = createSupabaseAnonClient();
  const identifier = hashIdentifier(ip);
  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  const { count, error } = await supabase
    .from("rate_limit_log")
    .select("*", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("action", action)
    .gte("created_at", windowStart);

  if (error) {
    console.error("Rate limit check failed, denying request:", error.message);
    return false;
  }

  return (count ?? 0) < RATE_LIMIT_MAX_QUESTIONS;
}

/** Log a request against the rate limit for a given IP + action. */
export async function logSubmission(ip: string, action: string): Promise<void> {
  const supabase = createSupabaseAnonClient();

  const { error } = await supabase
    .from("rate_limit_log")
    .insert([{ identifier: hashIdentifier(ip), action }]);

  if (error) {
    console.error("Failed to log rate limit entry:", error.message);
  }
}

/**
 * Honeypot helper. Render a hidden field (e.g. name="website") that real users
 * never fill. If `getHoneypotValue` returns a non-empty string, treat the
 * submission as a bot and silently reject it.
 */
export function isHoneypotTripped(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
