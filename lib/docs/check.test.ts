import { describe, expect, it } from "vitest";
import {
  adrsMissingFromIndex,
  adrsMissingTldr,
  brokenAnchors,
  brokenLinks,
  checkDocs,
  headingSlugs,
  markdownHeadings,
  markdownLinks,
  modulesMissingWalkthrough,
  resolveLink,
  slugify,
  TLDR_WITHIN_LINES,
  type DocFile,
  type DocsInput,
} from "./check";

const TLDR = "> **TL;DR**\n> - **Decision:** x\n> - **Because:** y\n> - **Cost:** z\n";

function adr(num: string, body: string): DocFile {
  return { path: `docs/adr/${num}-thing.md`, content: body };
}

describe("ADR TL;DR", () => {
  it("accepts a TL;DR under a one-line Status", () => {
    const content = `# ADR-001 — X\n\nStatus: **Accepted**\n\n${TLDR}\n## Context\n`;
    expect(adrsMissingTldr([adr("001", content)])).toEqual([]);
  });

  it("accepts a TL;DR under a Status paragraph that runs over several lines", () => {
    // Seven real ADRs have "Amended by …" / "Constrains …" continuation lines.
    const content =
      "# ADR-019 — X\n\nStatus: **Accepted**\n· settled in ADR-020\n" +
      `Constrains ADR-004.\n\n${TLDR}\n## Context\n`;
    expect(adrsMissingTldr([adr("019", content)])).toEqual([]);
  });

  it("flags an ADR with no TL;DR", () => {
    const violations = adrsMissingTldr([adr("002", "# ADR-002\n\nStatus: x\n\n## Context\n")]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "adr-tldr", path: "docs/adr/002-thing.md" });
  });

  it("flags a TL;DR buried below the top of the file", () => {
    // A summary the reader has to scroll to is not doing a summary's job.
    const padding = "filler\n".repeat(TLDR_WITHIN_LINES);
    expect(adrsMissingTldr([adr("003", `# ADR-003\n${padding}${TLDR}`)])).toHaveLength(1);
  });

  it("does not accept the words TL;DR in running prose", () => {
    const content = "# ADR-004\n\nStatus: x\n\nThe TL;DR is that we chose Y.\n";
    expect(adrsMissingTldr([adr("004", content)])).toHaveLength(1);
  });
});

describe("ADR index", () => {
  const index: DocFile = {
    path: "docs/adr/README.md",
    content: "| [001](001-thing.md) | X |\n| [002](002-thing.md#context) | Y |\n",
  };

  it("accepts ADRs linked by file name, with or without an anchor", () => {
    expect(
      adrsMissingFromIndex(["docs/adr/001-thing.md", "docs/adr/002-thing.md"], index)
    ).toEqual([]);
  });

  it("flags an ADR the index does not link", () => {
    expect(adrsMissingFromIndex(["docs/adr/024-new.md"], index)).toEqual([
      { rule: "adr-index", path: "docs/adr/024-new.md", detail: "not linked from docs/adr/README.md" },
    ]);
  });

  it("does not count a mention in inline code as a link", () => {
    const codeOnly: DocFile = { path: "docs/adr/README.md", content: "see `[1](001-thing.md)`\n" };
    expect(adrsMissingFromIndex(["docs/adr/001-thing.md"], codeOnly)).toHaveLength(1);
  });
});

describe("Python walkthrough", () => {
  const walkthrough: DocFile = {
    path: "docs/guide/python/walkthrough.md",
    content: "# Walkthrough\n\n## `hashing.py`: the port\n\nSee also `gold.py` in passing.\n",
  };

  it("accepts a module with its own heading", () => {
    expect(
      modulesMissingWalkthrough(["harness/apologia_eval/hashing.py"], walkthrough)
    ).toEqual([]);
  });

  it("flags a module mentioned only in body text", () => {
    expect(
      modulesMissingWalkthrough(["harness/apologia_eval/gold.py"], walkthrough)
    ).toEqual([
      {
        rule: "walkthrough",
        path: "docs/guide/python/walkthrough.md",
        detail: "no section heading for `gold.py`",
      },
    ]);
  });

  it("exempts the package marker", () => {
    expect(
      modulesMissingWalkthrough(["harness/apologia_eval/__init__.py"], walkthrough)
    ).toEqual([]);
  });

  it("does not let one module's name satisfy another's", () => {
    // `db.py` must not be satisfied by a heading for `bakeoff_db.py`.
    const other: DocFile = { path: "w.md", content: "## `bakeoff_db.py`\n" };
    expect(modulesMissingWalkthrough(["harness/apologia_eval/db.py"], other)).toHaveLength(1);
  });
});

