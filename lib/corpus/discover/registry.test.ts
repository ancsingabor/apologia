import { describe, expect, it } from "vitest";
import {
  discovererFor,
  discoverKatolikusHuPages,
  discoverVaticanIntratextPages,
} from "./index";

describe("the discoverer registry", () => {
  it("resolves the manifest's `fetch:` id to a discoverer", () => {
    expect(discovererFor("katolikus-hu-toc")).toBe(discoverKatolikusHuPages);
    expect(discovererFor("vatican-intratext-toc")).toBe(
      discoverVaticanIntratextPages
    );
  });

  it("is fatal on an unknown id rather than falling back", () => {
    // The same rule as `parserFor`. A generic link scraper over an unknown page
    // would produce a plausible page list bearing no relation to the work's
    // own ordering, which downstream reads as a corpus with holes in it.
    expect(() => discovererFor("discover-from-index")).toThrow(
      /No discoverer "discover-from-index"/
    );
    expect(() => discovererFor("discover-from-index")).toThrow(
      /katolikus-hu-toc, vatican-intratext-toc/
    );
  });
});
