/**
 * What is waiting on somebody to rule (M12-10).
 *
 * One read of `pending_decisions`, which unions six registers. The view is
 * security_invoker, so this file does no filtering of its own: an advocate's
 * request comes back with the questions on their own cases and nothing about
 * money, because that is what the policies on those tables already say.
 *
 * The `waitingOn` roles are what make the panel usable. A list of things
 * needing attention that does not say whose attention is a list everybody can
 * reasonably assume is somebody else's.
 */
import { supabase } from '../lib/supabase';
import type { Confidentiality, DecisionKind, PendingDecision } from '../types';

export async function fetchPendingDecisions(): Promise<PendingDecision[]> {
  const { data, error } = await supabase
    .from('pending_decisions')
    .select('*')
    .order('waiting_since', { nullsFirst: false });
  if (error) throw new Error(error.message);

  return (
    (data ?? []) as {
      kind: DecisionKind;
      id: string;
      title_en: string | null;
      title_tr: string | null;
      detail: string | null;
      waiting_since: string | null;
      due_on: string | null;
      waiting_on: string[];
      confidentiality: Confidentiality;
    }[]
  ).map((row) => ({
    kind: row.kind,
    id: row.id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detail: row.detail,
    waitingSince: row.waiting_since,
    dueOn: row.due_on,
    waitingOn: row.waiting_on ?? [],
    confidentiality: row.confidentiality,
  }));
}
