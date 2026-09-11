import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { checkDocs, type DocFile, type DocViolation } from "@/lib/docs/check";

/**
 * `npm run docs:lint [root]`
 *
 * Checks that the documentation's layers still line up: every ADR has a
 * TL;DR and an index entry, every harness module has a walkthrough section,
 * every relative link resolves. The rules, and what they deliberately cannot
 * check, are in `lib/docs/check.ts`; this file only reads the tree and prints.
 *
 * `root` defaults to the working directory. Passing an empty directory is how
 * the vacuity check is exercised by hand: it must fail, not pass over nothing.
 */

const root = process.argv[2] ?? ".";

/** The markdown whose relative links are checked, besides everything in docs/. */
const TOP_LEVEL_DOCS = ["README.md", "TESTING.md", "CLAUDE.md", "harness/README.md", "eval/README.md"];

const toRepoPath = (absolute: string) => relative(root, absolute).split(sep).join("/");

async function read(path: string): Promise<DocFile> {
  const full = join(root, path);
  return { path, content: existsSync(full) ? await readFile(full, "utf8") : "" };
}

async function list(dir: string, pattern: RegExp, recursive = false): Promise<string[]> {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  const entries = await readdir(full, { recursive, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => toRepoPath(join(entry.parentPath, entry.name)))
    .sort();
}

function report(violations: DocViolation[]): void {
  const byRule = Map.groupBy(violations, (v) => v.rule);
  for (const [rule, items] of byRule) {
    console.log(`\n  ✗ ${rule} — ${items.length}`);
    for (const v of items.slice(0, 40)) console.log(`      ${v.path}  ${v.detail}`);
    if (items.length > 40) console.log(`      … and ${items.length - 40} more`);
  }
}

async function main(): Promise<void> {
  const adrPaths = await list("docs/adr", /^\d{3}-.*\.md$/);
  const docPaths = [
    ...(await list("docs", /\.md$/, true)),
    ...TOP_LEVEL_DOCS.filter((path) => existsSync(join(root, path))),
  ];

  const result = checkDocs({
    adrs: await Promise.all(adrPaths.map(read)),
    adrIndex: await read("docs/adr/README.md"),
    harnessModules: await list("harness/apologia_eval", /\.py$/),
    walkthrough: await read("docs/guide/python/walkthrough.md"),
    linkedDocs: await Promise.all(docPaths.map(read)),
    exists: (path) => existsSync(join(root, path)),
  });

  const { adrs, modules, docs, links } = result.counts;
  console.log(`\n▶ docs:lint — ${root === "." ? "repository" : root}\n`);
  console.log(`  adrs         ${adrs} checked for a TL;DR and an index entry`);
  console.log(`  harness      ${modules} module(s) checked for a walkthrough section`);
  console.log(`  links        ${links} relative link(s) across ${docs} file(s)`);

  if (!result.ok) {
    report(result.violations);
    console.error(`\n✗ ${result.violations.length} problem(s). See CLAUDE.md § Human layer.\n`);
    process.exit(1);
  }

  // The limits are part of the verdict, not a footnote: a green line that
  // implies more than was checked is the failure this repo keeps meeting.
  console.log(
    `\n✓ structure intact. Not checked: link #anchors; whether any TL;DR or ` +
      `status claim is TRUE — that is review's job.\n`
  );
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
