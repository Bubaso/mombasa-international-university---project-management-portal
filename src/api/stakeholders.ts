/**
 * The stakeholder register (M4).
 *
 * Every call goes through the anon key and is therefore subject to row level
 * security. Nothing here filters for safety — the scope rule in
 * supabase/migrations/0006 does that, and it is the reason a contractor
 * querying this table gets the published records and nothing else.
 *
 * The private assessment is fetched separately on purpose. It is a different
 * table with a different classification, and the interface should show that
 * the two halves of a stakeholder record are not the same thing.
 */
import { supabase } from '../lib/supabase';
import type {
  ContactChannel,
  Confidentiality,
  EngagementBoardRow,
  EngagementPlan,
  EngagementPlanStatus,
  EngagementStepState,
  MapSnapshot,
  MapSnapshotPerson,
  Organization,
  RelationshipKind,
  Stakeholder,
  StakeholderAssessment,
  StakeholderAttention,
  StakeholderCategory,
  StakeholderInteraction,
  StakeholderRelationship,
  Stance,
  StanceChange,
  UserRole,
} from '../types';

interface NamedRef {
  full_name?: string;
  name?: string;
}

function label(ref: NamedRef | NamedRef[] | null | undefined): string | null {
  if (!ref) return null;
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.full_name ?? row?.name ?? null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

interface OrganizationRow {
  id: string;
  name: string;
  category: StakeholderCategory;
  country: string | null;
  website: string | null;
  notes: string | null;
  confidentiality: Confidentiality;
}

export async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, category, country, website, notes, confidentiality')
    .order('name');
  fail(error);
  return ((data ?? []) as OrganizationRow[]).map((row) => ({ ...row }));
}

export async function createOrganization(input: {
  name: string;
  category: StakeholderCategory;
  country: string | null;
  notes: string | null;
}): Promise<Organization> {
  const { data, error } = await supabase
    .from('organizations')
    .insert(input)
    .select('id, name, category, country, website, notes, confidentiality')
    .single<OrganizationRow>();
  fail(error);
  return { ...(data as OrganizationRow) };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface StakeholderRow {
  id: string;
  full_name: string;
  title: string | null;
  organization_id: string | null;
  category: StakeholderCategory;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  preferred_language: string | null;
  interest_topic: string | null;
  stance: Stance;
  influence: number;
  interest: number;
  relationship_owner: string | null;
  profile_id: string | null;
  notes: string | null;
  confidentiality: Confidentiality;
  organization: NamedRef | NamedRef[] | null;
  owner: NamedRef | NamedRef[] | null;
}

const STAKEHOLDER_COLUMNS =
  'id, full_name, title, organization_id, category, email, phone, whatsapp, location, ' +
  'preferred_language, interest_topic, stance, influence, interest, relationship_owner, ' +
  'profile_id, notes, confidentiality, ' +
  'organization:organizations(name), ' +
  'owner:profiles!stakeholders_relationship_owner_fkey(full_name)';

function toStakeholder(row: StakeholderRow): Stakeholder {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    organizationId: row.organization_id,
    organizationName: label(row.organization),
    category: row.category,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    location: row.location,
    preferredLanguage: row.preferred_language,
    interestTopic: row.interest_topic,
    stance: row.stance,
    influence: row.influence,
    interest: row.interest,
    relationshipOwner: row.relationship_owner,
    relationshipOwnerName: label(row.owner),
    profileId: row.profile_id,
    notes: row.notes,
    confidentiality: row.confidentiality,
  };
}

export async function fetchStakeholders(): Promise<Stakeholder[]> {
  const { data, error } = await supabase
    .from('stakeholders')
    .select(STAKEHOLDER_COLUMNS)
    .order('full_name');
  fail(error);
  return ((data ?? []) as unknown as StakeholderRow[]).map(toStakeholder);
}

