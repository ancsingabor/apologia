import { describe, expect, it } from "vitest";
import type { ParsedUnit } from "@/types/domain";
import { corpusHash, documentContentHash, rawContentHash } from "./hash";

const unit = (paragraph: number, over: Partial<ParsedUnit> = {}): ParsedUnit => ({
  locator: `ccc:${paragraph}`,
  paragraph,
  anchor: `K${String(paragraph).padStart(4, "0")}`,
  relabelledFrom: null,
  text: `A ${paragraph}. bekezdés szövege.`,
  role: null,
  page: "kek-001-002",
  ordinal: paragraph,
  ...over,
});

describe("documentContentHash", () => {
  it("is stable across runs over identical units", () => {
    expect(documentContentHash([unit(1), unit(2)])).toBe(
      documentContentHash([unit(1), unit(2)])
    );
  });

  it("moves when one character of text changes", () => {
    expect(documentContentHash([unit(1, { text: "Egy." })])).not.toBe(
      documentContentHash([unit(1, { text: "Egy!" })])
    );
  });

  it("moves on a pure relabelling, where no text changed", () => {
    // THE §146 CASE. Three paragraphs keep their text and change their address.
    // Hashing text alone would report "unchanged" for a corpus in which every
    // citation had just started resolving somewhere else.
    const printed = unit(147, { text: "Ábrahám hitéről." });
    const corrected = unit(146, { text: "Ábrahám hitéről.", relabelledFrom: 147 });

    expect(documentContentHash([printed])).not.toBe(
      documentContentHash([corrected])
    );
  });

  it("ignores fields that are not the ingested content", () => {
    // `page`, `anchor` and `ordinal` are provenance and markup, not corpus. A
    // re-slugged page must not present as a corpus revision.
    expect(
      documentContentHash([unit(1, { page: "kek-999-999", anchor: null })])
    ).toBe(documentContentHash([unit(1)]));
  });

  it("is order-sensitive, since ordering is the reading order we store", () => {
    expect(documentContentHash([unit(1), unit(2)])).not.toBe(
      documentContentHash([unit(2), unit(1)])
    );
  });

  it("does not collide across a locator/text boundary shift", () => {
    // The separator matters: without it, ('ccc:1','2x') and ('ccc:12','x')
    // would hash identically.
    expect(
      documentContentHash([unit(1, { locator: "ccc:1", text: "2x" })])
    ).not.toBe(documentContentHash([unit(1, { locator: "ccc:12", text: "x" })]));
  });

  it("is a sha256 hex digest", () => {
    expect(documentContentHash([unit(1)])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("rawContentHash", () => {
  it("hashes fetched bytes for provenance, separately from the corpus", () => {
    // A re-theming moves this and must NOT move the document hash — that
    // separation is what softens ADR-019's "a live text is a moving hash".
    const before = '<div class="article-content"><p>Szöveg.</p></div>';
    const after = '<div class="article-content prose"><p>Szöveg.</p></div>';

    expect(rawContentHash(before)).not.toBe(rawContentHash(after));
  });
});

describe("corpusHash", () => {
  const hu = { sourceId: "ccc", language: "hu", contentHash: "a".repeat(64) };
  const en = { sourceId: "ccc", language: "en", contentHash: "b".repeat(64) };

  it("does not depend on the order documents were ingested in", () => {
    expect(corpusHash([hu, en])).toBe(corpusHash([en, hu]));
  });

  it("moves when any document's content moves", () => {
    expect(corpusHash([hu, en])).not.toBe(
      corpusHash([hu, { ...en, contentHash: "c".repeat(64) }])
    );
  });

  it("distinguishes a one-document corpus from a two-document one", () => {
    expect(corpusHash([hu])).not.toBe(corpusHash([hu, en]));
  });
});
