/**
 * Teklifler ve onayları (M13-14, M13-15).
 *
 * Bu dosyanın tek önemli kararı şu: **onaylanan teklif, kütüğün kendi normal
 * yazma yolundan geçer.** `applyProposal` yeni bir insert yazmıyor; kütüğün
 * zaten var olan `createObligation`, `addChronologyEntry`, `addCorrespondence`,
 * `createAction`, `createRisk` fonksiyonlarını çağırıyor — yani o kütüğün
 * bütün politikaları, kısıtları ve trigger'ları aynen işliyor ve kayıt,
 * onaylayan kişinin kendi oturumuyla açılıyor.
 *
 * Teklife ayrı bir yazma yolu açmak kolaydı ve yanlış olurdu: kuralların
 * etrafından dolaşan ikinci bir kapı, ilk gün aynı şeyi yapar, altıncı ay
 * farklı şeyi yapar.
 *
 * Yazma başarısız olursa teklif `proposed` kalır. Önce kütüğe yazılıyor,
 * sonra teklif işaretleniyor; ters sırada, yazma patladığında ekranda
 * "uygulandı" diyen ama ortada kaydı olmayan bir satır kalırdı.
 */
import { supabase } from '../lib/supabase';
import { createObligation } from './obligations';
import { addChronologyEntry } from './plan';
import { addCorrespondence } from './comms';
import { createAction } from './meetings';
import { createRisk } from './raid';
import type {
  ChronologyCategory,
  Confidentiality,
  CorrespondenceDirection,
  CorrespondenceRoute,
  DatePrecision,
  ObligationSource,
  PriorityLevel,
  RiskCategory,
} from '../types';

export type ProposalState = 'proposed' | 'applied' | 'declined';