export interface StakeholderInput {
  fullName: string;
  title: string | null;
  organizationId: string | null;
  category: StakeholderCategory;
  email: string | null;
  phone: string | null;
  location: string | null;
  interestTopic: string | null;
  stance: Stance;
  influence: number;
  interest: number;
  relationshipOwner: string | null;
  confidentiality: Confidentiality;
}

function toRow(input: Partial<StakeholderInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.fullName !== undefined) row.full_name = input.fullName;
  if (input.title !== undefined) row.title = input.title;
  if (input.organizationId !== undefined) row.organization_id = input.organizationId;
  if (input.category !== undefined) row.category = input.category;
  if (input.email !== undefined) row.email = input.email;
  if (input.phone !== undefined) row.phone = input.phone;
  if (input.location !== undefined) row.location = input.location;
  if (input.interestTopic !== undefined) row.interest_topic = input.interestTopic;
  if (input.stance !== undefined) row.stance = input.stance;
  if (input.influence !== undefined) row.influence = input.influence;
  if (input.interest !== undefined) row.interest = input.interest;
  if (input.relationshipOwner !== undefined) row.relationship_owner = input.relationshipOwner;
  if (input.confidentiality !== undefined) row.confidentiality = input.confidentiality;
  return row;
}

export async function createStakeholder(input: StakeholderInput): Promise<Stakeholder> {
  const { data, error } = await supabase
    .from('stakeholders')
    .insert(toRow(input))
    .select(STAKEHOLDER_COLUMNS)
    .single();
  fail(error);
  return toStakeholder(data as unknown as StakeholderRow);
}

export async function updateStakeholder(input: {
  id: string;
  changes: Partial<StakeholderInput>;
}): Promise<Stakeholder> {
  const { data, error } = await supabase
    .from('stakeholders')
    .update(toRow(input.changes))
    .eq('id', input.id)
    .select(STAKEHOLDER_COLUMNS)
    .maybeSingle();
  fail(error);
  if (!data) throw new Error('That change was refused: you may not edit this record.');
  return toStakeholder(data as unknown as StakeholderRow);
}

// ---------------------------------------------------------------------------
// How a stance moved
// ---------------------------------------------------------------------------

interface StanceChangeRow {
  id: string;
  stakeholder_id: string;
  from_stance: Stance | null;
  to_stance: Stance;
  changed_at: string;
  note: string | null;
  author: NamedRef | NamedRef[] | null;
}

/** Append-only, written by a trigger: nothing here can edit it. */
export async function fetchStanceHistory(stakeholderId: string): Promise<StanceChange[]> {
  const { data, error } = await supabase
    .from('stakeholder_stance_changes')
    .select(
      'id, stakeholder_id, from_stance, to_stance, changed_at, note, author:profiles(full_name)',
    )
    .eq('stakeholder_id', stakeholderId)
    .order('changed_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as StanceChangeRow[]).map((row) => ({
    id: row.id,
    stakeholderId: row.stakeholder_id,
    fromStance: row.from_stance,
    toStance: row.to_stance,
    changedByName: label(row.author),
    changedAt: row.changed_at,
    note: row.note,
  }));
}

// ---------------------------------------------------------------------------
// The contact log
// ---------------------------------------------------------------------------

interface InteractionRow {
  id: string;
  stakeholder_id: string;
  occurred_at: string;
  channel: ContactChannel;
  summary: string;
  outcome: string | null;
  confidentiality: Confidentiality;
  logged_for: NamedRef | NamedRef[] | null;
}

export async function fetchInteractions(stakeholderId?: string): Promise<StakeholderInteraction[]> {
  let query = supabase
    .from('stakeholder_interactions')
    .select(
      'id, stakeholder_id, occurred_at, channel, summary, outcome, confidentiality, ' +
        'logged_for:profiles!stakeholder_interactions_logged_for_fkey(full_name)',
    )
    .order('occurred_at', { ascending: false });
  if (stakeholderId) query = query.eq('stakeholder_id', stakeholderId);

  const { data, error } = await query;
  fail(error);
  return ((data ?? []) as unknown as InteractionRow[]).map((row) => ({
    id: row.id,
    stakeholderId: row.stakeholder_id,
    occurredAt: row.occurred_at,
    channel: row.channel,
    summary: row.summary,
    outcome: row.outcome,
    loggedForName: label(row.logged_for),
    confidentiality: row.confidentiality,
  }));
}