describe("markdown links", () => {
  it("finds inline links and images with their line numbers", () => {
    const links = markdownLinks("intro\n[a](one.md) and ![b](img/two.png)\n");
    expect(links).toEqual([
      { target: "one.md", line: 2 },
      { target: "img/two.png", line: 2 },
    ]);
  });

  it("ignores links inside fenced code and inline code", () => {
    const content = "```md\n[x](fenced.md)\n```\n`[y](inline.md)`\n[z](real.md)\n";
    expect(markdownLinks(content).map((l) => l.target)).toEqual(["real.md"]);
  });

  it("ignores Mermaid node syntax", () => {
    const content = '```mermaid\nflowchart LR\n  db[("Postgres")] --> x["a"]\n```\n';
    expect(markdownLinks(content)).toEqual([]);
  });

  it("resolves relative to the linking file, dropping the anchor", () => {
    expect(resolveLink("docs/guide/05-data-model.md", "../adr/001-x.md#context")).toBe(
      "docs/adr/001-x.md"
    );
    expect(resolveLink("docs/guide/python/README.md", "../../../CLAUDE.md")).toBe("CLAUDE.md");
  });
});

describe("broken links", () => {
  const files = new Set(["docs/adr/001-x.md", "docs/guide/README.md", "CLAUDE.md"]);
  const exists = (path: string) => files.has(path);

  it("passes links that resolve and skips ones that are not ours", () => {
    const doc: DocFile = {
      path: "docs/guide/README.md",
      content:
        "[adr](../adr/001-x.md#why) [ext](https://example.test/x) " +
        "[mail](mailto:a@b.c) [here](#section) [root](../../CLAUDE.md)\n",
    };
    expect(brokenLinks([doc], exists)).toEqual({ violations: [], checked: 2 });
  });

  it("flags a link to a missing file, with its line", () => {
    const doc: DocFile = { path: "docs/guide/README.md", content: "ok\n[gone](06-gone.md)\n" };
    const { violations } = brokenLinks([doc], exists);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "link", path: "docs/guide/README.md:2" });
    expect(violations[0]!.detail).toContain("docs/guide/06-gone.md");
  });

  it("flags a link that climbs out of the repository", () => {
    const doc: DocFile = { path: "README.md", content: "[up](../elsewhere.md)\n" };
    expect(brokenLinks([doc], () => true).violations).toHaveLength(1);
  });
});

describe("heading slugs", () => {
  // Every expected value here is the anchor GitHub actually serves for that
  // heading, taken from a real link in this repository — not from running
  // slugify and writing down what it said.
  it("matches GitHub for a heading full of punctuation", () => {
    expect(slugify("Data model *(`0005` built and populated; `0006` planned)*")).toBe(
      "data-model-0005-built-and-populated-0006-planned"
    );
  });

  it("does NOT collapse the spaces a stripped character leaves behind", () => {
    // The em-dash goes, its two surrounding spaces stay, and each becomes a
    // hyphen. Collapsing them produces a slug that looks right and resolves to
    // nothing — the bug this check was written with.
    expect(slugify("2. Query path — a route handler *(planned, Milestone 1)*")).toBe(
      "2-query-path--a-route-handler-planned-milestone-1"
    );
    expect(slugify("4 · `--dryrun` wrote to the database")).toBe(
      "4----dryrun-wrote-to-the-database"
    );
  });

  it("keeps accented letters, because half this project's headings have them", () => {
    expect(slugify("Miért nem streamelünk?")).toBe("miért-nem-streamelünk");
  });

  it("keeps a heading link's text and drops its target", () => {
    expect(slugify("[Query path](06-query-path.md)")).toBe("query-path");
  });

  it("numbers repeated headings the way GitHub does", () => {
    const slugs = headingSlugs("## Go deeper\n\n## Go deeper\n\n## Go deeper\n");
    expect([...slugs]).toEqual(["go-deeper", "go-deeper-1", "go-deeper-2"]);
  });

  it("ignores a # comment inside a fenced block", () => {
    const content = "# Real\n\n```bash\n# once\nbrew install uv\n```\n\n## Also real\n";
    expect(markdownHeadings(content)).toEqual(["Real", "Also real"]);
  });
});

