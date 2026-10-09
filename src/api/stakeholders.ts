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