export async function logInteraction(input: {
  stakeholderId: string;
  occurredAt: string;
  channel: ContactChannel;
  summary: string;
  outcome: string | null;
  confidentiality: Confidentiality;
}): Promise<string> {
  const { data, error } = await supabase
    .from('stakeholder_interactions')
    .insert({
      stakeholder_id: input.stakeholderId,
      occurred_at: input.occurredAt,
      channel: input.channel,
      summary: input.summary,
      outcome: input.outcome,
      confidentiality: input.confidentiality,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// The private assessment
// ---------------------------------------------------------------------------

interface AssessmentRow {
  id: string;
  stakeholder_id: string;
  body: string;
  assessed_at: string;
  confidentiality: Confidentiality;
  author: NamedRef | NamedRef[] | null;
}

export async function fetchAssessments(stakeholderId: string): Promise<StakeholderAssessment[]> {
  const { data, error } = await supabase
    .from('stakeholder_assessments')
    .select(
      'id, stakeholder_id, body, assessed_at, confidentiality, ' +
        'author:profiles!stakeholder_assessments_created_by_fkey(full_name)',
    )
    .eq('stakeholder_id', stakeholderId)
    .order('assessed_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as AssessmentRow[]).map((row) => ({
    id: row.id,
    stakeholderId: row.stakeholder_id,
    body: row.body,
    assessedAt: row.assessed_at,
    authorName: label(row.author),
    confidentiality: row.confidentiality,
  }));
}

export async function addAssessment(input: { stakeholderId: string; body: string }): Promise<void> {
  const { error } = await supabase
    .from('stakeholder_assessments')
    .insert({ stakeholder_id: input.stakeholderId, body: input.body });
  fail(error);
}

// ---------------------------------------------------------------------------
// Who knows whom
// ---------------------------------------------------------------------------

interface RelationshipRow {
  id: string;
  from_stakeholder_id: string;
  to_stakeholder_id: string;
  kind: RelationshipKind;
  strength: number;
  note: string | null;
  source: NamedRef | NamedRef[] | null;
  target: NamedRef | NamedRef[] | null;
}

export async function fetchRelationships(): Promise<StakeholderRelationship[]> {
  const { data, error } = await supabase
    .from('stakeholder_relationships')
    .select(
      'id, from_stakeholder_id, to_stakeholder_id, kind, strength, note, ' +
        'source:stakeholders!stakeholder_relationships_from_stakeholder_id_fkey(full_name), ' +
        'target:stakeholders!stakeholder_relationships_to_stakeholder_id_fkey(full_name)',
    );
  fail(error);
  return ((data ?? []) as unknown as RelationshipRow[]).map((row) => ({
    id: row.id,
    fromStakeholderId: row.from_stakeholder_id,
    fromName: label(row.source),
    toStakeholderId: row.to_stakeholder_id,
    toName: label(row.target),
    kind: row.kind,
    strength: row.strength,
    note: row.note,
  }));
}

/**
 * Görüşme kaydı bulunan paydaşların kimlikleri (M4-10).
 *
 * Yol birinden başlamak zorunda, ve başlangıç "bu kişiyle konuştuk" kaydına
 * dayanıyor. Burada YALNIZCA kimlik okunuyor: `fetchInteractions()` özetleri
 * de getiriyor ve özetler gizli olabiliyor — bir yol hesabı için gizli metni
 * tarayıcıya indirmek, gerekmediği hâlde gizliliği gevşetmek olur
 * (CLAUDE.md §4).
 *
 * RLS'nin süzdüğü görüşme buraya hiç gelmiyor, ve bu doğru davranış:
 * okuyanın gördüğü yol, okuyanın bilmeye hakkı olan yoldur.
 */
export async function fetchSpokenToIds(): Promise<string[]> {
  const { data, error } = await supabase.from('stakeholder_interactions').select('stakeholder_id');
  fail(error);
  const ids = new Set(
    (data ?? []).map((row) => (row as { stakeholder_id: string }).stakeholder_id),
  );
  return [...ids];
}

export async function linkStakeholders(input: {
  fromStakeholderId: string;
  toStakeholderId: string;
  kind: RelationshipKind;
  strength: number;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('stakeholder_relationships').insert({
    from_stakeholder_id: input.fromStakeholderId,
    to_stakeholder_id: input.toStakeholderId,
    kind: input.kind,
    strength: input.strength,
    note: input.note,
  });
  fail(error);
}

export async function unlinkStakeholders(id: string): Promise<void> {
  const { error } = await supabase.from('stakeholder_relationships').delete().eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// What needs attention
// ---------------------------------------------------------------------------

interface AttentionRow {
  id: string;
  full_name: string;
  category: StakeholderCategory;
  stance: Stance;
  influence: number;
  interest: number;
  relationship_owner: string | null;
  last_contact_at: string | null;
  quiet_after_days: number;
  needs_an_owner: boolean;
  has_gone_quiet: boolean;
}

/**
 * A relationship does not fail loudly — it goes quiet, and the going quiet is
 * what nobody notices until it matters. The window scales with influence.
 */
export async function fetchAttention(): Promise<StakeholderAttention[]> {
  const { data, error } = await supabase
    .from('stakeholder_attention')
    .select('*')
    .order('influence', { ascending: false });
  fail(error);
  return ((data ?? []) as AttentionRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    category: row.category,
    stance: row.stance,
    influence: row.influence,
    interest: row.interest,
    relationshipOwner: row.relationship_owner,
    lastContactAt: row.last_contact_at,
    quietAfterDays: row.quiet_after_days,
    needsAnOwner: row.needs_an_owner,
    hasGoneQuiet: row.has_gone_quiet,
  }));
}

// ---------------------------------------------------------------------------
// Etkileşim planı (M4-12)
// ---------------------------------------------------------------------------

interface BoardRow {
  stakeholder_id: string;
  full_name: string;
  category: StakeholderCategory;
  stance: Stance;
  influence: number;
  interest: number;
  relationship_owner: string | null;
  plan_id: string | null;
  objective: string | null;
  message: string | null;
  next_step: string | null;
  next_step_owner: string | null;
  next_step_owner_name: string | null;
  next_step_due: string | null;
  status: EngagementPlanStatus | null;
  plan_confidentiality: Confidentiality | null;
  // Görünümde hesaplanmış bir `case`, yani `text`. Ekran bunu GEVŞEK okuyor
  // (`stepWord`), yani bir göç yeni bir değer eklerse bölüm düşmez; ham değer
  // görünür, çirkin ama dürüst.
  step_state: EngagementStepState;
  days_to_step: number | null;
  can_plan: boolean;
}

/**
 * Plan panosu: her paydaş bir satır, planı olmayanlar dâhil (M4-12, M4-05).
 *
 * Sıralama panonun ne için var olduğunu söylüyor: en çok ilgi isteyen önce.
 * Nüfuzu yüksek olup planı olmayan bir paydaş, vadesi geçmiş bir adımdan
 * daha acil olabilir — o yüzden sıra `step_state` değil, nüfuz.
 */
export async function fetchEngagementBoard(): Promise<EngagementBoardRow[]> {
  const { data, error } = await supabase
    .from('engagement_plan_board')
    .select('*')
    .order('influence', { ascending: false })
    .order('full_name');
  fail(error);
  return ((data ?? []) as BoardRow[]).map((row) => ({
    stakeholderId: row.stakeholder_id,
    fullName: row.full_name,
    category: row.category,
    stance: row.stance,
    influence: row.influence,
    interest: row.interest,
    relationshipOwner: row.relationship_owner,
    planId: row.plan_id,
    objective: row.objective,
    message: row.message,
    nextStep: row.next_step,
    nextStepOwner: row.next_step_owner,
    nextStepOwnerName: row.next_step_owner_name,
    nextStepDue: row.next_step_due,
    status: row.status,
    planConfidentiality: row.plan_confidentiality,
    stepState: row.step_state,
    daysToStep: row.days_to_step,
    canPlan: row.can_plan,
  }));
}

interface PlanRow {
  id: string;
  stakeholder_id: string;
  objective: string;
  message: string | null;
  next_step: string | null;
  next_step_owner: string | null;
  next_step_due: string | null;
  status: EngagementPlanStatus;
  closed_at: string | null;
  closed_note: string | null;
  confidentiality: Confidentiality;
}

/** Bir paydaşın plan geçmişi: ilişkinin kendi tarihi. */
export async function fetchEngagementPlans(stakeholderId: string): Promise<EngagementPlan[]> {
  const { data, error } = await supabase
    .from('stakeholder_engagement_plans')
    .select(
      'id, stakeholder_id, objective, message, next_step, next_step_owner, ' +
        'next_step_due, status, closed_at, closed_note, confidentiality',
    )
    .eq('stakeholder_id', stakeholderId)
    .order('created_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as PlanRow[]).map((row) => ({
    id: row.id,
    stakeholderId: row.stakeholder_id,
    objective: row.objective,
    message: row.message,
    nextStep: row.next_step,
    nextStepOwner: row.next_step_owner,
    nextStepDue: row.next_step_due,
    status: row.status,
    closedAt: row.closed_at,
    closedNote: row.closed_note,
    confidentiality: row.confidentiality,
  }));
}

