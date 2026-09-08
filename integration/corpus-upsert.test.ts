import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { chunkNumberedParagraph } from "@/lib/corpus/chunk";
import { parseErrata } from "@/lib/corpus/errata";
import { parseManifest } from "@/lib/corpus/manifest";
import { compareLocators } from "@/lib/corpus/cross-lingual";
import { documentContentHash } from "@/lib/corpus/hash";
import {
  currentLocators,
  currentUnits,
  siblingLanguages,
} from "@/scripts/ingest/siblings";
import { upsertDocument } from "@/scripts/ingest/upsert";
import type {
  ManifestDocument,
  ManifestSource,
  ParsedUnit,
} from "@/types/domain";

/**
 * Integration tests for the ingest upsert — the layer that crosses a real
 * Postgres.
 *
 * ⚠️ THIS FILE RESOLVES ADR-015's DELIBERATELY OPEN ROW. That ADR left
 * "whether unit-upsert and pgvector tests run under Vitest against the local
 * stack, or as Playwright fixtures reusing scripts/e2e.sh" undecided, to be
 * settled "when the first such test is written, not now". This is that test,
 * and the answer is Vitest — see ADR-015 § Amendment. The reasoning in one
 * line: nothing here is user-visible, so Playwright would contribute a browser
 * and a Next build to a test about six SQL statements.
 *
 * ── What is being tested, and why it cannot be a unit test ──────────────────
 *
 * `supabase-js` speaks PostgREST and has no transactions, so the upsert buys
 * atomicity with ORDERING instead: insert not-current, fill, then demote and
 * promote. The properties that ordering is supposed to deliver — exactly one
 * current document, a crashed run leaving a sweepable signature, an unchanged
 * corpus writing nothing — are properties of the database's constraints as much
 * as of the code. In particular `documents_one_current_per_language_idx` is a
 * partial unique index doing real work here, and a mock would simply agree with
 * whatever the code did.
 *
 * The corpus is INVENTED, as everywhere else in the suite: these tests are
 * about row-level behaviour, and 2,865 real paragraphs would ship corpus text
 * (ADR-003) and make the suite slow for no extra coverage.
 */

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

/**
 * Hard guard, in the spirit of `e2e/fixtures/seed.ts`. This suite TRUNCATES the
 * corpus tables, so unlike the ingest CLI — which may legitimately target the
 * cloud project with --remote — it must never run anywhere but a local stack.
 */
function localClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Run via `npm run test:integration` — scripts/integration.sh wires up the local stack."
    );
  }
  if (!LOCAL_HOSTS.includes(new URL(url).hostname)) {
    throw new Error(`Refusing to run against a non-local target: ${url}`);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SOURCE: ManifestSource = {
  id: "test-source",
  title: "A Test Work",
  kind: "church_document",
  authorityTier: 2,
  author: null,
  languages: ["hu"],
  license: "test-licence",
  licenseNote: null,
  locatorScheme: "test:<paragraph>",
  chunking: "numbered-paragraph",
  canonicalUrl: null,
  expectedUnits: 3,
  documents: [],
};

const DOCUMENT: ManifestDocument = {
  language: "hu",
  revision: "1997+2018",
  edition: null,
  indexUrl: "https://example.test/index",
  fetch: "katolikus-hu-toc",
  parser: "katolikus-hu-numbered-paragraph",
  encoding: "utf-8",
  errata: null,
};

function units(count: number, textSuffix = "", skip: number[] = []): ParsedUnit[] {
  return Array.from({ length: count }, (_, index) => index + 1)
    .filter((paragraph) => !skip.includes(paragraph))
    .map((paragraph) => {
      return {
        locator: `test:${paragraph}`,
        paragraph,
        anchor: `K${String(paragraph).padStart(4, "0")}`,
        relabelledFrom: null,
        text: `A ${paragraph}. bekezdés szövege.${textSuffix}`,
        role: null,
        page: "test-page",
        ordinal: paragraph,
      };
    });
}

const silent = () => {};

async function ingest(
  db: SupabaseClient,
  parsed: ParsedUnit[],
  document: ManifestDocument = DOCUMENT
) {
  return upsertDocument({
    db,
    source: SOURCE,
    document,
    units: parsed,
    chunks: chunkNumberedParagraph(parsed),
    contentHash: documentContentHash(parsed),
    log: silent,
  });
}

const db = localClient();

async function clean() {
  // Cascades from `sources` clear documents, units, chunks and chunk_units.
  await db.from("sources").delete().eq("id", SOURCE.id);
}

beforeAll(clean);
beforeEach(clean);
afterAll(clean);

async function documents() {
  const { data } = await db
    .from("documents")
    .select("id, content_hash, unit_count, is_current")
    .eq("source_id", SOURCE.id);
  return data ?? [];
}

async function countUnits(documentId: string) {
  const { count } = await db
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);
  return count ?? 0;
}

