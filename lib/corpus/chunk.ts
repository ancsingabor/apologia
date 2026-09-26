import type { ParsedChunk, ParsedUnit } from "@/types/domain";

/**
 * Chunking (ADR-002).
 *
 * Chunks are what gets embedded; citations point at UNITS, not chunks. That
 * separation is why re-tuning the chunker does not invalidate a single stored
 * citation, and it is what makes chunking a variable the eval harness can move
 * rather than a decision that has to be right first time.
 */

/**
 * The Milestone 1 baseline: one chunk per citable unit.
 *
 * ── Why 1:1, when the schema models n:m ─────────────────────────────────────
 *
 * `chunk_units` is a join table, and this function exercises it at 1:1 — which
 * is not the same as simplifying it away, and leaves packing implementable
 * without a migration.
 *
 * Note what the join table is actually for, because it is easy to state the
 * weaker reason. Packing neighbours together, and splitting a long Summa
 * article, both produce MANY UNITS PER CHUNK with each unit still in exactly
 * one chunk — a shape `units.chunk_id` would model perfectly well. What no
 * foreign key can express is one unit in SEVERAL chunks, and that is what the
 * version suffix below makes routine: `numbered-paragraph@2` populates the same
 * corpus beside `@1`, so every unit gains a second chunk. The join table buys
 * the side-by-side comparison, exactly as `chunk_embeddings`'s (chunk, model)
 * key does for embedding models.
 *
 * Packing short neighbours to a token budget is very likely an improvement: a
 * one-sentence paragraph embeds poorly on its own. It is also a tuning
 * parameter, and `.claude/project.md` rule 6 forbids a chunking change without
 * an eval report diff. There is no baseline yet to diff against, so the
 * baseline is what this produces. Packing becomes `numbered-paragraph@2`,
 * measured against it.
 *
 * ── The version suffix ──────────────────────────────────────────────────────
 *
 * `@1` is not decoration. `chunks.strategy` is a plain text column, so two
 * strategies can populate the same corpus simultaneously and be scored over the
 * same gold set — exactly what `chunk_embeddings`'s (chunk, model) key does for
 * embedding models. A variant is therefore a NEW id sitting beside this one,
 * never an edit to this function's behaviour under the same name. Editing it in
 * place would silently invalidate every stored comparison.
 */
export const NUMBERED_PARAGRAPH_V1 = "numbered-paragraph@1";

export function chunkNumberedParagraph(units: ParsedUnit[]): ParsedChunk[] {
  return units.map((unit) => ({
    strategy: NUMBERED_PARAGRAPH_V1,
    text: unit.text,
    unitLocators: [unit.locator],
  }));
}

/**
 * The Summa: one chunk per article, carrying the ROLE of every passage in it.
 *
 * ── The failure this exists to prevent ──────────────────────────────────────
 *
 * An objection states a position Aquinas is about to REJECT, often in crisp,
 * quotable, highly retrievable prose. Retrieved without its role, "videtur quod
 * Deus non sit" is a chunk that resolves to a real locator, quotes byte-exactly,
 * passes the citation gate, and cites Thomas Aquinas for the non-existence of
 * God. Every downstream check is green. `docs/corpus.md` names this as the
 * clearest argument against a uniform chunker, and it is the reason the manifest
 * carries a strategy per source at all.
 *
 * So the chunk text is LABELLED — `[Obiectio 2]`, `[Sed contra]`, `[Respondeo]`
 * — with the tradition's own vocabulary, and grouped so that a retrieved chunk
 * ordinarily contains the respondeo that answers the objections beside it.
 *
 * ⚠️ Labels are added to CHUNK text only, never to `units.text`. A unit's text
 * is permanent and byte-compared by ADR-017's quotation gate; a chunk is what
 * gets embedded and is regenerated whenever the strategy changes. Writing a
 * label into a unit would break every quotation of it.
 *
 * ── Why a budget, and why splitting is not a compromise ────────────────────
 *
 * Articles are not uniform: the median is ~3,300 characters and I-II q. 102
 * a. 5 is 40,749. One chunk per article regardless would hand an embedding
 * model a document several times its context and get back a vector describing
 * whichever part survived truncation.
 *
 * A split article yields consecutive chunks, each labelled, each naming the
 * article it came from — so role survives the split even where the respondeo
 * does not travel with every objection.
 *
 * Measured against the ingested corpus on 2026-09-26: 23,326 units over 3,179
 * articles produce 3,453 chunks. 2,951 articles (92.8%) fit whole; 228 split,
 * the longest into nine. Those counts move with the budget, so the live ones
 * live in docs/guide/status.md.
 */