/**
 * Yeni bir plan.
 *
 * Sıradaki adımın üç parçası BİRLİKTE gönderiliyor ya da hiç gönderilmiyor;
 * kuralı veritabanı uyguluyor (`engagement_plans_step_is_whole`), istemci
 * onu tekrarlamıyor — tekrarlanan kural, sapacak ikinci kopyadır.
 */
export async function saveEngagementPlan(input: {
  stakeholderId: string;
  objective: string;
  message: string | null;
  nextStep: string | null;
  nextStepOwner: string | null;
  nextStepDue: string | null;
}): Promise<void> {
  const { error } = await supabase.from('stakeholder_engagement_plans').insert({
    stakeholder_id: input.stakeholderId,
    objective: input.objective,
    message: input.message,
    next_step: input.nextStep,
    next_step_owner: input.nextStepOwner,
    next_step_due: input.nextStepDue,
  });
  fail(error);
}

export async function closeEngagementPlan(input: {
  id: string;
  status: EngagementPlanStatus;
  closedNote: string;
}): Promise<void> {
  const { error } = await supabase
    .from('stakeholder_engagement_plans')
    .update({
      status: input.status,
      closed_at: new Date().toISOString(),
      closed_note: input.closedNote,
    })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Dondurulmuş harita (M4-14)
// ---------------------------------------------------------------------------

interface SnapshotRow {
  id: string;
  title: string;
  note: string | null;
  confidentiality: Confidentiality;
  taken_at: string;
  taken_by: string | null;
  taken_by_name: string | null;
  taken_as_role: UserRole;
  stakeholder_count: number;
  stance_tally: Partial<Record<Stance, number>> | null;
  discarded_at: string | null;
  discarded_by_name: string | null;
  discarded_reason: string | null;
}

/**
 * Anlık görüntü kütüğü — haritanın kendisi HARİÇ.
 *
 * Kütüğü listelemek için her haritanın tamamını indirmek, bir listeyi
 * okumanın bedelini bütün verinin bedeli yapardı. Harita tek tek,
 * açıldığında okunuyor (`fetchMapSnapshotPeople`).
 */
export async function fetchMapSnapshots(): Promise<MapSnapshot[]> {
  const { data, error } = await supabase
    .from('stakeholder_map_snapshot_index')
    .select('*')
    .order('taken_at', { ascending: false });
  fail(error);
  return ((data ?? []) as SnapshotRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    note: row.note,
    confidentiality: row.confidentiality,
    takenAt: row.taken_at,
    takenBy: row.taken_by,
    takenByName: row.taken_by_name,
    takenAsRole: row.taken_as_role,
    stakeholderCount: row.stakeholder_count,
    stanceTally: row.stance_tally,
    discardedAt: row.discarded_at,
    discardedByName: row.discarded_by_name,
    discardedReason: row.discarded_reason,
  }));
}