describe("a clean ingest", () => {
  it("lands units, chunks and links, and promotes the document", async () => {
    const result = await ingest(db, units(3));

    expect(result.status).toBe("ingested");
    expect(result.unitCount).toBe(3);

    const [document] = await documents();
    expect(document).toMatchObject({ is_current: true, unit_count: 3 });
    expect(await countUnits(document.id)).toBe(3);

    // Scoped to this document's chunks: the same local stack holds the real
    // ingested corpus, so an unscoped count measures whatever else is there.
    const { data: chunks } = await db
      .from("chunks")
      .select("id")
      .eq("document_id", document.id);
    expect(chunks).toHaveLength(3);

    const { count: links } = await db
      .from("chunk_units")
      .select("chunk_id", { count: "exact", head: true })
      .in("chunk_id", (chunks ?? []).map((c) => c.id as string));
    expect(links).toBe(3);
  });

  it("upserts the source from the manifest", async () => {
    await ingest(db, units(3));

    const { data } = await db
      .from("sources")
      .select("title, authority_tier, chunking")
      .eq("id", SOURCE.id)
      .single();

    expect(data).toMatchObject({
      title: "A Test Work",
      authority_tier: 2,
      chunking: "numbered-paragraph",
    });
  });

  it("records the tradition's locators as non-synthetic", async () => {
    await ingest(db, units(1));
    const { data } = await db
      .from("units")
      .select("locator, locator_is_synthetic")
      .eq("locator", "test:1")
      .single();

    expect(data).toMatchObject({ locator_is_synthetic: false });
  });
});

describe("idempotency", () => {
  it("writes nothing when the content hash is unchanged", async () => {
    await ingest(db, units(3));
    const before = await documents();

    const second = await ingest(db, units(3));

    expect(second.status).toBe("unchanged");
    expect(await documents()).toHaveLength(before.length);
  });
});

describe("a changed corpus", () => {
  it("inserts a new document and demotes the old one", async () => {
    await ingest(db, units(3));
    const result = await ingest(db, units(3, " Javítva."));

    expect(result.status).toBe("ingested");

    const all = await documents();
    expect(all).toHaveLength(2);
    expect(all.filter((d) => d.is_current)).toHaveLength(1);
    expect(all.find((d) => d.is_current)?.id).toBe(result.documentId);
  });

  it("keeps the superseded document's units intact", async () => {
    // 0005_corpus: re-ingesting inserts rather than mutates, so stored
    // citations keep resolving against the text they were verified against.
    const first = await ingest(db, units(3));
    await ingest(db, units(3, " Javítva."));

    expect(await countUnits(first.documentId!)).toBe(3);

    const { data } = await db
      .from("units")
      .select("text")
      .eq("document_id", first.documentId!)
      .eq("locator", "test:1")
      .single();
    expect(data?.text).toBe("A 1. bekezdés szövege.");
  });

  it("never leaves two current documents for one language", async () => {
    // `documents_one_current_per_language_idx` makes this unrepresentable, and
    // that constraint is what forces demote-before-promote in the upsert.
    await ingest(db, units(3));
    await ingest(db, units(3, " a"));
    await ingest(db, units(3, " b"));

    const all = await documents();
    expect(all).toHaveLength(3);
    expect(all.filter((d) => d.is_current)).toHaveLength(1);
  });
});