export interface Proposal {
  id: string;
  intakeId: string;
  documentId: string;
  register: string;
  why: string;
  quote: string;
  quoteFound: boolean;
  values: Record<string, unknown>;
  state: ProposalState;
  createdRecordId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface ProposalRow {
  id: string;
  intake_id: string;
  document_id: string;
  register: string;
  why: string;
  quote: string;
  quote_found: boolean;
  proposed_values: Record<string, unknown> | null;
  state: ProposalState;
  created_record_id: string | null;
  decided_at: string | null;
  created_at: string;
}

const COLUMNS =
  'id, intake_id, document_id, register, why, quote, quote_found, proposed_values, state, ' +
  'created_record_id, decided_at, created_at';

const toProposal = (row: ProposalRow): Proposal => ({
  id: row.id,
  intakeId: row.intake_id,
  documentId: row.document_id,
  register: row.register,
  why: row.why,
  quote: row.quote,
  quoteFound: row.quote_found,
  values: row.proposed_values ?? {},
  state: row.state,
  createdRecordId: row.created_record_id,
  decidedAt: row.decided_at,
  createdAt: row.created_at,
});

export async function fetchProposals(intakeIds: string[]): Promise<Proposal[]> {
  if (intakeIds.length === 0) return [];
  const { data, error } = await supabase
    .from('intake_proposals')
    .select(COLUMNS)
    .in('intake_id', intakeIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ProposalRow[]).map(toProposal);
}

// ---------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------

const text = (values: Record<string, unknown>, name: string): string | null => {
  const raw = values[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

const required = (values: Record<string, unknown>, name: string, label: string): string => {
  const value = text(values, name);
  if (value === null) throw new Error(`${label} is needed before this can be recorded.`);
  return value;
};

const number = (values: Record<string, unknown>, name: string, fallback: number): number => {
  const raw = values[name];
  const parsed = typeof raw === 'number' ? raw : Number(text(values, name) ?? NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolean = (values: Record<string, unknown>, name: string): boolean =>
  values[name] === true || values[name] === 'true';

/**
 * Hangi kütüğe nasıl yazılacağı.
 *
 * Anahtarlar `supabase/functions/ai-assistant/targets.js`'deki anahtarlarla
 * birebir. İkisini birbirine bağlayan şey testteki assertion: hedefi olup
 * yazıcısı olmayan bir kütük, ekranda onaylanabilir görünüp onaylandığında
 * patlar.
 */
const WRITERS: Record<
  string,
  (values: Record<string, unknown>, documentId: string) => Promise<string>
> = {
  obligation: (values, documentId) =>
    createObligation({
      titleEn: required(values, 'titleEn', 'A title'),
      titleTr: null,
      detailEn: text(values, 'detailEn'),
      source: (text(values, 'source') ?? 'court_order') as ObligationSource,
      // Belge kasadaki kaynaktır; yükümlülüğün dayanağı olarak bağlanıyor.
      sourceDocumentId: documentId,
      sourceLegalOrderId: null,
      sourceMeetingId: null,
      obligorName: required(values, 'obligorName', 'Who owes it'),
      obligorStakeholderId: null,
      beneficiaryName: text(values, 'beneficiaryName'),
      dueOn: text(values, 'dueOn'),
      prohibits: boolean(values, 'prohibits'),
      confidentiality: 'confidential' as Confidentiality,
    }),

  chronology: (values, documentId) =>
    addChronologyEntry({
      occurredOn: required(values, 'occurredOn', 'A date'),
      precision: (text(values, 'precision') ?? 'day') as DatePrecision,
      category: (text(values, 'category') ?? 'other') as ChronologyCategory,
      titleEn: required(values, 'titleEn', 'A title'),
      detailEn: text(values, 'detailEn'),
      // Kronoloji kaydı nereden geldiğini göstermek zorunda; belge o cevap.
      documentId,
    }),

  correspondence: (values, documentId) =>
    addCorrespondence({
      direction: (text(values, 'direction') ?? 'incoming') as CorrespondenceDirection,
      route: (text(values, 'route') ?? 'letter') as CorrespondenceRoute,
      subjectEn: required(values, 'subjectEn', 'A subject'),
      sentOn: required(values, 'sentOn', 'A date'),
      counterpartyName: required(values, 'counterpartyName', 'The other party'),
      referenceNo: text(values, 'referenceNo'),
      documentId,
      summary: text(values, 'summary'),
    }),

  action: (values) =>
    createAction({
      meetingId: null,
      decisionId: null,
      textEn: required(values, 'textEn', 'What is to be done'),
      textTr: null,
      dueDate: required(values, 'dueDate', 'A due date'),
      priority: (text(values, 'priority') ?? 'normal') as PriorityLevel,
      ownerProfileId: required(values, 'ownerProfileId', 'An owner'),
      ownerStakeholderId: null,
      confidentiality: 'confidential' as Confidentiality,
    }),

  risk: (values) =>
    createRisk({
      titleEn: required(values, 'titleEn', 'A title'),
      category: (text(values, 'category') ?? 'legal') as RiskCategory,
      likelihood: number(values, 'likelihood', 3),
      impact: number(values, 'impact', 3),
      triggerEn: text(values, 'triggerEn'),
    }),
};

export const writableRegisters = Object.keys(WRITERS);

/**
 * Teklifi uygula: kaydı aç, sonra teklifi işaretle.
 *
 * `values` teklifin kendisi değil, kullanıcının formda bıraktığı hâlidir.
 * Teklifin metni 0048'de değişmez kalıyor (sütun bazlı grant), yani "model ne
 * dedi, biz ne yazdık" sorusu sonradan cevaplanabiliyor.
 */
export async function applyProposal(input: {
  proposalId: string;
  register: string;
  documentId: string;
  values: Record<string, unknown>;
}): Promise<string> {
  const writer = WRITERS[input.register];
  if (!writer) throw new Error(`This portal has no way to record a ${input.register}.`);

  const createdRecordId = await writer(input.values, input.documentId);

  const { error } = await supabase
    .from('intake_proposals')
    .update({ state: 'applied', created_record_id: createdRecordId })
    .eq('id', input.proposalId);

  if (error) {
    // Kayıt açıldı, teklif işaretlenemedi. Sessiz kalmak, aynı teklifin
    // ikinci kez uygulanmasına ve ikinci bir kaydın açılmasına yol açar.
    throw new Error(
      `The record was created, but this proposal could not be marked as applied: ${error.message}`,
    );
  }
  return createdRecordId;
}

export async function declineProposal(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('intake_proposals')
    .update({ state: 'declined' })
    .eq('id', proposalId);
  if (error) throw new Error(error.message);
}