/**
 * Dondurulmuş haritanın kendisi: o günün kopyası, bugünün kütüğü değil.
 *
 * `maybeSingle()` KULLANILMIYOR, ve sebebi ölçümle bulundu. O çağrı
 * PostgREST'e "bana bir nesne ver" başlığı GÖNDERMİYOR; diziyi alıp
 * istemcide çözüyor ve birden fazla satır gelirse hata veriyor. Gerçek
 * veritabanında `eq('id', …)` tek satır döndürdüğü için sorun görünmüyor —
 * ama tarayıcı kapısı satırları süzmeyen bir kurgu sunuyor ve orada bütün
 * harita sessizce boş geldi: panel açıldı, liste boştu, ekran "o gün kimse
 * yoktu" dedi. Diziden ilk satırı almak iki dünyada da aynı cevabı veriyor.
 *
 * `limit(1)` DE KULLANILMIYOR: birincil anahtara eşitlik zaten en çok bir
 * satır döndürüyor, ve bir `limit` liste-okuma kapısına "bu bir dilim" diye
 * görünür — dilim ise kaçını sakladığını söylemek zorundadır. Sakladığı bir
 * şey yok.
 */
export async function fetchMapSnapshotPeople(id: string): Promise<MapSnapshotPerson[]> {
  const { data, error } = await supabase
    .from('stakeholder_map_snapshots')
    .select('payload')
    .eq('id', id);
  fail(error);
  const row = ((data ?? []) as { payload?: unknown }[])[0];
  return Array.isArray(row?.payload) ? (row.payload as MapSnapshotPerson[]) : [];
}

