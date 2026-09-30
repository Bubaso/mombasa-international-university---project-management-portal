/**
 * The legal register (M5).
 *
 * Every call is subject to row level security: an outside advocate reaches
 * their own files and nothing else — not the other cases and not the money.
 * That rule lives in supabase/migrations/0009, and every table hanging off a
 * case inherits it, so there is one answer to "can this person see this"
 * rather than eight.
 */
import { supabase } from '../lib/supabase';
import type { Confidentiality, LegalOrder, OrderState } from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

interface OrderRow {
  id: string;
  legal_case_id: string;
  made_on: string;
  made_by: string | null;
  reference_no: string | null;
  text_en: string | null;
  text_tr: string | null;
  state: OrderState;
  document_id: string | null;
  varies_order_id: string | null;
  confidentiality: Confidentiality;
}

/**
 * What a court has actually ordered on a case, and what each order is doing
 * now. This replaced a JSON array on the case row, which could not carry a
 * state, a document or the obligations an order creates.
 */
export async function fetchOrders(caseId?: string): Promise<LegalOrder[]> {
  let query = supabase
    .from('legal_orders')
    .select(
      'id, legal_case_id, made_on, made_by, reference_no, text_en, text_tr, state, ' +
        'document_id, varies_order_id, confidentiality',
    )
    .order('made_on', { ascending: false });
  if (caseId) query = query.eq('legal_case_id', caseId);

  const { data, error } = await query;
  fail(error);
  return ((data ?? []) as unknown as OrderRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    madeOn: row.made_on,
    madeBy: row.made_by,
    referenceNo: row.reference_no,
    textEn: row.text_en,
    textTr: row.text_tr,
    state: row.state,
    documentId: row.document_id,
    variesOrderId: row.varies_order_id,
    confidentiality: row.confidentiality,
  }));
}
