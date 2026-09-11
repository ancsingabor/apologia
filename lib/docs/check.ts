import { posix } from "node:path";

/**
 * The structural checks behind `npm run docs:lint`.
 *
 * The documentation is layered (docs/guide/README.md): a short human guide on
 * top, the ADRs and long docs underneath, module headers at the bottom. The
 * layers drift apart silently — status was restated in five files and all
 * five had drifted before anyone noticed. A rule in CLAUDE.md says to keep
 * them in step; prose is not a check, so the parts of that rule a machine CAN
 * verify are verified here:
 *
 * | Check | Fails when |
 * |---|---|
 * | ADR TL;DR | an ADR has no `> **TL;DR**` block near its top |
 * | ADR index | an ADR file is not linked from `docs/adr/README.md` |
 * | walkthrough | a harness module has no section in the Python walkthrough |
 * | links | a relative markdown link points at a file that does not exist |
 *
 * ── What it cannot check, and must say so ───────────────────────────────────
 *
 * PRESENCE, NOT TRUTH. A TL;DR that misstates its ADR passes. A status page
 * that claims something is built when it is not passes. Link anchors
 * (`file.md#section`) are not resolved — only the file is. The report states
 * these limits in its summary line, because "we did not check this" and "we
 * checked and it was fine" must not read the same (ADR-020).
 *
 * ── Non-vacuity ─────────────────────────────────────────────────────────────
 *
 * Every check runs over a set, and a check over an empty set passes. A moved
 * directory or a wrong root would make all four report clean while checking
 * nothing — the failure this repository keeps meeting
 * (docs/guide/09-quality.md). So an empty input is itself a violation.
 *
 * Everything here is a pure function over `{ path, content }`: the filesystem
 * stays in `scripts/docs-lint.ts`, which is what lets the rules be unit tested.
 */

/** A markdown file, addressed by its repo-relative POSIX path. */
export interface DocFile {
  path: string;
  content: string;
}

export type DocRule = "adr-tldr" | "adr-index" | "walkthrough" | "link" | "vacuous";

export interface DocViolation {
  rule: DocRule;
  path: string;
  detail: string;
}

export const TLDR_MARKER = "> **TL;DR**";

/**
 * How far down an ADR its TL;DR may start. The Status paragraph can run to
 * three or four lines ("Amended by …", "Constrains …"); a TL;DR below this is
 * buried, which defeats the point of having one.
 */
export const TLDR_WITHIN_LINES = 20;

// ── ADRs ──────────────────────────────────────────────────────────────────────

export function adrsMissingTldr(adrs: DocFile[]): DocViolation[] {
  return adrs
    .filter(
      (adr) =>
        !adr.content
          .split("\n")
          .slice(0, TLDR_WITHIN_LINES)
          .some((line) => line.startsWith(TLDR_MARKER))
    )
    .map((adr) => ({
      rule: "adr-tldr",
      path: adr.path,
      detail: `no "${TLDR_MARKER}" block in the first ${TLDR_WITHIN_LINES} lines`,
    }));
}

/** Every ADR file must be linked from the index by its file name. */
export function adrsMissingFromIndex(adrPaths: string[], index: DocFile): DocViolation[] {
  const linked = new Set(
    markdownLinks(index.content).map(({ target }) => posix.basename(stripFragment(target)))
  );
  return adrPaths
    .filter((path) => !linked.has(posix.basename(path)))
    .map((path) => ({
      rule: "adr-index",
      path,
      detail: `not linked from ${index.path}`,
    }));
}

// ── The Python walkthrough ────────────────────────────────────────────────────

/**
 * Every harness module needs a HEADING in the walkthrough naming it, e.g.
 * "## `metrics.py`: …". A mention in body text does not count: a module named
 * only in passing has not been walked through. `__init__.py` is exempt — it is
 * a package marker, not a module anyone learns from.
 */