/**
 * Anlık görüntü al.
 *
 * `payload` GÖNDERİLMİYOR, ve bu bir eksiklik değil: tetikleyici onu
 * sunucuda yazıyor, gönderileni okumuyor bile. İstemci yalnızca "anlık
 * görüntü al" diyor — tarih, rol ve haritanın kendisi veritabanından
 * geliyor, yani uydurulamıyor (göç 0058).
 *
 * `confidentiality` bir seçim, çünkü kimse kendi yetkisinin üstüne kayıt
 * yazamıyor: yetkisi `confidential` olan biri `restricted` bir harita
 * alırsa RLS reddediyor, ve reddi gizlemek yerine seçeneği gösteriyoruz.
 */
export async function takeMapSnapshot(input: {
  title: string;
  note: string | null;
  confidentiality: Confidentiality;
}): Promise<void> {
  const { error } = await supabase.from('stakeholder_map_snapshots').insert({
    title: input.title,
    note: input.note,
    confidentiality: input.confidentiality,
  });
  fail(error);
}

/**
 * Geçersiz say — silme değil.
 *
 * `discarded_at` gönderiliyor ama DEĞERİ ÖNEMSİZ: tetikleyici onu `now()`
 * ile eziyor. Gönderilmesi gerekiyor çünkü geçersiz saymanın başladığını
 * söyleyen şey o alan; ne zaman olduğunu söyleyen şey sunucu.
 */
export async function discardMapSnapshot(input: { id: string; reason: string }): Promise<void> {
  const { error } = await supabase
    .from('stakeholder_map_snapshots')
    .update({ discarded_at: new Date().toISOString(), discarded_reason: input.reason })
    .eq('id', input.id);
  fail(error);
}