describe("broken anchors", () => {
  const target: DocFile = {
    path: "docs/architecture.md",
    content: "# Architecture\n\n## Two languages, one corpus\n",
  };

  it("passes a fragment that names a real heading", () => {
    const doc: DocFile = {
      path: "docs/guide/05-data-model.md",
      content: "[x](../architecture.md#two-languages-one-corpus)\n",
    };
    expect(brokenAnchors([doc, target])).toMatchObject({ violations: [], checked: 1 });
  });

  it("flags a fragment that names no heading, with its line", () => {
    const doc: DocFile = {
      path: "docs/guide/05-data-model.md",
      content: "intro\n[x](../architecture.md#two-languages)\n",
    };
    const { violations } = brokenAnchors([doc, target]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      rule: "anchor",
      path: "docs/guide/05-data-model.md:2",
    });
  });

  it("checks same-page fragments, which the file check cannot", () => {
    const doc: DocFile = {
      path: "docs/architecture.md",
      content: "# Architecture\n\n[a](#privileges) [b](#nope)\n\n### Privileges\n",
    };
    const { violations, checked } = brokenAnchors([doc]);
    expect(checked).toBe(2);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.detail).toContain("#nope");
  });

  it("counts an unresolvable target as skipped rather than passed", () => {
    const doc: DocFile = {
      path: "docs/architecture.md",
      content: "[sql](../supabase/migrations/0005_corpus.sql#L42)\n",
    };
    expect(brokenAnchors([doc])).toMatchObject({ violations: [], checked: 0, skipped: 1 });
  });

  it("ignores fragments on links that leave the repository", () => {
    const doc: DocFile = {
      path: "docs/architecture.md",
      content: "[ext](https://example.test/page#section)\n",
    };
    expect(brokenAnchors([doc])).toMatchObject({ checked: 0, skipped: 0 });
  });
});

describe("the whole check", () => {
  const good: DocsInput = {
    adrs: [adr("001", `# ADR-001\n\nStatus: x\n\n${TLDR}`)],
    adrIndex: { path: "docs/adr/README.md", content: "[001](001-thing.md)\n" },
    harnessModules: ["harness/apologia_eval/__init__.py", "harness/apologia_eval/metrics.py"],
    walkthrough: { path: "docs/guide/python/walkthrough.md", content: "## `metrics.py`\n" },
    linkedDocs: [{ path: "docs/guide/README.md", content: "[x](../adr/001-thing.md)\n" }],
    exists: (path) => path === "docs/adr/001-thing.md",
  };

  it("passes a consistent tree and reports what it counted", () => {
    const report = checkDocs(good);
    expect(report.ok).toBe(true);
    // __init__.py is not counted as a module.
    expect(report.counts).toEqual({
      adrs: 1,
      modules: 1,
      docs: 1,
      links: 1,
      anchors: 0,
      anchorsSkipped: 0,
    });
  });

  it("fails when it finds no ADRs, rather than passing over nothing", () => {
    const report = checkDocs({ ...good, adrs: [] });
    expect(report.ok).toBe(false);
    expect(report.violations.map((v) => v.rule)).toContain("vacuous");
  });

  it("fails when the only harness file is the package marker", () => {
    const report = checkDocs({ ...good, harnessModules: ["harness/apologia_eval/__init__.py"] });
    expect(report.violations).toContainEqual(
      expect.objectContaining({ rule: "vacuous", path: "harness/apologia_eval/" })
    );
  });

  it("fails when there are no relative links to check", () => {
    const report = checkDocs({ ...good, linkedDocs: [] });
    expect(report.violations).toContainEqual(
      expect.objectContaining({ rule: "vacuous", path: "docs/" })
    );
  });

  it("collects violations from every rule at once", () => {
    const report = checkDocs({
      ...good,
      adrs: [adr("001", "# ADR-001\n\nStatus: x\n")],
      harnessModules: ["harness/apologia_eval/metrics.py", "harness/apologia_eval/db.py"],
      exists: () => false,
    });
    expect(report.violations.map((v) => v.rule).sort()).toEqual([
      "adr-tldr",
      "link",
      "walkthrough",
    ]);
  });
});
