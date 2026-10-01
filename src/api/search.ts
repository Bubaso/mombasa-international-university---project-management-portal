/**
 * The one search box (M13-05, M13-06).
 *
 * Every query goes to search_records in the database, and that is the whole
 * design. The screen this replaces loaded five entire registers into the
 * browser and filtered them with String.includes — which meant the browser
 * downloaded every case, document, block, trustee and transaction in order to
 * search them, covered five registers out of nineteen, and could never have
 * matched a Turkish word to its stem.
 *
 * search_records is security invoker, so this file does no filtering: an
 * advocate's query comes back with their own cases, a donor's with published
 * material and whatever was shared with them by name. There is nothing here
 * to get wrong.
 */
import { supabase } from '../lib/supabase';
import type { Confidentiality, SavedSearch, SearchKind, SearchResult } from '../types';

interface ResultRow {
  kind: SearchKind;
  id: string;
  title_en: string | null;
  title_tr: string | null;
  subtitle: string | null;
  snippet: string | null;
  occurred_on: string | null;
  confidentiality: Confidentiality;
  parent_kind: SearchKind | null;
  parent_id: string | null;
  rank: number;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Two characters is the floor, and it is the database's floor too — below it
 * the literal branch of the match would turn into "everything". Asking
 * anyway would be a round trip for a guaranteed empty list.
 */
export const MIN_QUERY = 2;

export async function searchRecords(
  query: string,
  kinds?: SearchKind[] | null,
  limit = 30,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY) return [];

  const { data, error } = await supabase.rpc('search_records', {
    p_query: trimmed,
    p_kinds: kinds && kinds.length > 0 ? kinds : null,
    p_limit: limit,
  });
  fail(error);

  return ((data ?? []) as ResultRow[]).map((row) => ({
    kind: row.kind,
    id: row.id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    subtitle: row.subtitle,
    snippet: row.snippet,
    occurredOn: row.occurred_on,
    confidentiality: row.confidentiality,
    parentKind: row.parent_kind,
    parentId: row.parent_id,
    rank: row.rank,
  }));
}

// ---------------------------------------------------------------------------
// Saved searches (M13-11)
// ---------------------------------------------------------------------------

interface SavedRow {
  id: string;
  name: string;
  query: string;
  kinds: SearchKind[] | null;
  created_at: string;
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, name, query, kinds, created_at')
    .order('created_at', { ascending: false });
  fail(error);

  return ((data ?? []) as SavedRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    query: row.query,
    kinds: row.kinds,
    createdAt: row.created_at,
  }));
}

export async function saveSearch(input: {
  name: string;
  query: string;
  kinds?: SearchKind[] | null;
}): Promise<void> {
  // owner_id defaults to auth.uid() in the database, and the policy insists
  // on it, so there is nothing for this call to assert about identity.
  const { error } = await supabase.from('saved_searches').insert({
    name: input.name.trim(),
    query: input.query.trim(),
    kinds: input.kinds && input.kinds.length > 0 ? input.kinds : null,
  });
  fail(error);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  fail(error);
}
