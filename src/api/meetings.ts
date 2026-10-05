/**
 * Meetings, decisions, actions and open questions (M3).
 *
 * Everything here is subject to row level security: a meeting reaches
 * somebody outside the organisation only if they were in the room, and an
 * action reaches its owner even when the meeting behind it does not. Those
 * are rules in supabase/migrations/0007, not filters written here.
 *
 * A "party" — an attendee, an action's owner, a dissenter — is either a
 * portal user or somebody in the stakeholder register, and the schema
 * requires exactly one of the two. That is the shape resolveParty() reads.
 */
import { supabase } from '../lib/supabase';
import type {
  ActionItem,
  ActionStatus,
  AgendaItem,
  AttendanceRole,
  Confidentiality,
  ContentLanguage,
  Decision,
  DecisionStatus,
  Meeting,
  MeetingAttendee,
  MeetingKind,
  MeetingNote,
  MeetingStatus,
  MinutesStatus,
  NoteSection,
  OpenQuestion,
  Party,
  PriorityLevel,
  QuestionStatus,
  VoteOutcome,
} from '../types';

interface NamedRef {
  full_name: string;
}

function label(ref: NamedRef | NamedRef[] | null | undefined): string | null {
  if (!ref) return null;
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.full_name ?? null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

interface PartyRow {
  profile_id?: string | null;
  stakeholder_id?: string | null;
  owner_profile_id?: string | null;
  owner_stakeholder_id?: string | null;
  person?: NamedRef | NamedRef[] | null;
  contact?: NamedRef | NamedRef[] | null;
}

/** Collapses the two possible columns into one answer to "who". */
function resolveParty(row: PartyRow): Party {
  const profileId = row.profile_id ?? row.owner_profile_id ?? null;
  const stakeholderId = row.stakeholder_id ?? row.owner_stakeholder_id ?? null;
  return {
    profileId,
    stakeholderId,
    name: label(row.person) ?? label(row.contact),
  };
}

/** The two embeds every party-bearing row selects. */
function partyColumns(table: string, prefix = ''): string {
  return (
    `person:profiles!${table}_${prefix}profile_id_fkey(full_name), ` +
    `contact:stakeholders!${table}_${prefix}stakeholder_id_fkey(full_name)`
  );
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

interface MeetingRow {
  id: string;
  title: string;
  title_tr: string | null;
  held_at: string;
  location: string | null;
  kind: MeetingKind;
  priority: PriorityLevel;
  status: MeetingStatus;
  minutes_status: MinutesStatus;
  continues_meeting_id: string | null;
  confidentiality: Confidentiality;
  preparer: NamedRef | NamedRef[] | null;
  meeting_attendees: { count: number }[] | null;
}

/**
 * No embed for the meeting this one continues.
 *
 * It used to ask PostgREST to join `meetings` to itself by constraint name,
 * and that is the one relationship a live project would not resolve: a
 * self-reference has to be in the schema cache under its own hint, and after
 * a batch of migrations some workers had it and some did not, so the screen
 * failed intermittently with "could not find a relationship between
 * 'meetings' and 'meetings'".
 *
 * The title is one string, and for a list it is already in the result — the
 * continuation points at another meeting in the same set. So it is resolved
 * from what came back, at no extra cost, and the client no longer depends on
 * the least reliable corner of PostgREST's embedding.
 */
const MEETING_COLUMNS =
  'id, title, title_tr, held_at, location, kind, priority, status, minutes_status, ' +
  'continues_meeting_id, confidentiality, ' +
  'preparer:profiles!meetings_prepared_by_fkey(full_name), ' +
  'meeting_attendees(count)';

function toMeeting(row: MeetingRow, titles?: Map<string, string>): Meeting {
  return {
    id: row.id,
    title: row.title,
    // 0028. The Notion migration merged the English and Turkish minute of
    // each meeting into one record, and this is the title the other half
    // carried — null for a meeting minuted in one language only.
    titleTr: row.title_tr,
    heldAt: row.held_at,
    location: row.location,
    kind: row.kind,
    priority: row.priority,
    status: row.status,
    minutesStatus: row.minutes_status,
    preparedByName: label(row.preparer),
    continuesMeetingId: row.continues_meeting_id,
    continuesMeetingTitle:
      (row.continues_meeting_id && titles?.get(row.continues_meeting_id)) ?? null,
    confidentiality: row.confidentiality,
    attendeeCount: row.meeting_attendees?.[0]?.count ?? 0,
  };
}

export async function fetchMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select(MEETING_COLUMNS)
    .order('held_at', { ascending: false });
  fail(error);
  const rows = (data ?? []) as unknown as MeetingRow[];
  // The continuation is another row in this same set, so no second read.
  const titles = new Map(rows.map((row) => [row.id, row.title]));
  return rows.map((row) => toMeeting(row, titles));
}

export async function fetchMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select(MEETING_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  fail(error);
  if (!data) return null;
  const row = data as unknown as MeetingRow;

  // One row, so the title has to be looked up — and only when there is a
  // continuation to look up, which is the uncommon case.
  const titles = new Map<string, string>();
  if (row.continues_meeting_id) {
    const { data: parent } = await supabase
      .from('meetings')
      .select('id, title')
      .eq('id', row.continues_meeting_id)
      .maybeSingle();
    const found = parent as { id: string; title: string } | null;
    if (found) titles.set(found.id, found.title);
  }
  return toMeeting(row, titles);
}

export interface MeetingInput {
  title: string;
  heldAt: string;
  location: string | null;
  kind: MeetingKind;
  priority: PriorityLevel;
  status: MeetingStatus;
  minutesStatus: MinutesStatus;
  continuesMeetingId: string | null;
  confidentiality: Confidentiality;
}

function meetingRow(input: Partial<MeetingInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.title !== undefined) row.title = input.title;
  if (input.heldAt !== undefined) row.held_at = input.heldAt;
  if (input.location !== undefined) row.location = input.location;
  if (input.kind !== undefined) row.kind = input.kind;
  if (input.priority !== undefined) row.priority = input.priority;
  if (input.status !== undefined) row.status = input.status;
  if (input.minutesStatus !== undefined) row.minutes_status = input.minutesStatus;
  if (input.continuesMeetingId !== undefined) row.continues_meeting_id = input.continuesMeetingId;
  if (input.confidentiality !== undefined) row.confidentiality = input.confidentiality;
  return row;
}

