/**
 * Action candidates (M3-05, M3-07, G-04).
 *
 * The Notion migration brought 103 lines of action text. An action in this
 * portal has one owner and one date and the database enforces both, so these
 * wait here until a person supplies them. Nothing in this file fills either
 * field: the suggestion columns carry only what the sentence itself says.
 */
import { supabase } from '../lib/supabase';
import type { ActionCandidate } from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const rows = <T>(data: unknown): T[] => (data ?? []) as unknown as T[];

export async function fetchCandidates(): Promise<ActionCandidate[]> {
  const { data, error } = await supabase
    .from('action_triage')
    .select('*')
    .order('held_at', { ascending: false })
    .order('sequence');
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.id as string,
    meetingId: row.meeting_id as string,
    meetingTitle: row.meeting_title as string,
    meetingTitleTr: row.meeting_title_tr as string | null,
    heldAt: row.held_at as string,
    sequence: Number(row.sequence),
    textEn: row.text_en as string | null,
    textTr: row.text_tr as string | null,
    suggestedOwnerStakeholderId: row.suggested_owner_stakeholder_id as string | null,
    suggestedOwnerName: row.suggested_owner_name as string | null,
    suggestedDueOn: row.suggested_due_on as string | null,
    state: row.state as ActionCandidate['state'],
    actionItemId: row.action_item_id as string | null,
    dismissedReason: row.dismissed_reason as string | null,
    namesAnOwner: Boolean(row.names_an_owner),
    namesADate: Boolean(row.names_a_date),
    confidentiality: row.confidentiality as ActionCandidate['confidentiality'],
  }));
}

/**
 * Turning one into an action.
 *
 * Both fields are required here and again in the database. The message the
 * database raises is the one worth reading — "an action needs a date. If
 * nobody has set one, that is the decision to take, not a field to leave
 * empty" — so this layer checks only what it can check without a round trip.
 */
export async function adoptCandidate(input: {
  id: string;
  dueDate: string;
  ownerProfileId?: string | null;
  ownerStakeholderId?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}): Promise<string> {
  if (!input.dueDate) {
    throw new Error(
      'An action needs a date. If nobody has set one, that is the decision to take — not a field to leave empty.',
    );
  }
  if (!input.ownerProfileId === !input.ownerStakeholderId) {
    throw new Error(
      'An action needs exactly one owner: a portal user, or somebody in the stakeholder register.',
    );
  }

  const { data, error } = await supabase.rpc('adopt_action_candidate', {
    p_id: input.id,
    p_due_date: input.dueDate,
    p_owner_profile: input.ownerProfileId || null,
    p_owner_stakeholder: input.ownerStakeholderId || null,
    p_priority: input.priority ?? 'normal',
  });
  fail(error);
  return data as string;
}

export async function dismissCandidate(id: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error(
      'Say why it is being dropped — a line from a minute that vanishes without a reason is the thing this queue exists to prevent.',
    );
  }
  const { error } = await supabase.rpc('dismiss_action_candidate', {
    p_id: id,
    p_reason: reason.trim(),
  });
  fail(error);
}
