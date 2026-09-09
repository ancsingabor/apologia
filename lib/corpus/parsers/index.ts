import type { ParseResult } from "@/types/domain";
import { parseCorpusThomisticum } from "./corpus-thomisticum";
import { parseKatolikusHu } from "./katolikus-hu";
import { parseVaticanIntratext } from "./vatican-intratext";

/**
 * The parser registry: a manifest `parser:` id → the function that implements
 * it.
 *
 * One parser per source type is the direct consequence of ADR-002 — the
 * Summa's article structure, the CCC's numbered paragraphs and a modern essay's
 * prose are three different problems, and a uniform splitter cannot respect
 * boundaries that differ per source.
 *
 * An unknown id is fatal rather than a fallback. There is nothing sensible to
 * fall back TO: a generic splitter over a source someone has not yet written a
 * parser for would produce units with plausible synthetic locators and no
 * relationship to the work's own addressing, which is the failure the citable
 * unit model exists to prevent, arriving quietly.
 */

/** A page of fetched source, decoded and identified by its slug. */
export interface SourcePage {
  page: string;
  html: string;
}

type Parser = (pages: SourcePage[]) => ParseResult;

const PARSERS: Record<string, Parser> = {
  "katolikus-hu-numbered-paragraph": parseKatolikusHu,
  "vatican-intratext": parseVaticanIntratext,
  "corpus-thomisticum-scholastic": parseCorpusThomisticum,
};

export function parserFor(id: string): Parser {
  const parser = PARSERS[id];
  if (!parser) {
    throw new Error(
      `No parser "${id}". Registered: ${Object.keys(PARSERS).join(", ")}.\n` +
        `A source type needs a real parser, not a generic splitter (ADR-002).`
    );
  }
  return parser;
}
