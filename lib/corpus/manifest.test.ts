import { describe, expect, it } from "vitest";
import { parseManifest, selectDocument } from "./manifest";

/**
 * The two tests that matter here are the licence rule and the revision rule.
 * Both are stated in `corpus/sources.yaml`'s comments, and a comment is not a
 * check — these are the checks.
 */

const doc = (over: Record<string, unknown> = {}) => ({
  language: "hu",
  revision: "1997+2018",
  edition: null,
  index_url: "https://katolikus.hu/cikk/a-katolikus-egyhaz-katekizmusa",
  fetch: "discover-from-index",
  parser: "katolikus-hu-numbered-paragraph",
  encoding: "utf-8",
  errata: "corpus/errata/ccc-hu.yaml",
  ...over,
});

const source = (over: Record<string, unknown> = {}) => ({
  id: "ccc",
  title: "Catechism of the Catholic Church",
  kind: "church_document",
  authority_tier: 2,
  author: "Catholic Church",
  languages: ["hu", "en"],
  license: "lev-copyright-cite-and-link",
  locator_scheme: "ccc:<paragraph>",
  chunking: "numbered-paragraph",
  expected_units: 2865,
  documents: [doc()],
  ...over,
});

const manifest = (over: Record<string, unknown> = {}) => ({
  version: 0,
  sources: [source(over)],
});

describe("shape", () => {
  it("maps a well-formed entry into the domain type", () => {
    const [parsed] = parseManifest(manifest());

    expect(parsed).toMatchObject({
      id: "ccc",
      authorityTier: 2,
      locatorScheme: "ccc:<paragraph>",
      chunking: "numbered-paragraph",
      expectedUnits: 2865,
    });
    expect(parsed.documents[0]).toMatchObject({
      language: "hu",
      revision: "1997+2018",
      parser: "katolikus-hu-numbered-paragraph",
      encoding: "utf-8",
    });
  });

  it("accepts a source with no documents block — licensed but not located", () => {
    const [parsed] = parseManifest(manifest({ id: "summa", documents: undefined }));
    expect(parsed.documents).toEqual([]);
  });

  it("keeps `edition: null` as null rather than inventing one", () => {
    // ADR-019 leaves the CCC's edition unresolved on purpose. Naming an edition
    // we have not confirmed is the same error as inferring an authority_tier.
    const [parsed] = parseManifest(manifest());
    expect(parsed.documents[0].edition).toBeNull();
  });
});

describe("the licence rule (ADR-003)", () => {
  it.each(["", "unknown", "TBD", "none", "?"])(
    "rejects an unresolved licence: %o",
    (license) => {
      expect(() => parseManifest(manifest({ license }))).toThrow();
    }
  );

  it("rejects a missing licence outright", () => {
    expect(() => parseManifest(manifest({ license: undefined }))).toThrow();
  });
});

describe("the revision rule (ADR-019)", () => {
  it("rejects documents descending from different revisions", () => {
    // THE §2267 CASE. Under one locator space the numbering aligns perfectly
    // and the content contradicts: the 1997 Hungarian says the death penalty is
    // not excluded, the 2018 English says it is inadmissible. Every check after
    // ingestion passes. This is the only place it can be caught.
    const divergent = manifest({
      documents: [doc(), doc({ language: "en", revision: "1997" })],
    });

    expect(() => parseManifest(divergent)).toThrow(/different revisions/i);
  });

  it("names both revisions and their languages in the message", () => {
    const divergent = manifest({
      documents: [doc(), doc({ language: "en", revision: "1997" })],
    });

    expect(() => parseManifest(divergent)).toThrow(/hu=1997\+2018/);
    expect(() => parseManifest(divergent)).toThrow(/en=1997/);
  });

  it("accepts documents that agree", () => {
    const agreeing = manifest({
      documents: [doc(), doc({ language: "en", revision: "1997+2018" })],
    });
    expect(parseManifest(agreeing)[0].documents).toHaveLength(2);
  });

  it("rejects a missing revision", () => {
    expect(() =>
      parseManifest(manifest({ documents: [doc({ revision: undefined })] }))
    ).toThrow();
  });

  it("fires even when only one language is being ingested", () => {
    // The condition is a property of the PAIR and is wrong before either fetch.
    // Ingesting only Hungarian today would succeed and produce the divergence
    // the moment English is added.
    const divergent = manifest({
      documents: [doc(), doc({ language: "en", revision: "1997" })],
    });
    expect(() => parseManifest(divergent)).toThrow();
  });
});

describe("selectDocument", () => {
  it("finds the requested source and language", () => {
    const { source: found, document } = selectDocument(
      parseManifest(manifest()),
      "ccc",
      "hu"
    );
    expect(found.id).toBe("ccc");
    expect(document.language).toBe("hu");
  });

  it("lists what is available when the source is unknown", () => {
    expect(() => selectDocument(parseManifest(manifest()), "summa", "en")).toThrow(
      /Available: ccc/
    );
  });

  it("explains an empty documents block rather than reporting no languages", () => {
    const sources = parseManifest(manifest({ documents: undefined }));
    expect(() => selectDocument(sources, "ccc", "en")).toThrow(
      /no `documents:` block yet/
    );
  });
});
