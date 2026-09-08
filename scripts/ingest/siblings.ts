import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reading the locators of the OTHER languages already in the corpus, so the
 * incoming parse can be compared against them (ADR-020).
 *
 * The I/O half of `lib/corpus/cross-lingual.ts`, kept here for the same reason
 * everything else in this directory is: the comparison is a pure function over
 * two sets and is unit tested; the query is not.
 */

/** PostgREST caps a response; 2,865 locators need paging. */
const PAGE = 1000;

/** Languages of this source that already have a current document, in order. */
export async function siblingLanguages(
  db: SupabaseClient,
  sourceId: string,
  language: string
): Promise<string[]> {
  const { data, error } = await db
    .from("documents")
    .select("language")
    .eq("source_id", sourceId)
    .eq("is_current", true)
    .neq("language", language);

  if (error) {
    throw new Error(`reading sibling documents failed: ${error.message}`);
  }
  return (data ?? []).map((row) => row.language as string);
}

/**
 * Every locator in a source's current document for one language.
 *
 * Reads through `documents.is_current` rather than taking a document id,
 * because "the text a citation resolves against" is defined by that flag and by
 * the partial unique index behind it — asking any other way would be asking a
 * different question.
 */
export async function currentLocators(
  db: SupabaseClient,
  sourceId: string,
  language: string
): Promise<string[]> {
  const { data: documents, error: documentError } = await db
    .from("documents")
    .select("id")
    .eq("source_id", sourceId)
    .eq("language", language)
    .eq("is_current", true)
    .limit(1);

  if (documentError) {
    throw new Error(`reading the ${language} document failed: ${documentError.message}`);
  }
  const documentId = documents?.[0]?.id as string | undefined;
  if (!documentId) return [];

  const locators: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("units")
      .select("locator")
      .eq("document_id", documentId)
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`reading ${language} locators failed: ${error.message}`);
    }
    const page = data ?? [];
    locators.push(...page.map((row) => row.locator as string));
    if (page.length < PAGE) return locators;
  }
}