export function modulesMissingWalkthrough(
  modulePaths: string[],
  walkthrough: DocFile
): DocViolation[] {
  const headings = walkthrough.content
    .split("\n")
    .filter((line) => /^#{1,6}\s/.test(line));
  return modulePaths
    .map((path) => posix.basename(path))
    .filter((name) => name !== "__init__.py")
    .filter((name) => !headings.some((heading) => heading.includes(`\`${name}\``)))
    .map((name) => ({
      rule: "walkthrough",
      path: walkthrough.path,
      detail: `no section heading for \`${name}\``,
    }));
}

// ── Links ─────────────────────────────────────────────────────────────────────

export interface MarkdownLink {
  target: string;
  /** 1-based, for the report. */
  line: number;
}

/**
 * Inline markdown links and images, `[text](target)`, outside code.
 *
 * Fenced blocks and inline code spans are blanked first: a link written inside
 * backticks is an example, not a reference, and Mermaid node syntax like
 * `db[("Postgres")]` would otherwise come close to matching.
 */
export function markdownLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  let fenced = false;
  content.split("\n").forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const line = raw.replace(/`[^`]*`/g, "");
    for (const match of line.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ target: match[1] as string, line: index + 1 });
    }
  });
  return links;
}

function stripFragment(target: string): string {
  return target.split("#")[0]!.split("?")[0]!;
}

/** Links that leave the repository, or stay on the same page, are not ours to check. */
function isRelative(target: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#");
}

/** The repo-relative path a relative link from `from` points at. */
export function resolveLink(from: string, target: string): string {
  return posix.normalize(
    posix.join(posix.dirname(from), decodeURIComponent(stripFragment(target)))
  );
}

export function brokenLinks(
  docs: DocFile[],
  exists: (repoPath: string) => boolean
): { violations: DocViolation[]; checked: number } {
  const violations: DocViolation[] = [];
  let checked = 0;
  for (const doc of docs) {
    for (const { target, line } of markdownLinks(doc.content)) {
      if (!isRelative(target)) continue;
      checked += 1;
      const resolved = resolveLink(doc.path, target);
      if (resolved.startsWith("..") || !exists(resolved)) {
        violations.push({
          rule: "link",
          path: `${doc.path}:${line}`,
          detail: `${target} → ${resolved} does not exist`,
        });
      }
    }
  }
  return { violations, checked };
}

// ── All of it ─────────────────────────────────────────────────────────────────

export interface DocsInput {
  adrs: DocFile[];
  adrIndex: DocFile;
  harnessModules: string[];
  walkthrough: DocFile;
  linkedDocs: DocFile[];
  exists: (repoPath: string) => boolean;
}

export interface DocsReport {
  ok: boolean;
  violations: DocViolation[];
  counts: { adrs: number; modules: number; docs: number; links: number };
}

export function checkDocs(input: DocsInput): DocsReport {
  const links = brokenLinks(input.linkedDocs, input.exists);
  const modules = input.harnessModules.filter(
    (path) => posix.basename(path) !== "__init__.py"
  );

  const vacuous: DocViolation[] = [];
  const empty = (what: string, where: string) =>
    vacuous.push({
      rule: "vacuous",
      path: where,
      detail: `found no ${what} — a check over nothing passes, so this fails instead`,
    });
  if (input.adrs.length === 0) empty("ADRs", "docs/adr/");
  if (modules.length === 0) empty("harness modules", "harness/apologia_eval/");
  if (links.checked === 0) empty("relative links", "docs/");

  const violations = [
    ...vacuous,
    ...adrsMissingTldr(input.adrs),
    ...adrsMissingFromIndex(
      input.adrs.map((adr) => adr.path),
      input.adrIndex
    ),
    ...modulesMissingWalkthrough(modules, input.walkthrough),
    ...links.violations,
  ];

  return {
    ok: violations.length === 0,
    violations,
    counts: {
      adrs: input.adrs.length,
      modules: modules.length,
      docs: input.linkedDocs.length,
      links: links.checked,
    },
  };
}
