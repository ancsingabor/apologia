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
 * | anchors | a link's `#fragment` names no heading in the file it points at |
 *
 * ── Why anchors get their own check ─────────────────────────────────────────
 *
 * A heading is an API. `docs/guide/05-data-model.md` links to
 * `architecture.md#data-model-0005-built-and-populated-0006-planned`, an anchor
 * GitHub derives from that heading's exact words — so editing the heading
 * breaks the link, from a file the editor never opened. Nothing in the diff
 * looks wrong and the link still renders; it just lands at the top of the page
 * instead of the section. That is the failure shape this repository keeps
 * meeting (docs/guide/10-war-stories.md), which is why it is worth code rather
 * than a convention nobody remembers.
 *
 * `slugify` reimplements GitHub's rule: trim, lower-case, drop everything that
 * is not a letter, a digit, a space, `_` or `-`, then each remaining space
 * becomes a hyphen. Two details are load-bearing and both were got wrong
 * first time:
 *
 * - **Runs of spaces are NOT collapsed.** Stripping the em-dash out of
 *   `Query path — a route handler` leaves two spaces, so the anchor carries
 *   two hyphens: `…query-path--a-route-handler…`. Collapsing produces a slug
 *   that looks right and matches nothing.
 * - **Letters are Unicode.** `Miért` slugs to `miért`; stripping accents would
 *   be wrong for half this project's headings.
 *
 * ── What it cannot check, and must say so ───────────────────────────────────
 *
 * PRESENCE, NOT TRUTH. A TL;DR that misstates its ADR passes. A status page
 * that claims something is built when it is not passes. An anchor check proves
 * a heading with that name EXISTS — never that it still means what the linking
 * sentence claims. A section renamed in place keeps its slug and passes.
 *
 * Anchors into files outside the checked set — a `.sql` migration, a line
 * anchor like `#L42` — cannot be resolved and are counted as *skipped* rather
 * than passed. The report prints that count, because "we did not check this"
 * and "we checked and it was fine" must not read the same (ADR-020).
 *
 * Anchors get no vacuity check, unlike the sets below: a repository whose docs
 * legitimately contain no `#fragment` links would fail for having nothing
 * wrong. The printed count is the guard instead — if it falls to zero, that is
 * visible.
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

export type DocRule =
  | "adr-tldr"
  | "adr-index"
  | "walkthrough"
  | "link"
  | "anchor"
  | "vacuous";

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
 * Lines outside fenced code blocks, 1-based.
 *
 * Both callers need this and for the same reason: a `# comment` in a bash
 * fence is not a heading, and a link inside a fence is an example. The
 * walkthrough and `harness/README.md` are full of both.
 */
function proseLines(content: string): { text: string; line: number }[] {
  const lines: { text: string; line: number }[] = [];
  let fenced = false;
  content.split("\n").forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (!fenced) lines.push({ text: raw, line: index + 1 });
  });
  return lines;
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
  for (const { text, line } of proseLines(content)) {
    const stripped = text.replace(/`[^`]*`/g, "");
    for (const match of stripped.matchAll(
      /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
    )) {
      links.push({ target: match[1] as string, line });
    }
  }
  return links;
}

// ── Anchors ───────────────────────────────────────────────────────────────────

/** Heading text, in document order, ignoring fenced code. */
export function markdownHeadings(content: string): string[] {
  return proseLines(content)
    .map(({ text }) => /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[2]!);
}

/**
 * GitHub's heading → anchor rule. A link's text survives, its target does not,
 * so `## [Foo](bar.md)` anchors at `foo` rather than at `foobarmd`.
 */
export function slugify(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

/**
 * Every anchor a file offers. Repeated headings get `-1`, `-2` … exactly as
 * GitHub numbers them, so the second "Go deeper" is `#go-deeper-1`.
 */
export function headingSlugs(content: string): Set<string> {
  const seen = new Map<string, number>();
  const slugs = new Set<string>();
  for (const heading of markdownHeadings(content)) {
    const base = slugify(heading);
    if (!base) continue;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

/** The `#fragment` of a link target, decoded and lower-cased, or null. */
function fragmentOf(target: string): string | null {
  const hash = target.indexOf("#");
  if (hash === -1) return null;
  const raw = target.slice(hash + 1);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Anchors that name no heading in the file they point at.
 *
 * Same-page links (`#section`) are checked too — `isRelative` excludes them
 * from the file check because there is no file to find, but the heading they
 * name still has to exist.
 */
export function brokenAnchors(docs: DocFile[]): {
  violations: DocViolation[];
  checked: number;
  skipped: number;
} {
  const slugs = new Map(docs.map((doc) => [doc.path, headingSlugs(doc.content)]));
  const violations: DocViolation[] = [];
  let checked = 0;
  let skipped = 0;

  for (const doc of docs) {
    for (const { target, line } of markdownLinks(doc.content)) {
      const samePage = target.startsWith("#");
      if (!samePage && !isRelative(target)) continue;

      const fragment = fragmentOf(target);
      if (fragment === null) continue;

      const path = samePage ? doc.path : resolveLink(doc.path, target);
      const known = slugs.get(path);
      if (known === undefined) {
        skipped += 1;
        continue;
      }

      checked += 1;
      if (!known.has(fragment)) {
        violations.push({
          rule: "anchor",
          path: `${doc.path}:${line}`,
          detail: `${target} → ${path} has no heading anchored at #${fragment}`,
        });
      }
    }
  }
  return { violations, checked, skipped };
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
  counts: {
    adrs: number;
    modules: number;
    docs: number;
    links: number;
    anchors: number;
    anchorsSkipped: number;
  };
}

export function checkDocs(input: DocsInput): DocsReport {
  const links = brokenLinks(input.linkedDocs, input.exists);
  const anchors = brokenAnchors(input.linkedDocs);
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
    ...anchors.violations,
  ];

  return {
    ok: violations.length === 0,
    violations,
    counts: {
      adrs: input.adrs.length,
      modules: modules.length,
      docs: input.linkedDocs.length,
      links: links.checked,
      anchors: anchors.checked,
      anchorsSkipped: anchors.skipped,
    },
  };
}