export const SCHOLASTIC_ARTICLE_V1 = "scholastic-article@1";

/**
 * ~1,700 tokens of Latin. Chosen to fit any candidate embedding model with room
 * to spare while keeping the great majority of articles intact, and it is a
 * TUNING PARAMETER: `.claude/project.md` rule 6 forbids moving it without an
 * eval report diff, and a different value is `scholastic-article@2` beside this
 * one, never an edit here (see the note on the version suffix above).
 */
const ARTICLE_BUDGET_CHARS = 6000;

/** The article a unit belongs to: `summa:I.q2.a3.arg1` → `summa:I.q2.a3`. */
function articleOf(locator: string): string {
  const cut = locator.lastIndexOf(".");
  // The work's own prologue is `summa:pr` — no article above it to group into.
  return cut === -1 ? locator : locator.slice(0, cut);
}

/** The tradition's name for a passage, from the role segment of its locator. */
function passageLabel(locator: string): string {
  // `summa:I.q2.a3.arg1` → `arg1`, and `summa:pr` → `pr`: the work's own
  // prologue has no article above it, so its role sits against the colon.
  const cut = Math.max(locator.lastIndexOf("."), locator.lastIndexOf(":"));
  const role = locator.slice(cut + 1);
  if (role === "pr") return "Prooemium";
  if (role === "co") return "Respondeo";
  if (role === "adarg") return "Ad argumentum";
  const numbered = /^(arg|sc|ad)(\d*)$/.exec(role);
  if (!numbered) return role;
  const [, kind, index] = numbered;
  const name =
    kind === "arg" ? "Obiectio" : kind === "sc" ? "Sed contra" : "Ad";
  return index ? `${name} ${index}` : name;
}

export function chunkScholasticArticle(units: ParsedUnit[]): ParsedChunk[] {
  const articles = new Map<string, ParsedUnit[]>();
  for (const unit of units) {
    const key = articleOf(unit.locator);
    articles.set(key, [...(articles.get(key) ?? []), unit]);
  }

  const chunks: ParsedChunk[] = [];

  for (const [article, members] of articles) {
    let batch: ParsedUnit[] = [];
    let size = 0;

    const flush = () => {
      if (batch.length === 0) return;
      chunks.push({
        strategy: SCHOLASTIC_ARTICLE_V1,
        text: [
          article,
          ...batch.map((u) => `[${passageLabel(u.locator)}] ${u.text}`),
        ].join("\n"),
        unitLocators: batch.map((u) => u.locator),
      });
      batch = [];
      size = 0;
    };

    for (const unit of members) {
      // A single unit over budget still becomes its own chunk: splitting mid
      // passage would cut a citable unit across two chunks, and a unit is the
      // atom (ADR-002).
      if (batch.length > 0 && size + unit.text.length > ARTICLE_BUDGET_CHARS) {
        flush();
      }
      batch.push(unit);
      size += unit.text.length;
    }
    flush();
  }

  return chunks;
}

type Chunker = (units: ParsedUnit[]) => ParsedChunk[];

/**
 * Manifest `chunking:` value → strategy.
 *
 * There is deliberately no default (ADR-002). A source whose strategy is not
 * registered is a source nobody has decided how to chunk, and guessing is the
 * uniform-chunker failure the citable-unit model exists to avoid.
 */
const CHUNKERS: Record<string, Chunker> = {
  "numbered-paragraph": chunkNumberedParagraph,
  "scholastic-article": chunkScholasticArticle,
};

export function chunkerFor(strategy: string): Chunker {
  const chunker = CHUNKERS[strategy];
  if (!chunker) {
    throw new Error(
      `No chunking strategy "${strategy}". Registered: ${Object.keys(CHUNKERS).join(", ")}.\n` +
        `There is no default chunker on purpose (ADR-002): a source's strategy ` +
        `must respect its own structure, and falling back to a generic splitter ` +
        `destroys the boundaries the corpus is built on.`
    );
  }
  return chunker;
}