describe("resumability", () => {
  it("sweeps the document a crashed run left behind", async () => {
    // Steps 4–5 of the upsert leave `is_current = false AND unit_count = 0` —
    // a state no completed run can produce, which is what makes it a reliable
    // signature rather than a guess.
    await db.from("sources").insert({
      id: SOURCE.id,
      title: SOURCE.title,
      kind: SOURCE.kind,
      license: SOURCE.license,
      locator_scheme: SOURCE.locatorScheme,
      chunking: SOURCE.chunking,
    });

    const { data: orphan, error } = await db
      .from("documents")
      .insert({
        source_id: SOURCE.id,
        language: "hu",
        content_hash: "interrupted",
        unit_count: 0,
        is_current: false,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(orphan).toBeTruthy();

    await ingest(db, units(3));

    const all = await documents();
    expect(all.map((d) => d.content_hash)).not.toContain("interrupted");
    expect(all).toHaveLength(1);
  });

  it("does not sweep a completed document", async () => {
    await ingest(db, units(3));
    await ingest(db, units(3, " Javítva."));

    // The demoted one has unit_count 3, so it is not a crash signature.
    const all = await documents();
    expect(all).toHaveLength(2);
  });
});

describe("the cross-lingual locator check", () => {
  // ADR-020. The half that pays for the assertion `assert.ts` cannot run over a
  // source stating each paragraph number once. The comparison itself is a pure
  // function and is unit tested; what needs a real Postgres is the question it
  // asks of the corpus — "which locators does the CURRENT document for the
  // other language have", which is defined by `documents.is_current` and the
  // partial unique index behind it.
  const ENGLISH: ManifestDocument = {
    ...DOCUMENT,
    language: "en",
    parser: "vatican-intratext",
    fetch: "vatican-intratext-toc",
    encoding: "iso-8859-1",
  };

  it("finds nothing to compare against for the first language of a source", async () => {
    await ingest(db, units(3));

    expect(await siblingLanguages(db, SOURCE.id, "hu")).toEqual([]);
  });

  it("sees the other language once it is current", async () => {
    await ingest(db, units(3));
    await ingest(db, units(3), ENGLISH);

    expect(await siblingLanguages(db, SOURCE.id, "en")).toEqual(["hu"]);
    expect(await siblingLanguages(db, SOURCE.id, "hu")).toEqual(["en"]);
  });

  it("reads the locators of the current document and finds them identical", async () => {
    await ingest(db, units(3));
    await ingest(db, units(3), ENGLISH);

    const report = compareLocators(
      (await currentLocators(db, SOURCE.id, "en")),
      (await currentLocators(db, SOURCE.id, "hu")),
      "hu"
    );

    expect(report.ok).toBe(true);
    expect(report.shared).toBe(3);
  });

  it("catches a hole in one language that the other does not have", async () => {
    // The shape a mis-cut page produces: the count is off by the size of the
    // hole, and nothing about either document's own structure is wrong.
    await ingest(db, units(3));

    const report = compareLocators(
      units(3, "", [2]).map((u) => u.locator),
      await currentLocators(db, SOURCE.id, "hu"),
      "hu"
    );

    expect(report.ok).toBe(false);
    expect(report.onlyExisting).toEqual(["test:2"]);
  });

  it("reads through is_current, so a superseded document is not compared", async () => {
    await ingest(db, units(3));
    await ingest(db, units(5, " változat"));

    expect(await currentLocators(db, SOURCE.id, "hu")).toHaveLength(5);
  });

  it("returns nothing for a language with no document at all", async () => {
    await ingest(db, units(3));

    expect(await currentLocators(db, SOURCE.id, "en")).toEqual([]);
  });
});

describe("the cross-lingual role check", () => {
  /**
   * `role` is metadata, not identity, so this is a TEST rather than a gate in
   * the pipeline — an ingest should not fail because a typesetter left a label
   * off a page. It earns its place anyway: correcting the In Brief detection
   * from italics to the section label is what exposed both of the last two real
   * defects in this corpus, and neither was visible any other way.
   *
   *   * §267's stored text ended with `3.§ A Mindenható`, a section heading in
   *     mixed case that no heading rule recognised. It read as prose, passed
   *     every assertion and every text probe, and shipped. It was found because
   *     the In Brief block that heading failed to close ran on into §268–§271
   *     and this comparison flagged four units.
   *   * katolikus.hu sets one Összefoglalás label outside any `<p>`, so
   *     §2504–§2513 lost their role. Same story from the other side.
   *
   * So the divergence is pinned to a declared set rather than merely measured.
   */
  it("differs from the other language only where the errata say so", async () => {
    const sources = parseManifest(
      load(await readFile("corpus/sources.yaml", "utf8"))
    );
    const ccc = sources.find((source) => source.id === "ccc")!;
    const languages = ccc.documents.map((document) => document.language);

    const byLanguage = new Map<string, Map<string, string | null>>();
    for (const language of languages) {
      const units = await currentUnits(db, "ccc", language);
      if (units.length === 0) {
        console.warn(`  ⚠ skipped: no current ccc (${language}) document ingested locally`);
        return;
      }
      byLanguage.set(language, new Map(units.map((u) => [u.locator, u.role])));
    }

    const [a, b] = languages;
    const left = byLanguage.get(a)!;
    const right = byLanguage.get(b)!;

    // Declared omissions, from whichever document declares them.
    const declared = new Set<string>();
    for (const document of ccc.documents) {
      if (!document.errata) continue;
      const errata = parseErrata(load(await readFile(document.errata, "utf8")));
      for (const locator of errata.summaryOmitted) declared.add(locator);
    }

    const divergent = [...left.keys()]
      .filter((locator) => left.get(locator) !== right.get(locator))
      .sort();

    expect(new Set(divergent)).toEqual(declared);
  });
});
