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
import type {
  CaseCounsel,
  Confidentiality,
  CounselState,
  CustodyEntry,
  Exhibit,
  Filing,
  FilingKind,
  FilingState,
  Hearing,
  HearingKind,
  LegalOpinion,
  LegalOrder,
  OrderState,
  PreparationState,
  CaseParty,
  AppealGround,
  AuthoritySide,
  BenchQuestion,
  DefencePillar,
  LegalAuthorityRecord,
} from '../types';

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

// ---------------------------------------------------------------------------
// Hearings (M5-03)
// ---------------------------------------------------------------------------

interface HearingRow {
  id: string;
  legal_case_id: string;
  scheduled_for: string;
  kind: HearingKind;
  bench: string | null;
  courtroom: string | null;
  preparation: PreparationState;
  required_documents: string[];
  outcome_en: string | null;
  outcome_tr: string | null;
  confidentiality: Confidentiality;
}

export async function fetchHearings(caseId: string): Promise<Hearing[]> {
  const { data, error } = await supabase
    .from('hearings')
    .select(
      'id, legal_case_id, scheduled_for, kind, bench, courtroom, preparation, ' +
        'required_documents, outcome_en, outcome_tr, confidentiality',
    )
    .eq('legal_case_id', caseId)
    .order('scheduled_for', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as HearingRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    scheduledFor: row.scheduled_for,
    kind: row.kind,
    bench: row.bench,
    courtroom: row.courtroom,
    preparation: row.preparation,
    requiredDocuments: row.required_documents ?? [],
    outcomeEn: row.outcome_en,
    outcomeTr: row.outcome_tr,
    confidentiality: row.confidentiality,
  }));
}