export async function createMeeting(input: MeetingInput): Promise<Meeting> {
  const { data, error } = await supabase
    .from('meetings')
    .insert(meetingRow(input))
    .select(MEETING_COLUMNS)
    .single();
  fail(error);
  return toMeeting(data as unknown as MeetingRow);
}

export async function updateMeeting(input: {
  id: string;
  changes: Partial<MeetingInput>;
}): Promise<Meeting> {
  const { data, error } = await supabase
    .from('meetings')
    .update(meetingRow(input.changes))
    .eq('id', input.id)
    .select(MEETING_COLUMNS)
    .maybeSingle();
  fail(error);
  if (!data) throw new Error('That change was refused: you may not edit this meeting.');
  return toMeeting(data as unknown as MeetingRow);
}

// ---------------------------------------------------------------------------
// Attendees
// ---------------------------------------------------------------------------

interface AttendeeRow extends PartyRow {
  id: string;
  meeting_id: string;
  role_at_meeting: AttendanceRole;
  attended: boolean;
}

export async function fetchAttendees(meetingId: string): Promise<MeetingAttendee[]> {
  const { data, error } = await supabase
    .from('meeting_attendees')
    .select(
      `id, meeting_id, profile_id, stakeholder_id, role_at_meeting, attended, ${partyColumns('meeting_attendees')}`,
    )
    .eq('meeting_id', meetingId);
  fail(error);
  return ((data ?? []) as unknown as AttendeeRow[]).map((row) => ({
    id: row.id,
    meetingId: row.meeting_id,
    roleAtMeeting: row.role_at_meeting,
    attended: row.attended,
    ...resolveParty(row),
  }));
}

