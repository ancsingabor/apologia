import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitManifest, type EmittedDocument } from "./emit";

/**
 * Deterministic file logic, so it belongs under Vitest by ADR-015's axis.
 *
 * It was previously untestable — the manifest path was a module constant, so
 * exercising it meant clobbering the real `corpus/manifest.lock.yaml`. That is
 * the same shape as the arg-parsing bug: logic nobody could run in isolation,
 * carrying a hole nobody could see.
 */

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "apologia-emit-"));
  path = join(dir, "manifest.lock.yaml");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const doc = (over: Partial<EmittedDocument> = {}): EmittedDocument => ({
  sourceId: "ccc",
  language: "hu",
  revision: "1997+2018",
  edition: null,
  encoding: "utf-8",
  indexUrl: "https://katolikus.hu/cikk/a-katolikus-egyhaz-katekizmusa",
  parser: "katolikus-hu-numbered-paragraph",
  chunking: "numbered-paragraph@1",
  contentHash: "a".repeat(64),
  unitCount: 2865,
  chunkCount: 2865,
  pages: [{ slug: "kek-005-006", raw_hash: "b".repeat(64) }],
  unnumberedPages: ["kek-005-006"],
  skipped: { "heading-bold": 525 },
  report: { ok: true, unitCount: 2865, undeclared: [], stale: [] },
  ...over,
});

async function mtime(file: string) {
  return (await stat(file)).mtimeMs;
}

describe("writing", () => {
  it("writes when no manifest exists", async () => {
    const result = await emitManifest(doc(), path);

    expect(result.written).toBe(true);
    const written = await readFile(path, "utf8");
    expect(written).toContain("content_hash: " + "a".repeat(64));
    expect(written).toContain("unit_count: 2865");
  });

  it("ships no corpus text — only locators, hashes, counts and URLs", async () => {
    // ADR-003. The file is committed, so this is the check that keeps it
    // shippable as the emitted fields grow.
    await emitManifest(doc(), path);
    const written = await readFile(path, "utf8");

    expect(written).not.toMatch(/bekezdés|Ábrahám|Jegyzetek/);
  });

  it("records the assertion outcome, so 'ingested' and 'ingested cleanly' differ", async () => {
    await emitManifest(
      doc({ report: { ok: true, unitCount: 2865, undeclared: [], stale: [] } }),
      path
    );
    expect(await readFile(path, "utf8")).toContain("ok: true");
  });
});

describe("content-addressed writes", () => {
  it("does not rewrite when the content is identical", async () => {
    await emitManifest(doc(), path);
    const before = await mtime(path);

    // `generated_at` is excluded from the comparison, so an identical corpus is
    // not a diff. Otherwise every no-op ingest would dirty a committed file and
    // train people to `git checkout` it.
    const result = await emitManifest(doc(), path);

    expect(result.written).toBe(false);
    expect(await mtime(path)).toBe(before);
  });

  it("rewrites when the content hash moves", async () => {
    await emitManifest(doc(), path);
    const result = await emitManifest(doc({ contentHash: "c".repeat(64) }), path);

    expect(result.written).toBe(true);
    expect(await readFile(path, "utf8")).toContain("c".repeat(64));
  });

  it("rewrites when a page's raw hash moves but the corpus did not", async () => {
    // A re-theming: same words, different bytes. The document hash holds, but
    // provenance changed and the manifest should say so.
    await emitManifest(doc(), path);
    const result = await emitManifest(
      doc({ pages: [{ slug: "kek-005-006", raw_hash: "d".repeat(64) }] }),
      path
    );

    expect(result.written).toBe(true);
  });
});

describe("recovery", () => {
  it("rewrites a manifest that was deleted, for an unchanged corpus", async () => {
    // THE REGRESSION. emit used to be called only after a run that ingested, so
    // an emit that failed was unrecoverable: the next run reported "unchanged"
    // and returned before reaching it, and no flag rewrote the file. Recovery
    // meant deleting a document row by hand.
    await emitManifest(doc(), path);
    await rm(path);

    const result = await emitManifest(doc(), path);

    expect(result.written).toBe(true);
    expect(await readFile(path, "utf8")).toContain("unit_count: 2865");
  });

  it("rewrites a truncated manifest rather than reading it as empty", async () => {
    await writeFile(path, "# half a file\n", "utf8");
    expect((await emitManifest(doc(), path)).written).toBe(true);
  });
});

describe("merging", () => {
  it("leaves another language's entry alone", async () => {
    await emitManifest(doc({ language: "en", contentHash: "e".repeat(64) }), path);
    await emitManifest(doc({ language: "hu" }), path);

    const written = await readFile(path, "utf8");
    expect(written).toContain("e".repeat(64));
    expect(written).toContain("a".repeat(64));
  });

  it("replaces its own entry rather than appending a duplicate", async () => {
    await emitManifest(doc(), path);
    await emitManifest(doc({ unitCount: 2864 }), path);

    const written = await readFile(path, "utf8");
    expect(written).toContain("unit_count: 2864");
    expect(written).not.toContain("unit_count: 2865");
  });

  it("moves the corpus hash when any document changes", async () => {
    await emitManifest(doc(), path);
    const first = /corpus_hash: (\w+)/.exec(await readFile(path, "utf8"))![1];

    await emitManifest(doc({ language: "en", contentHash: "f".repeat(64) }), path);
    const second = /corpus_hash: (\w+)/.exec(await readFile(path, "utf8"))![1];

    expect(second).not.toBe(first);
  });
});