export async function createHearing(input: {
  legalCaseId: string;
  scheduledFor: string;
  kind: HearingKind;
  bench: string | null;
  requiredDocuments: string[];
}): Promise<string> {
  const { data, error } = await supabase
    .from('hearings')
    .insert({
      legal_case_id: input.legalCaseId,
      scheduled_for: input.scheduledFor,
      kind: input.kind,
      bench: input.bench,
      required_documents: input.requiredDocuments,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

export async function setHearingPreparation(input: {
  id: string;
  preparation: PreparationState;
}): Promise<void> {
  const { error } = await supabase
    .from('hearings')
    .update({ preparation: input.preparation })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Filings (M5-04)
// ---------------------------------------------------------------------------

interface FilingRow {
  id: string;
  legal_case_id: string;
  kind: FilingKind;
  title: string;
  due_on: string | null;
  filed_on: string | null;
  state: FilingState;
  document_id: string | null;
  note: string | null;
  confidentiality: Confidentiality;
  filer: { full_name: string } | { full_name: string }[] | null;
}

export async function fetchFilings(caseId: string): Promise<Filing[]> {
  const { data, error } = await supabase
    .from('filings')
    .select(
      'id, legal_case_id, kind, title, due_on, filed_on, state, document_id, note, ' +
        'confidentiality, filer:stakeholders(full_name)',
    )
    .eq('legal_case_id', caseId)
    .order('due_on', { nullsFirst: false });
  fail(error);
  return ((data ?? []) as unknown as FilingRow[]).map((row) => {
    const filer = Array.isArray(row.filer) ? row.filer[0] : row.filer;
    return {
      id: row.id,
      legalCaseId: row.legal_case_id,
      kind: row.kind,
      title: row.title,
      dueOn: row.due_on,
      filedOn: row.filed_on,
      state: row.state,
      filedByName: filer?.full_name ?? null,
      documentId: row.document_id,
      note: row.note,
      confidentiality: row.confidentiality,
    };
  });
}

export async function createFiling(input: {
  legalCaseId: string;
  kind: FilingKind;
  title: string;
  dueOn: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('filings')
    .insert({
      legal_case_id: input.legalCaseId,
      kind: input.kind,
      title: input.title,
      due_on: input.dueOn,
      state: 'planned',
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

/**
 * A filing that says it was made must say when: the table refuses the state
 * without a date, so the date goes in the same update.
 */
export async function updateFiling(input: {
  id: string;
  state: FilingState;
  filedOn: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('filings')
    .update({ state: input.state, filed_on: input.filedOn })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Orders — writing them, and turning one into obligations (M5-05, M2-05)
// ---------------------------------------------------------------------------

export async function createOrder(input: {
  legalCaseId: string;
  madeOn: string;
  madeBy: string | null;
  referenceNo: string | null;
  textEn: string | null;
  textTr: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('legal_orders')
    .insert({
      legal_case_id: input.legalCaseId,
      made_on: input.madeOn,
      made_by: input.madeBy,
      reference_no: input.referenceNo,
      text_en: input.textEn,
      text_tr: input.textTr,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

export async function setOrderState(input: { id: string; state: OrderState }): Promise<void> {
  const { error } = await supabase
    .from('legal_orders')
    .update({ state: input.state })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Evidence (M5-06)
// ---------------------------------------------------------------------------

interface ExhibitRow {
  id: string;
  legal_case_id: string;
  mark: string;
  description: string;
  source: string | null;
  relevance: string | null;
  document_id: string | null;
  confidentiality: Confidentiality;
}

export async function fetchExhibits(caseId: string): Promise<Exhibit[]> {
  const { data, error } = await supabase
    .from('exhibits')
    .select('id, legal_case_id, mark, description, source, relevance, document_id, confidentiality')
    .eq('legal_case_id', caseId)
    .order('mark');
  fail(error);
  return ((data ?? []) as ExhibitRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    mark: row.mark,
    description: row.description,
    source: row.source,
    relevance: row.relevance,
    documentId: row.document_id,
    confidentiality: row.confidentiality,
  }));
}

export async function createExhibit(input: {
  legalCaseId: string;
  mark: string;
  description: string;
  source: string | null;
  relevance: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('exhibits')
    .insert({
      legal_case_id: input.legalCaseId,
      mark: input.mark,
      description: input.description,
      source: input.source,
      relevance: input.relevance,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

interface CustodyRow {
  id: string;
  exhibit_id: string;
  handed_over_at: string;
  from_party: string;
  to_party: string;
  note: string | null;
}

export async function fetchCustody(caseId: string): Promise<CustodyEntry[]> {
  // Filtered through the exhibits of this case; the policy would refuse any
  // others anyway, but asking for them would be noise.
  const { data: exhibits, error: exhibitError } = await supabase
    .from('exhibits')
    .select('id')
    .eq('legal_case_id', caseId);
  fail(exhibitError);
  const ids = ((exhibits ?? []) as { id: string }[]).map((e) => e.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('exhibit_custody')
    .select('id, exhibit_id, handed_over_at, from_party, to_party, note')
    .in('exhibit_id', ids)
    .order('handed_over_at');
  fail(error);
  return ((data ?? []) as CustodyRow[]).map((row) => ({
    id: row.id,
    exhibitId: row.exhibit_id,
    handedOverAt: row.handed_over_at,
    fromParty: row.from_party,
    toParty: row.to_party,
    note: row.note,
  }));
}

/** Insert only. There is no edit and no delete, here or in the database. */
export async function recordHandover(input: {
  exhibitId: string;
  fromParty: string;
  toParty: string;
  handedOverAt: string;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('exhibit_custody').insert({
    exhibit_id: input.exhibitId,
    from_party: input.fromParty,
    to_party: input.toParty,
    handed_over_at: input.handedOverAt,
    note: input.note,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Counsel and opinions (M5-08, M5-10)
// ---------------------------------------------------------------------------

interface CounselRow {
  id: string;
  legal_case_id: string;
  stakeholder_id: string;
  state: CounselState;
  power_of_attorney_filed: boolean;
  fee_model: string | null;
  instructed_on: string | null;
  note: string | null;
  advocate: { full_name: string } | { full_name: string }[] | null;
}

/**
 * Davanın tarafları (M5-02).
 *
 * Tablo 0009'dan beri duruyor ve 5 Ekim 2026'ya kadar hiçbir yerden
 * okunmuyordu: ekran "Kim kimdir" sekmesinde beş kişiyi koda gömülü
 * gösteriyordu — isimleri, bürolarını, tanık numaralarını ve haklarında
 * değerlendirmeleri. Kurulup bağlanmamış bir tablo, o veriyi başka bir yerde
 * tutmaya zorluyor; burada tutulan yer kaynak koddu (CLAUDE.md §4).
 *
 * `represented_by` serbest metin, çünkü bir tarafı temsil eden avukat her
 * zaman portalda bir kayıt değil — karşı tarafın avukatı paydaş kütüğünde
 * olmak zorunda değil.
 */
/**
 * Duruşma brifinginin üç listesi ve itirazlar (M5-12, M5-13, M5-17).
 *
 * Dördü de bir davanın çocuğu ve sınır koymuyorlar; sebebi `fetchCaseParties`
 * ile aynı: bunlar dilim değil **küme**. Dokuz itirazın dördünü gösteren bir
 * liste, dört itiraz varmış gibi okunur, ve temyiz dilekçesinde kaç itiraz
 * olduğu mahkeme kaydındaki bir olgu. `legal_case_id` zaten tek davaya
 * bağlıyor, yani okuma kütüğün tamamını değil bir dosyayı çekiyor.
 */
interface GroundRow {
  id: string;
  legal_case_id: string;
  ordinal: number;
  title_en: string;
  title_tr: string | null;
  detail_en: string | null;
  detail_tr: string | null;
  judgment_paragraph: string | null;
}

export async function fetchAppealGrounds(caseId: string): Promise<AppealGround[]> {
  const { data, error } = await supabase
    .from('appeal_grounds')
    .select(
      'id, legal_case_id, ordinal, title_en, title_tr, detail_en, detail_tr, judgment_paragraph',
    )
    .eq('legal_case_id', caseId)
    .order('ordinal');
  fail(error);
  return ((data ?? []) as unknown as GroundRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    ordinal: row.ordinal,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detailEn: row.detail_en,
    detailTr: row.detail_tr,
    judgmentParagraph: row.judgment_paragraph,
  }));
}

interface AuthorityRow {
  id: string;
  legal_case_id: string;
  citation: string;
  favours: AuthoritySide;
  principle_en: string;
  principle_tr: string | null;
  use_note_en: string | null;
  use_note_tr: string | null;
  document_id: string | null;
}

export async function fetchLegalAuthorities(caseId: string): Promise<LegalAuthorityRecord[]> {
  const { data, error } = await supabase
    .from('legal_authorities')
    .select(
      'id, legal_case_id, citation, favours, principle_en, principle_tr, ' +
        'use_note_en, use_note_tr, document_id',
    )
    .eq('legal_case_id', caseId)
    .order('citation');
  fail(error);
  return ((data ?? []) as unknown as AuthorityRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    citation: row.citation,
    favours: row.favours,
    principleEn: row.principle_en,
    principleTr: row.principle_tr,
    useNoteEn: row.use_note_en,
    useNoteTr: row.use_note_tr,
    documentId: row.document_id,
  }));
}

interface BenchQuestionRow {
  id: string;
  legal_case_id: string;
  hearing_id: string | null;
  topic: string;
  question_en: string;
  question_tr: string | null;
  answer_en: string | null;
  answer_tr: string | null;
}

export async function fetchBenchQuestions(caseId: string): Promise<BenchQuestion[]> {
  const { data, error } = await supabase
    .from('bench_questions')
    .select('id, legal_case_id, hearing_id, topic, question_en, question_tr, answer_en, answer_tr')
    .eq('legal_case_id', caseId)
    .order('topic');
  fail(error);
  return ((data ?? []) as unknown as BenchQuestionRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    hearingId: row.hearing_id,
    topic: row.topic,
    questionEn: row.question_en,
    questionTr: row.question_tr,
    answerEn: row.answer_en,
    answerTr: row.answer_tr,
  }));
}

interface PillarRow {
  id: string;
  legal_case_id: string;
  ordinal: number;
  against: string;
  title_en: string;
  title_tr: string | null;
  detail_en: string | null;
  detail_tr: string | null;
}

export async function fetchDefencePillars(caseId: string): Promise<DefencePillar[]> {
  const { data, error } = await supabase
    .from('defence_pillars')
    .select('id, legal_case_id, ordinal, against, title_en, title_tr, detail_en, detail_tr')
    .eq('legal_case_id', caseId)
    .order('ordinal');
  fail(error);
  return ((data ?? []) as unknown as PillarRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    ordinal: row.ordinal,
    against: row.against,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detailEn: row.detail_en,
    detailTr: row.detail_tr,
  }));
}

interface PartyRow {
  id: string;
  legal_case_id: string;
  role: CaseParty['role'];
  name: string;
  stakeholder_id: string | null;
  represented_by: string | null;
}

export async function fetchCaseParties(caseId: string): Promise<CaseParty[]> {
  const { data, error } = await supabase
    .from('case_parties')
    .select('id, legal_case_id, role, name, stakeholder_id, represented_by')
    .eq('legal_case_id', caseId)
    .order('role');
  fail(error);
  return ((data ?? []) as unknown as PartyRow[]).map((row) => ({
    id: row.id,
    legalCaseId: row.legal_case_id,
    role: row.role,
    name: row.name,
    stakeholderId: row.stakeholder_id,
    representedBy: row.represented_by,
  }));
}

export async function fetchCounsel(caseId: string): Promise<CaseCounsel[]> {
  const { data, error } = await supabase
    .from('case_counsel')
    .select(
      'id, legal_case_id, stakeholder_id, state, power_of_attorney_filed, fee_model, ' +
        'instructed_on, note, advocate:stakeholders(full_name)',
    )
    .eq('legal_case_id', caseId);
  fail(error);
  return ((data ?? []) as unknown as CounselRow[]).map((row) => {
    const advocate = Array.isArray(row.advocate) ? row.advocate[0] : row.advocate;
    return {
      id: row.id,
      legalCaseId: row.legal_case_id,
      stakeholderId: row.stakeholder_id,
      counselName: advocate?.full_name ?? null,
      state: row.state,
      powerOfAttorneyFiled: row.power_of_attorney_filed,
      feeModel: row.fee_model,
      instructedOn: row.instructed_on,
      note: row.note,
    };
  });
}

export async function assignCounsel(input: {
  legalCaseId: string;
  stakeholderId: string;
  state: CounselState;
}): Promise<void> {
  const { error } = await supabase.from('case_counsel').insert({
    legal_case_id: input.legalCaseId,
    stakeholder_id: input.stakeholderId,
    state: input.state,
  });
  fail(error);
}

export async function updateCounsel(input: {
  id: string;
  state?: CounselState;
  powerOfAttorneyFiled?: boolean;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.state !== undefined) patch.state = input.state;
  if (input.powerOfAttorneyFiled !== undefined) {
    patch.power_of_attorney_filed = input.powerOfAttorneyFiled;
  }
  const { error } = await supabase.from('case_counsel').update(patch).eq('id', input.id);
  fail(error);
}

interface OpinionRow {
  id: string;
  legal_case_id: string | null;
  question: string;
  given_by_stakeholder_id: string | null;
  given_by_name: string | null;
  given_on: string | null;
  conclusion: string | null;
  confidentiality: Confidentiality;
  author: { full_name: string } | { full_name: string }[] | null;
}

/**
 * Four candidate advisers were assessed in parallel and their views are
 * scattered across meeting notes. Opinions on the same question should be
 * readable side by side, which is what the question grouping in the view does.
 */
export async function fetchOpinions(caseId?: string): Promise<LegalOpinion[]> {
  let query = supabase
    .from('legal_opinions')
    .select(
      'id, legal_case_id, question, given_by_stakeholder_id, given_by_name, given_on, ' +
        'conclusion, confidentiality, author:stakeholders(full_name)',
    )
    .order('given_on', { nullsFirst: false });
  if (caseId) query = query.eq('legal_case_id', caseId);

  const { data, error } = await query;
  fail(error);
  return ((data ?? []) as unknown as OpinionRow[]).map((row) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    return {
      id: row.id,
      legalCaseId: row.legal_case_id,
      question: row.question,
      givenByStakeholderId: row.given_by_stakeholder_id,
      givenByName: author?.full_name ?? row.given_by_name,
      givenOn: row.given_on,
      conclusion: row.conclusion,
      confidentiality: row.confidentiality,
    };
  });
}

export async function recordOpinion(input: {
  legalCaseId: string | null;
  question: string;
  givenByStakeholderId: string | null;
  givenByName: string | null;
  givenOn: string | null;
  conclusion: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('legal_opinions')
    .insert({
      legal_case_id: input.legalCaseId,
      question: input.question,
      given_by_stakeholder_id: input.givenByStakeholderId,
      given_by_name: input.givenByName,
      given_on: input.givenOn,
      conclusion: input.conclusion,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}
