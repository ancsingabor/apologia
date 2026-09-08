/**
 * Argument parsing for the ingest CLI.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 *
 * It is deterministic logic with no I/O, so by ADR-015's axis it belongs under
 * Vitest — and it could not be tested while it lived in `main.ts`, because that
 * file calls `main()` at module scope and importing anything from it runs the
 * whole pipeline. Untestable pure logic is where the bug below came from.
 *
 * ── The bug this file exists to fix ─────────────────────────────────────────
 *
 * The first version matched anything flag-SHAPED, put it in a map, and read the
 * keys it knew. An unknown key was therefore accepted and ignored:
 *
 *     --dry-run   → dryRun = true
 *     --dryrun    → dryRun = false   ← and the ingest writes
 *     --dry-runn  → dryRun = false   ← and the ingest writes
 *
 * Its error said "Unrecognised argument", which only ever fired for things that
 * did not look like flags at all (`foo`, `-x`) — so the message actively
 * misdescribed what it checked. A typo in the one flag whose whole job is *do
 * not write* silently produced a write.
 *
 * That is the failure class this repository is built around: not a crash, but a
 * plausible-looking success that did the opposite of what was asked. So the
 * parser is now closed rather than open — every flag is declared, an unknown
 * one is fatal, and a boolean flag given a non-boolean value is fatal too.
 */

export const USAGE = `
Usage: npm run ingest -- --source=<id> --language=<hu|en> [options]

  --dry-run     fetch, parse and assert; touch no database
  --refetch     bypass the .corpus-cache/ and re-download every page
  --remote      permit writing to a non-local Supabase target
`;

export interface Args {
  source: string;
  language: string;
  dryRun: boolean;
  refetch: boolean;
  remote: boolean;
}

/** Flags taking a value. */
const VALUE_FLAGS = ["source", "language"] as const;

/** Flags that are present or absent. `=true` / `=false` are also accepted. */
const BOOLEAN_FLAGS = ["dry-run", "refetch", "remote"] as const;

const KNOWN = new Set<string>([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

function suggest(unknown: string): string {
  // A one-edit-away suggestion turns "unknown flag" into "you meant this",
  // which is the difference between the message being right and being useful.
  const near = [...KNOWN].filter(
    (flag) =>
      flag.replace(/-/g, "") === unknown.replace(/-/g, "") ||
      flag.startsWith(unknown.slice(0, 3))
  );
  return near.length > 0 ? ` Did you mean --${near[0]}?` : "";
}

export function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();

  for (const arg of argv) {
    const match = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(arg);
    if (!match) {
      throw new Error(`Not a flag: ${arg}\n${USAGE}`);
    }

    const [, name, value] = match;
    if (!KNOWN.has(name)) {
      throw new Error(
        `Unknown flag --${name}.${suggest(name)}\n` +
          `Known flags: ${[...KNOWN].map((f) => `--${f}`).join(", ")}\n${USAGE}`
      );
    }
    if (flags.has(name)) {
      throw new Error(`--${name} given twice.\n${USAGE}`);
    }

    if ((BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      if (value !== undefined && value !== "true" && value !== "false") {
        throw new Error(
          `--${name} is a switch; it takes no value (got "${value}").\n${USAGE}`
        );
      }
      flags.set(name, value ?? "true");
    } else {
      if (value === undefined || value === "") {
        throw new Error(`--${name} needs a value, e.g. --${name}=ccc\n${USAGE}`);
      }
      flags.set(name, value);
    }
  }

  const source = flags.get("source");
  const language = flags.get("language");
  if (!source || !language) {
    throw new Error(`--source and --language are both required.\n${USAGE}`);
  }

  return {
    source,
    language,
    dryRun: flags.get("dry-run") === "true",
    refetch: flags.get("refetch") === "true",
    remote: flags.get("remote") === "true",
  };
}