export async function addAttendee(input: {
  meetingId: string;
  profileId: string | null;
  stakeholderId: string | null;
  roleAtMeeting: AttendanceRole;
}): Promise<void> {
  const { error } = await supabase.from('meeting_attendees').insert({
    meeting_id: input.meetingId,
    profile_id: input.profileId,
    stakeholder_id: input.stakeholderId,
    role_at_meeting: input.roleAtMeeting,
  });
  fail(error);
}

export async function removeAttendee(id: string): Promise<void> {
  const { error } = await supabase.from('meeting_attendees').delete().eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// The note
// ---------------------------------------------------------------------------

interface NoteRow {
  id: string;
  meeting_id: string;
  section: NoteSection;
  language: ContentLanguage;
  body: string;
  is_machine_translation: boolean;
  confidentiality: Confidentiality;
}

export async function fetchNotes(meetingId: string): Promise<MeetingNote[]> {
  const { data, error } = await supabase
    .from('meeting_notes')
    .select('id, meeting_id, section, language, body, is_machine_translation, confidentiality')
    .eq('meeting_id', meetingId);
  fail(error);
  return ((data ?? []) as NoteRow[]).map((row) => ({
    id: row.id,
    meetingId: row.meeting_id,
    section: row.section,
    language: row.language,
    body: row.body,
    isMachineTranslation: row.is_machine_translation,
    confidentiality: row.confidentiality,
  }));
}

/**
 * One row per (meeting, section, language), so saving is an upsert on that
 * key. A note whose minutes are final is refused by a trigger, not by this.
 */
export async function saveNote(input: {
  meetingId: string;
  section: NoteSection;
  language: ContentLanguage;
  body: string;
}): Promise<void> {
  const { error } = await supabase.from('meeting_notes').upsert(
    {
      meeting_id: input.meetingId,
      section: input.section,
      language: input.language,
      body: input.body,
      is_machine_translation: false,
    },
    { onConflict: 'meeting_id,section,language' },
  );
  fail(error);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

interface DissentRow extends PartyRow {
  id: string;
  note: string | null;
}

interface DecisionRow {
  id: string;
  meeting_id: string | null;
  reference_no: string | null;
  text_en: string | null;
  text_tr: string | null;
  rationale_en: string | null;
  rationale_tr: string | null;
  organ: string | null;
  vote: VoteOutcome | null;
  decided_on: string;
  status: DecisionStatus;
  confidentiality: Confidentiality;
  decision_dissents: DissentRow[] | null;
}

const DECISION_COLUMNS =
  'id, meeting_id, reference_no, text_en, text_tr, rationale_en, rationale_tr, organ, vote, ' +
  'decided_on, status, confidentiality, ' +
  `decision_dissents(id, note, profile_id, stakeholder_id, ${partyColumns('decision_dissents')})`;

function toDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    referenceNo: row.reference_no,
    textEn: row.text_en,
    textTr: row.text_tr,
    rationaleEn: row.rationale_en,
    rationaleTr: row.rationale_tr,
    organ: row.organ,
    vote: row.vote,
    decidedOn: row.decided_on,
    status: row.status,
    confidentiality: row.confidentiality,
    dissenters: (row.decision_dissents ?? []).map((d) => ({
      id: d.id,
      note: d.note,
      ...resolveParty(d),
    })),
  };
}

export async function fetchDecisions(meetingId?: string): Promise<Decision[]> {
  let query = supabase
    .from('decisions')
    .select(DECISION_COLUMNS)
    .order('decided_on', { ascending: false });
  if (meetingId) query = query.eq('meeting_id', meetingId);
  const { data, error } = await query;
  fail(error);
  return ((data ?? []) as unknown as DecisionRow[]).map(toDecision);
}

export interface DecisionInput {
  meetingId: string | null;
  referenceNo: string | null;
  textEn: string | null;
  textTr: string | null;
  rationaleEn: string | null;
  organ: string | null;
  vote: VoteOutcome | null;
  decidedOn: string;
  status: DecisionStatus;
  confidentiality: Confidentiality;
}

