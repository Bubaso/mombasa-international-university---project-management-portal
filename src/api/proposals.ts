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
import { addChronologyEntry, addMilestone } from './plan';
import { addCorrespondence } from './comms';
import { createAction, createDecision, createMeeting, createQuestion } from './meetings';
import { createAssumption, createIssue, createRisk } from './raid';
import { createExhibit, createFiling, createHearing, createOrder, recordOpinion } from './legal';
import { createBudgetLine, recordTransaction } from './money';
import { addRequest } from './procurement';
import { createInspection, createValuation } from './site';
import { createStakeholder, logInteraction } from './stakeholders';
import type {
  ChronologyCategory,
  CurrencyCode,
  ProcurementKind,
  FinancialTransaction,
  Confidentiality,
  ContactChannel,
  CorrespondenceDirection,
  CorrespondenceRoute,
  DatePrecision,
  FilingKind,
  HearingKind,
  MeetingKind,
  ObligationSource,
  PriorityLevel,
  RiskCategory,
  StakeholderCategory,
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
    // `declined` artık üretilmiyor (satır siliniyor); eski satırlar 0049'da
    // temizlendi. Filtre, arada kalmış bir satırın ekrana düşmemesi için.
    .neq('state', 'declined')
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

  hearing: (values) =>
    createHearing({
      legalCaseId: required(values, 'legalCaseId', 'A case'),
      scheduledFor: required(values, 'scheduledFor', 'A date'),
      kind: (text(values, 'kind') ?? 'hearing') as HearingKind,
      bench: text(values, 'bench'),
      requiredDocuments: [],
    }),

  filing: (values) =>
    createFiling({
      legalCaseId: required(values, 'legalCaseId', 'A case'),
      kind: (text(values, 'kind') ?? 'other') as FilingKind,
      title: required(values, 'title', 'A title'),
      dueOn: text(values, 'dueOn'),
    }),

  order: (values) =>
    createOrder({
      legalCaseId: required(values, 'legalCaseId', 'A case'),
      madeOn: required(values, 'madeOn', 'A date'),
      madeBy: text(values, 'madeBy'),
      referenceNo: text(values, 'referenceNo'),
      textEn: text(values, 'textEn'),
      textTr: null,
    }),

  meeting: async (values) =>
    (
      await createMeeting({
        title: required(values, 'title', 'A title'),
        heldAt: required(values, 'heldAt', 'A date'),
        location: text(values, 'location'),
        kind: (text(values, 'kind') ?? 'internal') as MeetingKind,
        priority: 'normal',
        // Belgeden kurulan bir toplantı kaydı olmuş bir toplantıdır; tutanağı
        // yoktur ve olduğunu iddia etmek yanlış olur.
        status: 'completed',
        minutesStatus: 'draft',
        continuesMeetingId: null,
        confidentiality: 'confidential' as Confidentiality,
      })
    ).id,

  decision: (values) =>
    createDecision({
      meetingId: text(values, 'meetingId'),
      referenceNo: text(values, 'referenceNo'),
      textEn: required(values, 'textEn', 'What was decided'),
      textTr: null,
      rationaleEn: text(values, 'rationaleEn'),
      organ: text(values, 'organ'),
      vote: null,
      decidedOn: required(values, 'decidedOn', 'A date'),
      // Belgeden kurulan bir karar yürürlüktedir; uygulanmış olduğunu
      // söylemek, uygulandığını kimsenin kaydetmediği bir iddia olurdu.
      status: 'in_force',
      confidentiality: 'confidential' as Confidentiality,
    }),

  question: (values) =>
    createQuestion({
      meetingId: text(values, 'meetingId'),
      questionEn: required(values, 'questionEn', 'The question'),
      questionTr: null,
      targetResolutionDate: text(values, 'targetResolutionDate'),
      ownerProfileId: null,
      ownerStakeholderId: null,
      confidentiality: 'confidential' as Confidentiality,
    }),

  stakeholder: async (values) =>
    (
      await createStakeholder({
        fullName: required(values, 'fullName', 'A name'),
        title: text(values, 'title'),
        organizationId: null,
        category: (text(values, 'category') ?? 'other') as StakeholderCategory,
        email: text(values, 'email'),
        phone: text(values, 'phone'),
        location: null,
        interestTopic: null,
        // Kaydedilmemiş bir tutum `unknown`'dır, `neutral` değil
        // (CLAUDE.md §2). Bir mektuptan tutum okunmaz.
        stance: 'unknown',
        influence: number(values, 'influence', 3),
        interest: number(values, 'interest', 3),
        relationshipOwner: null,
        confidentiality: 'confidential' as Confidentiality,
      })
    ).id,

  interaction: (values) =>
    logInteraction({
      stakeholderId: required(values, 'stakeholderId', 'A stakeholder'),
      occurredAt: required(values, 'occurredAt', 'A date'),
      channel: (text(values, 'channel') ?? 'other') as ContactChannel,
      summary: required(values, 'summary', 'What was said'),
      outcome: text(values, 'outcome'),
      confidentiality: 'confidential' as Confidentiality,
    }),

  milestone: (values) =>
    addMilestone({
      titleEn: required(values, 'titleEn', 'A title'),
      targetOn: text(values, 'targetOn'),
      critical: boolean(values, 'critical'),
      detailEn: text(values, 'detailEn'),
    }),

  issue: (values) =>
    createIssue({
      titleEn: required(values, 'titleEn', 'A title'),
      category: (text(values, 'category') ?? 'legal') as RiskCategory,
      severity: number(values, 'severity', 3),
    }),

  assumption: (values) =>
    createAssumption({
      statementEn: required(values, 'statementEn', 'The assumption'),
      riskCategory: (text(values, 'riskCategory') ?? 'legal') as RiskCategory,
    }),

  legal_opinion: (values) =>
    recordOpinion({
      legalCaseId: text(values, 'legalCaseId'),
      question: required(values, 'question', 'The question'),
      givenByStakeholderId: null,
      givenByName: text(values, 'givenByName'),
      givenOn: text(values, 'givenOn'),
      conclusion: text(values, 'conclusion'),
    }),

  exhibit: (values) =>
    createExhibit({
      legalCaseId: required(values, 'legalCaseId', 'A case'),
      mark: required(values, 'mark', 'A mark'),
      description: required(values, 'description', 'What it is'),
      source: text(values, 'source'),
      relevance: text(values, 'relevance'),
    }),

  transaction: (values, documentId) =>
    recordTransaction({
      referenceNo: required(values, 'referenceNo', 'A reference'),
      date: required(values, 'date', 'A date'),
      category: (text(values, 'category') ??
        'statutory_compliance') as FinancialTransaction['category'],
      description: required(values, 'description', 'What it was for'),
      payee: required(values, 'payee', 'Who was paid'),
      amount: number(values, 'amount', 0),
      currency: (text(values, 'currency') ?? 'KES') as CurrencyCode,
      // Varsayılanı yok: kur onaylayanın girdiği şey, ve 1 varsaymak
      // dönüşümü sessizce yanlış yapar (M8-03).
      fxRateToKes: number(values, 'fxRateToKes', 0),
      budgetLineId: null,
      // Belge kasada; işlemin dayanağı olarak bağlanıyor.
      documentId,
    }),

  inspection: (values) =>
    createInspection({
      constructionBlockId: required(values, 'constructionBlockId', 'A block'),
      inspectedOn: required(values, 'inspectedOn', 'A date'),
      summaryEn: text(values, 'summaryEn'),
    }),

  procurement_request: (values) =>
    addRequest({
      kind: (text(values, 'kind') ?? 'other') as ProcurementKind,
      referenceNo: text(values, 'referenceNo'),
      needEn: required(values, 'needEn', 'The need'),
      justificationEn: required(values, 'justificationEn', 'A reason'),
      estimatedAmount: number(values, 'estimatedAmount', 0),
      estimatedCurrency: text(values, 'estimatedCurrency') ?? 'KES',
      neededBy: text(values, 'neededBy'),
    }),

  budget_line: (values) =>
    createBudgetLine({
      budgetCategoryId: required(values, 'budgetCategoryId', 'A category'),
      titleEn: required(values, 'titleEn', 'A title'),
      amount: number(values, 'amount', 0),
      currency: (text(values, 'currency') ?? 'KES') as CurrencyCode,
      fxRateToKes: number(values, 'fxRateToKes', 0),
      constructionBlockId: null,
    }),

  valuation: (values) =>
    createValuation({
      constructionBlockId: required(values, 'constructionBlockId', 'A block'),
      contractorId: null,
      periodStart: required(values, 'periodStart', 'A start date'),
      periodEnd: required(values, 'periodEnd', 'An end date'),
      amount: number(values, 'amount', 0),
      currency: (text(values, 'currency') ?? 'KES') as CurrencyCode,
      summary: text(values, 'summary'),
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

/**
 * Teklifi at.
 *
 * Durumunu `declined` yapmak yerine satırı siliyor: kullanıcı reddettiği
 * teklifin listede ve kayıtta hiç kalmamasını istedi, ve bu depoda bunu
 * yapmak kaydı kaybetmek demiyor — denetim trigger'ı silinen satırın
 * tamamını `audit_log.before`'a yazıyor (0001). Teklif listesi bir iş
 * kuyruğu; olup bitenin kaydı denetim kaydında durur.
 *
 * Silinen satır sayısı okunuyor. RLS reddetmez, filtreler: uygulanmış bir
 * teklifi silmeye çalışmak sıfır satır siler ve hiçbir şey yükselmez —
 * sessiz kalmak, kullanıcıya olmayan bir şeyi olmuş göstermek olurdu.
 */
/**
 * Reddet.
 *
 * Doğrudan silme değil, bir fonksiyon çağrısı (0050): reddin kaydı ile
 * teklifin kuyruktan çıkması aynı işlemde olmak zorunda. Ayrı ayrı yapılsa
 * arada kalan bir hata ya izi olmayan bir red ya da teklifi olmayan bir
 * bastırma kaydı bırakırdı.
 *
 * Reddin iki sonucu var ve ikincisi kullanıcının kendi kararı: aynı belge
 * yeniden okunduğunda bu cümle bir daha teklif edilmez (M13-19).
 */
export async function declineProposal(proposalId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('decline_proposal', {
    p_proposal: proposalId,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Kalanları tek gerekçeyle reddet.
 *
 * Toplu kabul karşılığı yok ve olmayacak: bir kaydın açılması, o kaydı
 * birinin görmüş olmasını ister (M13-24). Toplu red bir kayıt açmıyor,
 * açmamaya karar veriyor.
 */
export async function declineRemaining(intakeId: string, note?: string): Promise<number> {
  const { data, error } = await supabase.rpc('decline_remaining_proposals', {
    p_intake: intakeId,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : 0;
}

/** Bir belgede reddedilmiş teklifler. Kuyrukta değil, belgenin yanında. */
export interface Rejection {
  id: string;
  register: string;
  why: string;
  quote: string;
  note: string | null;
  decidedAt: string;
}

export async function fetchRejections(documentId: string): Promise<Rejection[]> {
  const { data, error } = await supabase
    .from('intake_rejections')
    .select('id, register, why, quote, note, decided_at')
    .eq('document_id', documentId)
    .order('decided_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as {
      id: string;
      register: string;
      why: string;
      quote: string;
      note: string | null;
      decided_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    register: row.register,
    why: row.why,
    quote: row.quote,
    note: row.note,
    decidedAt: row.decided_at,
  }));
}

/** Bir kaydın nereden geldiği (M13-21). */
export interface Provenance {
  recordId: string;
  register: string;
  documentId: string;
  documentTitle: string;
  quote: string;
  why: string;
  decidedAt: string | null;
  decidedByName: string | null;
}

interface ProvenanceRow {
  record_id: string;
  register: string;
  document_id: string;
  document_title: string;
  quote: string;
  why: string;
  decided_at: string | null;
  decided_by_name: string | null;
}

const PROVENANCE_COLUMNS =
  'record_id, register, document_id, document_title, quote, why, decided_at, decided_by_name';

const toProvenance = (row: ProvenanceRow): Provenance => ({
  recordId: row.record_id,
  register: row.register,
  documentId: row.document_id,
  documentTitle: row.document_title,
  quote: row.quote,
  why: row.why,
  decidedAt: row.decided_at,
  decidedByName: row.decided_by_name,
});

/** Bu belgeden açılmış kayıtlar. */
export async function fetchProvenanceOfDocument(documentId: string): Promise<Provenance[]> {
  const { data, error } = await supabase
    .from('record_provenance')
    .select(PROVENANCE_COLUMNS)
    .eq('document_id', documentId)
    .order('decided_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ProvenanceRow[]).map(toProvenance);
}

/** Bu kayıt hangi belgeden açıldı. Kütük ekranlarında gösterilmek için. */
/**
 * Bir ekranın bütün satırlarının kökeni, tek okumada.
 *
 * `fetchProvenanceOfRecord` tek kayıt için; bu bir ekran dolusu için. Satır
 * başına bir sorgu, yirmi satırlık bir kütükte yirmi istek demek — ve köken
 * satırı tam olarak her kütüğe eklenecek şey, yani o maliyet yirmi üç ekranda
 * tekrarlanırdı. Makine çevirisi rozetinde aynı sebeple aynı şey yapıldı
 * (`useMachineMarks`: "one query for the screenful").
 *
 * Kökeni olmayan kayıt haritada yok: elle girilmiş bir kaydın kökeni yoktur ve
 * "kökeni yok" demek, boş bir satır çizmek olurdu.
 */
export async function fetchProvenanceOfRecords(
  recordIds: string[],
): Promise<Map<string, Provenance>> {
  if (recordIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('record_provenance')
    .select(PROVENANCE_COLUMNS)
    .in('record_id', recordIds);
  if (error) throw new Error(error.message);
  const found = new Map<string, Provenance>();
  for (const row of (data ?? []) as unknown as ProvenanceRow[]) {
    const entry = toProvenance(row);
    found.set(entry.recordId, entry);
  }
  return found;
}

export async function fetchProvenanceOfRecord(recordId: string): Promise<Provenance | null> {
  const { data, error } = await supabase
    .from('record_provenance')
    .select(PROVENANCE_COLUMNS)
    .eq('record_id', recordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProvenance(data as unknown as ProvenanceRow) : null;
}
