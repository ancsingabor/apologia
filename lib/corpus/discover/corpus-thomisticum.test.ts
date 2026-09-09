import { describe, expect, it } from "vitest";
import { discoverCorpusThomisticumPages } from "./corpus-thomisticum";

const INDEX = "https://www.corpusthomisticum.org/iopera.html";

const discover = (html: string) => discoverCorpusThomisticumPages(html, INDEX);

describe("discoverCorpusThomisticumPages", () => {
  it("takes the Summa's pages and resolves them against the index", () => {
    const pages = discover(
      `<A HREF="sth1001.html">Quaestio 1</A> <A HREF="sth1002.html">Quaestio 2</A>`
    );

    expect(pages).toEqual([
      { slug: "sth1001", url: "https://www.corpusthomisticum.org/sth1001.html" },
      { slug: "sth1002", url: "https://www.corpusthomisticum.org/sth1002.html" },
    ]);
  });

  it("leaves the rest of the Thomistic corpus alone", () => {
    // `iopera.html` indexes every work Aquinas wrote. Only `sth` is the Summa.
    const pages = discover(
      `<A HREF="scg1001.html">Contra Gentiles</A>` +
        `<A HREF="sth1001.html">Summa</A>` +
        `<A HREF="cmt0001.html">In Sententias</A>` +
        `<A HREF="zbiblia.html">Bibliographia</A>`
    );
    expect(pages.map((p) => p.slug)).toEqual(["sth1001"]);
  });

  it("excludes the Supplementum, by the source's OWN attribution", () => {
    // The index credits it to Fr. Rainaldus Romanus — Reginald of Piperno
    // compiled it after Thomas died — and hosts it off the `sth` scheme.
    // `authority_tier: 3` is assigned to Aquinas and is not ours to lend on.
    const pages = discover(
      `<A HREF="sth4084.html">Tertia pars</A>` +
        `Fr. Rainaldus Romanus, Supplementum ` +
        `<A HREF="https://archive.org/details/supplementum">Quaestiones 1-99</A>`
    );
    expect(pages.map((p) => p.slug)).toEqual(["sth4084"]);
  });

  it("reads unquoted and lowercase hrefs", () => {
    const pages = discover(`<a href=sth2001.html>q. 1-5</a>`);
    expect(pages.map((p) => p.slug)).toEqual(["sth2001"]);
  });

  it("lists a page once however many times the index links it", () => {
    const pages = discover(
      `<A HREF="sth1001.html">a</A><A HREF="sth1001.html#28232">b</A>`
    );
    expect(pages).toHaveLength(1);
  });

  it("returns the work's own order regardless of link order", () => {
    // Prima Pars, Prima Secundae, Secunda Secundae, Tertia — `sth1…` to `sth4…`.
    const pages = discover(
      `<A HREF="sth4001.html">III</A>` +
        `<A HREF="sth1002.html">I q. 2</A>` +
        `<A HREF="sth3001.html">II-II</A>` +
        `<A HREF="sth0000.html">prologus</A>` +
        `<A HREF="sth2001.html">I-II</A>`
    );
    expect(pages.map((p) => p.slug)).toEqual([
      "sth0000",
      "sth1002",
      "sth2001",
      "sth3001",
      "sth4001",
    ]);
  });

  it("yields nothing when the index has no Summa links at all", () => {
    // `assertPagesDiscovered` turns this into the failure; the discoverer's job
    // is to report honestly rather than invent a page list (ADR-019).
    expect(discover(`<A HREF="zbiblia.html">Bibliographia</A>`)).toEqual([]);
  });
});