export async function createDecision(input: DecisionInput): Promise<string> {
  const { data, error } = await supabase
    .from('decisions')
    .insert({
      meeting_id: input.meetingId,
      reference_no: input.referenceNo,
      text_en: input.textEn,
      text_tr: input.textTr,
      rationale_en: input.rationaleEn,
      organ: input.organ,
      vote: input.vote,
      decided_on: input.decidedOn,
      status: input.status,
      confidentiality: input.confidentiality,
    })
    // Returned so the caller can act on what was created — M3-10's automatic
    // translation needs to know which row to look at.
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

export async function updateDecisionStatus(input: {
  id: string;
  status: DecisionStatus;
}): Promise<void> {
  const { error } = await supabase
    .from('decisions')
    .update({ status: input.status })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface ActionRow extends PartyRow {
  id: string;
  meeting_id: string | null;
  decision_id: string | null;
  text_en: string | null;
  text_tr: string | null;
  due_date: string;
  status: ActionStatus;
  priority: PriorityLevel;
  completed_at: string | null;
  completion_note: string | null;
  confidentiality: Confidentiality;
}

const ACTION_COLUMNS =
  'id, meeting_id, decision_id, text_en, text_tr, due_date, status, priority, ' +
  'completed_at, completion_note, confidentiality, owner_profile_id, owner_stakeholder_id, ' +
  `${partyColumns('action_items', 'owner_')}`;

function toAction(row: ActionRow): ActionItem {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    decisionId: row.decision_id,
    textEn: row.text_en,
    textTr: row.text_tr,
    dueDate: row.due_date,
    status: row.status,
    priority: row.priority,
    completedAt: row.completed_at,
    completionNote: row.completion_note,
    confidentiality: row.confidentiality,
    ...resolveParty(row),
  };
}

/**
 * @param meetingId Verilirse yalnızca o toplantının aksiyonları.
 * @param legalCaseId Verilirse yalnızca o davadan doğanlar (0053).
 *
 *   Dava süzgeci, hukuk ekranının "Kenya ziyaret planı" sekmesi için eklendi:
 *   sekme numaralı bir strateji metnini koda gömülü tutuyordu ve adımların her
 *   biri aslında bir aksiyondu. Aksiyonun kütüğü sorumlu ile tarihi **zorunlu**
 *   tutuyor (M3-02), gömülü plan ikisini de taşımıyordu — yani ekranda
 *   takip ediliyormuş gibi duran bir şey vardı, takip edeni olmadan.
 */
export async function fetchActions(
  meetingId?: string,
  legalCaseId?: string,
): Promise<ActionItem[]> {
  let query = supabase.from('action_items').select(ACTION_COLUMNS).order('due_date');
  if (meetingId) query = query.eq('meeting_id', meetingId);
  if (legalCaseId) query = query.eq('legal_case_id', legalCaseId);
  const { data, error } = await query;
  fail(error);
  return ((data ?? []) as unknown as ActionRow[]).map(toAction);
}

export interface ActionInput {
  meetingId: string | null;
  decisionId: string | null;
  textEn: string | null;
  textTr: string | null;
  dueDate: string;
  priority: PriorityLevel;
  ownerProfileId: string | null;
  ownerStakeholderId: string | null;
  confidentiality: Confidentiality;
}

export async function createAction(input: ActionInput): Promise<string> {
  const { data, error } = await supabase
    .from('action_items')
    .insert({
      meeting_id: input.meetingId,
      decision_id: input.decisionId,
      text_en: input.textEn,
      text_tr: input.textTr,
      due_date: input.dueDate,
      priority: input.priority,
      owner_profile_id: input.ownerProfileId,
      owner_stakeholder_id: input.ownerStakeholderId,
      confidentiality: input.confidentiality,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

/**
 * What an owner is allowed to change. Moving the date, reassigning it or
 * rewriting it is refused by a trigger for anyone who is not keeping the
 * record — an owner reports on an action, they do not redefine it.
 */
export async function reportOnAction(input: {
  id: string;
  status: ActionStatus;
  completionNote: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('action_items')
    .update({ status: input.status, completion_note: input.completionNote })
    .eq('id', input.id);
  fail(error);
}

export async function rescheduleAction(input: { id: string; dueDate: string }): Promise<void> {
  const { error } = await supabase
    .from('action_items')
    .update({ due_date: input.dueDate })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Open questions
// ---------------------------------------------------------------------------

interface QuestionRow extends PartyRow {
  id: string;
  meeting_id: string | null;
  question_en: string | null;
  question_tr: string | null;
  detail_en: string | null;
  detail_tr: string | null;
  status: QuestionStatus;
  target_resolution_date: string | null;
  answer_en: string | null;
  answer_tr: string | null;
  answered_at: string | null;
  confidentiality: Confidentiality;
}

const QUESTION_COLUMNS =
  'id, meeting_id, question_en, question_tr, detail_en, detail_tr, status, ' +
  'target_resolution_date, answer_en, answer_tr, answered_at, confidentiality, ' +
  'owner_profile_id, owner_stakeholder_id, ' +
  `${partyColumns('open_questions', 'owner_')}`;

function toQuestion(row: QuestionRow): OpenQuestion {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    questionEn: row.question_en,
    questionTr: row.question_tr,
    detailEn: row.detail_en,
    detailTr: row.detail_tr,
    status: row.status,
    targetResolutionDate: row.target_resolution_date,
    answerEn: row.answer_en,
    answerTr: row.answer_tr,
    answeredAt: row.answered_at,
    confidentiality: row.confidentiality,
    ...resolveParty(row),
  };
}

export async function fetchQuestions(meetingId?: string): Promise<OpenQuestion[]> {
  let query = supabase
    .from('open_questions')
    .select(QUESTION_COLUMNS)
    .order('target_resolution_date', { nullsFirst: false });
  if (meetingId) query = query.eq('meeting_id', meetingId);
  const { data, error } = await query;
  fail(error);
  return ((data ?? []) as unknown as QuestionRow[]).map(toQuestion);
}

export async function createQuestion(input: {
  meetingId: string | null;
  questionEn: string | null;
  questionTr: string | null;
  targetResolutionDate: string | null;
  ownerProfileId: string | null;
  ownerStakeholderId: string | null;
  confidentiality: Confidentiality;
}): Promise<string> {
  const { data, error } = await supabase
    .from('open_questions')
    .insert({
      meeting_id: input.meetingId,
      question_en: input.questionEn,
      question_tr: input.questionTr,
      target_resolution_date: input.targetResolutionDate,
      owner_profile_id: input.ownerProfileId,
      owner_stakeholder_id: input.ownerStakeholderId,
      confidentiality: input.confidentiality,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

export async function answerQuestion(input: {
  id: string;
  status: QuestionStatus;
  answerEn: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('open_questions')
    .update({
      status: input.status,
      answer_en: input.answerEn,
      answered_at: input.status === 'answered' ? new Date().toISOString() : null,
    })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// The agenda
// ---------------------------------------------------------------------------

interface AgendaRow {
  item_kind: 'action' | 'question';
  id: string;
  text_en: string | null;
  text_tr: string | null;
  due_on: string | null;
  status: string;
  priority: PriorityLevel;
  raised_at_meeting_id: string | null;
  owner_profile_id: string | null;
  owner_stakeholder_id: string | null;
  overdue: boolean;
}

/**
 * Everything still open. A new meeting starts from this rather than from a
 * blank page, which is the mechanism behind "no action disappears quietly":
 * the only way off the list is to finish the thing or to say out loud that it
 * is cancelled.
 */
export async function fetchAgenda(): Promise<AgendaItem[]> {
  const { data, error } = await supabase
    .from('meeting_agenda_candidates')
    .select('*')
    .order('due_on', { nullsFirst: false });
  fail(error);
  return ((data ?? []) as AgendaRow[]).map((row) => ({
    itemKind: row.item_kind,
    id: row.id,
    textEn: row.text_en,
    textTr: row.text_tr,
    dueOn: row.due_on,
    status: row.status,
    priority: row.priority,
    raisedAtMeetingId: row.raised_at_meeting_id,
    ownerProfileId: row.owner_profile_id,
    ownerStakeholderId: row.owner_stakeholder_id,
    overdue: row.overdue,
  }));
}
