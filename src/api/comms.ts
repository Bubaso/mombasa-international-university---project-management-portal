/**
 * Communication and notification (M11).
 *
 * This file replaces three functions in api/index.ts that could not work:
 * they read a `messages` JSONB column removed in 0002, appended to it in the
 * browser and wrote the whole array back — losing a message whenever two
 * people replied at once (M11-03) — and stamped every one of them with the
 * literal string 'Current User' (M11-02).
 *
 * Here a message is a row, the sender is the caller, and the thread list
 * comes from a view that counts replies in SQL. A client that counts replies
 * by fetching them has to fetch every message in the project to draw a list.
 */
import { supabase } from '../lib/supabase';
import type {
  AnnouncementReach,
  ChannelMember,
  CommChannel,
  CommunicationThread,
  CorrespondenceEntry,
  DigestAudience,
  DigestRow,
  MessageAttachment,
  MessageReaction,
  NotificationHealth,
  NotificationItem,
  NotificationMedium,
  NotificationPreference,
  NotificationTopic,
  ThreadKind,
  ThreadMessage,
} from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const rows = <T>(data: unknown): T[] => (data ?? []) as unknown as T[];

type NamedRef = { full_name: string } | { full_name: string }[] | null;
const label = (ref: NamedRef): string | null =>
  Array.isArray(ref) ? (ref[0]?.full_name ?? null) : (ref?.full_name ?? null);

// ---------------------------------------------------------------------------
// Threads (M11-01, M11-04, M11-05, M11-11)
// ---------------------------------------------------------------------------

export async function fetchThreads(): Promise<CommunicationThread[]> {
  const { data, error } = await supabase
    .from('thread_board')
    .select('*')
    .order('pinned', { ascending: false })
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    channel: row.channel as CommChannel,
    kind: row.kind as ThreadKind,
    urgent: Boolean(row.urgent),
    pinned: Boolean(row.pinned),
    closedAt: row.closed_at as string | null,
    confidentiality: row.confidentiality as CommunicationThread['confidentiality'],
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | null,
    startedBy: row.started_by as string | null,
    legalCaseId: row.legal_case_id as string | null,
    constructionBlockId: row.construction_block_id as string | null,
    obligationId: row.obligation_id as string | null,
    transactionId: row.transaction_id as string | null,
    messages: Number(row.messages ?? 0),
    lastMessageAt: row.last_message_at as string | null,
    lastSpeaker: row.last_speaker as string | null,
    seenByMe: Boolean(row.seen_by_me),
  }));
}

/**
 * From `message_detail` rather than from the table, because the quotation has
 * to be resolved from the original row under the reader's own clearance
 * (M11-13). A client that copied the quoted text into the reply would be
 * carrying those words out of the tier they were written at.
 */
export async function fetchMessages(threadId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('message_detail')
    .select(
      'thread_message_id, thread_id, sender_id, body, created_at, quoted_message_id, ' +
        'quoted_body, quoted_sender_name, quoted_message_not_readable, attachments, ' +
        'reactions, sender:profiles(full_name)',
    )
    .eq('thread_id', threadId)
    .order('created_at');
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.thread_message_id as string,
    threadId: row.thread_id as string,
    senderId: row.sender_id as string,
    senderName: label(row.sender as NamedRef),
    body: row.body as string,
    createdAt: row.created_at as string,
    quotedMessageId: (row.quoted_message_id as string | null) ?? null,
    quotedBody: (row.quoted_body as string | null) ?? null,
    quotedSenderName: (row.quoted_sender_name as string | null) ?? null,
    quotedMessageNotReadable: Boolean(row.quoted_message_not_readable),
    attachments: Number(row.attachments ?? 0),
    reactions: Number(row.reactions ?? 0),
  }));
}

/** Who reacted to each message in a thread, and how (M11-13). */
export async function fetchReactions(threadId: string): Promise<MessageReaction[]> {
  const { data: ids, error: idError } = await supabase
    .from('message_detail')
    .select('thread_message_id')
    .eq('thread_id', threadId);
  fail(idError);
  const messageIds = rows<{ thread_message_id: string }>(ids).map((r) => r.thread_message_id);
  if (messageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('message_reaction_detail')
    .select('thread_message_id, reaction, people, who')
    .in('thread_message_id', messageIds);
  fail(error);
  return rows<Record<string, unknown>>(data).map((row) => ({
    threadMessageId: row.thread_message_id as string,
    reaction: row.reaction as MessageReaction['reaction'],
    people: Number(row.people ?? 0),
    who: (row.who as string[] | null) ?? [],
  }));
}

/** Only your own: a reaction in somebody else's name is a forged position. */
export async function react(input: {
  threadMessageId: string;
  profileId: string;
  reaction: MessageReaction['reaction'];
}): Promise<void> {
  const { error } = await supabase.from('message_reactions').insert({
    thread_message_id: input.threadMessageId,
    profile_id: input.profileId,
    reaction: input.reaction,
  });
  fail(error);
}

export async function unreact(input: {
  threadMessageId: string;
  profileId: string;
  reaction: MessageReaction['reaction'];
}): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('thread_message_id', input.threadMessageId)
    .eq('profile_id', input.profileId)
    .eq('reaction', input.reaction);
  fail(error);
}

/**
 * A file on a message is a vault document, by id. There is no URL to paste:
 * a message must not be a way around the vault's tiers or its download log.
 */
export async function attachToMessage(input: {
  threadMessageId: string;
  documentId: string;
  note: string | null;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase.from('message_attachments').insert({
    thread_message_id: input.threadMessageId,
    document_id: input.documentId,
    note: input.note,
    attached_by: input.profileId,
  });
  fail(error);
}

export async function fetchMessageAttachments(threadId: string): Promise<MessageAttachment[]> {
  const { data: ids, error: idError } = await supabase
    .from('message_detail')
    .select('thread_message_id')
    .eq('thread_id', threadId);
  fail(idError);
  const messageIds = rows<{ thread_message_id: string }>(ids).map((r) => r.thread_message_id);
  if (messageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('message_attachments')
    .select('thread_message_id, document_id, note, document:document_vault(title)')
    .in('thread_message_id', messageIds);
  fail(error);
  return rows<Record<string, unknown>>(data).map((row) => {
    const doc = row.document as { title: string } | { title: string }[] | null;
    const one = Array.isArray(doc) ? doc[0] : doc;
    return {
      threadMessageId: row.thread_message_id as string,
      documentId: row.document_id as string,
      documentTitle: one?.title ?? null,
      note: (row.note as string | null) ?? null,
    };
  });
}

export async function startThread(input: {
  title: string;
  channel: CommChannel;
  kind: ThreadKind;
  urgent?: boolean;
  confidentiality?: CommunicationThread['confidentiality'];
  legalCaseId?: string | null;
  firstMessage?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('communication_threads')
    .insert({
      title: input.title.trim(),
      channel: input.channel,
      kind: input.kind,
      urgent: input.urgent ?? false,
      confidentiality: input.confidentiality ?? 'internal',
      legal_case_id: input.legalCaseId || null,
    })
    .select('id')
    .single();
  fail(error);

  const id = (data as { id: string }).id;
  if (input.firstMessage?.trim()) {
    await postMessage(id, input.firstMessage);
  }
  return id;
}

/**
 * One row, one message, and the sender is whoever is signed in.
 *
 * The id comes from the database and the sender from the session, so there is
 * no client-side `Date.now()` identifier and no name to get wrong. The insert
 * policy independently requires sender_id = auth.uid(), so a tampered client
 * cannot post as somebody else either.
 */
export async function postMessage(threadId: string, body: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) throw new Error('Sign in again — your session has expired.');

  const { error } = await supabase
    .from('thread_messages')
    .insert({ thread_id: threadId, sender_id: me, body: body.trim() });
  fail(error);
}

export async function closeThread(id: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const { error } = await supabase
    .from('communication_threads')
    .update({ closed_at: new Date().toISOString(), closed_by: session.session?.user.id ?? null })
    .eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Announcements (M11-08, M11-11)
// ---------------------------------------------------------------------------

export async function acknowledgeAnnouncement(threadId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) throw new Error('Sign in again — your session has expired.');

  const { error } = await supabase
    .from('announcement_receipts')
    .upsert({ thread_id: threadId, user_id: me }, { onConflict: 'thread_id,user_id' });
  fail(error);
}

export async function fetchReach(): Promise<AnnouncementReach[]> {
  const { data, error } = await supabase
    .from('announcement_reach')
    .select('*')
    .order('created_at', { ascending: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    threadId: row.thread_id as string,
    title: row.title as string,
    channel: row.channel as CommChannel,
    urgent: Boolean(row.urgent),
    createdAt: row.created_at as string,
    seen: Number(row.seen ?? 0),
    couldSee: Number(row.could_see ?? 0),
    seenBy: (row.seen_by as string[] | null) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Channels (M11-04)
// ---------------------------------------------------------------------------

export async function fetchChannelMembers(): Promise<ChannelMember[]> {
  const { data, error } = await supabase
    .from('channel_members')
    .select(
      'channel, profile_id, added_at, note, member:profiles!channel_members_profile_id_fkey(full_name)',
    )
    .order('channel');
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    channel: row.channel as CommChannel,
    profileId: row.profile_id as string,
    fullName: label(row.member as NamedRef),
    addedAt: row.added_at as string,
    note: row.note as string | null,
  }));
}

export async function addChannelMember(input: {
  channel: CommChannel;
  profileId: string;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('channel_members').insert({
    channel: input.channel,
    profile_id: input.profileId,
    note: input.note?.trim() || null,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Notifications (M11-06, M11-07)
// ---------------------------------------------------------------------------

export async function fetchInbox(limit = 40): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('my_notifications')
    .select('*')
    .order('raised_at', { ascending: false })
    .limit(limit);
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.id as string,
    topic: row.topic as NotificationTopic,
    urgent: Boolean(row.urgent),
    titleEn: row.title_en as string,
    titleTr: row.title_tr as string | null,
    body: row.body as string | null,
    entityKind: row.entity_kind as string | null,
    entityId: row.entity_id as string | null,
    threadId: row.thread_id as string | null,
    raisedAt: row.raised_at as string,
    deliveryId: row.delivery_id as string,
    readAt: row.read_at as string | null,
    awaitingAProvider: (row.awaiting_a_provider as string[] | null) ?? [],
    raisedBy: row.raised_by as string | null,
  }));
}

/**
 * Whether anything is raising notifications at all (0033).
 *
 * Returns null when no sweep has ever run, which is a different statement
 * from "nothing to report" and is shown as such: a portal that has never
 * swept has an inbox that cannot fill, and nobody would know from the inbox.
 */
export async function fetchNotificationHealth(): Promise<NotificationHealth | null> {
  const { data, error } = await supabase.from('notification_health').select('*').maybeSingle();
  fail(error);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  return {
    lastRanAt: row.last_ran_at as string,
    lastTriggerSource: row.last_trigger_source as 'schedule' | 'manual',
    lastRaised: Number(row.last_raised),
    hoursSince: Number(row.hours_since),
    looksStopped: Boolean(row.looks_stopped),
    mediaWithAProvider: (row.media_with_a_provider as NotificationMedium[] | null) ?? [],
    mediaWithoutAProvider: (row.media_without_a_provider as NotificationMedium[] | null) ?? [],
  };
}

/** Runs the sweep now. Safe to press twice: every raise is keyed. */
export async function runNotificationSweep(): Promise<number> {
  const { data, error } = await supabase.rpc('run_notification_sweep');
  fail(error);
  return Number(data ?? 0);
}

export async function markNotificationRead(deliveryId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_deliveries')
    .update({ read_at: new Date().toISOString() })
    .eq('id', deliveryId);
  fail(error);
}

export async function fetchPreferences(): Promise<NotificationPreference[]> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('topic, medium, enabled');
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    topic: row.topic as NotificationTopic,
    medium: row.medium as NotificationMedium,
    enabled: Boolean(row.enabled),
  }));
}

/**
 * Setting one.
 *
 * The database refuses to switch off a hearing or a deadline in the portal
 * itself (M11-07), and the message it raises says so. Nothing is pre-empted
 * here: a rule enforced in two places drifts, and the one that drifts is
 * always the copy.
 */
export async function setPreference(input: {
  topic: NotificationTopic;
  medium: NotificationMedium;
  enabled: boolean;
}): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) throw new Error('Sign in again — your session has expired.');

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: me, topic: input.topic, medium: input.medium, enabled: input.enabled },
      { onConflict: 'user_id,topic,medium' },
    );
  fail(error);
}

// ---------------------------------------------------------------------------
// Official correspondence (M11-12)
// ---------------------------------------------------------------------------

const CORRESPONDENCE_COLUMNS =
  'id, reference_no, direction, route, subject_en, subject_tr, summary, sent_on, ' +
  'counterparty_name, document_id, legal_case_id, delivery_confirmed_on, ' +
  'delivery_evidence_document_id, delivery_note, confidentiality, ' +
  'signatory:profiles!correspondence_signed_by_fkey(full_name), ' +
  'stakeholder:stakeholders(full_name), organization:organizations(name)';

export async function fetchCorrespondence(): Promise<CorrespondenceEntry[]> {
  const { data, error } = await supabase
    .from('correspondence')
    .select(CORRESPONDENCE_COLUMNS)
    .order('sent_on', { ascending: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => {
    const org = row.organization as { name: string } | { name: string }[] | null;
    const orgName = Array.isArray(org) ? (org[0]?.name ?? null) : (org?.name ?? null);
    return {
      id: row.id as string,
      referenceNo: row.reference_no as string | null,
      direction: row.direction as CorrespondenceEntry['direction'],
      route: row.route as CorrespondenceEntry['route'],
      subjectEn: row.subject_en as string,
      subjectTr: row.subject_tr as string | null,
      summary: row.summary as string | null,
      sentOn: row.sent_on as string,
      counterparty:
        label(row.stakeholder as NamedRef) ?? orgName ?? (row.counterparty_name as string | null),
      signedByName: label(row.signatory as NamedRef),
      documentId: row.document_id as string | null,
      legalCaseId: row.legal_case_id as string | null,
      deliveryConfirmedOn: row.delivery_confirmed_on as string | null,
      deliveryEvidenceDocumentId: row.delivery_evidence_document_id as string | null,
      deliveryNote: row.delivery_note as string | null,
      confidentiality: row.confidentiality as CorrespondenceEntry['confidentiality'],
    };
  });
}

export async function addCorrespondence(input: {
  direction: CorrespondenceEntry['direction'];
  route: CorrespondenceEntry['route'];
  subjectEn: string;
  sentOn: string;
  counterpartyName: string;
  referenceNo?: string | null;
  documentId?: string | null;
  summary?: string | null;
}): Promise<void> {
  // The database requires the letter itself on anything outgoing. Saying so
  // here is kinder than letting a constraint name arrive on the screen.
  if (input.direction === 'outgoing' && !input.documentId) {
    throw new Error(
      'An outgoing letter is filed with the letter. Put it in the vault first — ' +
        'a register of letters whose letters are missing is a list of assertions.',
    );
  }
  const { error } = await supabase.from('correspondence').insert({
    direction: input.direction,
    route: input.route,
    subject_en: input.subjectEn.trim(),
    sent_on: input.sentOn,
    counterparty_name: input.counterpartyName.trim(),
    reference_no: input.referenceNo?.trim() || null,
    document_id: input.documentId || null,
    summary: input.summary?.trim() || null,
  });
  fail(error);
}

export async function confirmDelivery(input: {
  id: string;
  confirmedOn: string;
  evidenceDocumentId?: string | null;
  note?: string | null;
}): Promise<void> {
  if (!input.evidenceDocumentId && !input.note?.trim()) {
    throw new Error(
      'Say how delivery was confirmed — a receipt in the vault, or in writing. ' +
        '“We are sure they got it” is the thing this column exists to replace.',
    );
  }
  const { error } = await supabase
    .from('correspondence')
    .update({
      delivery_confirmed_on: input.confirmedOn,
      delivery_evidence_document_id: input.evidenceDocumentId || null,
      delivery_note: input.note?.trim() || null,
    })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// The weekly digest (M11-10)
// ---------------------------------------------------------------------------

export async function fetchDigest(
  audience: DigestAudience,
  from: string,
  to: string,
): Promise<DigestRow[]> {
  const { data, error } = await supabase.rpc('weekly_digest', {
    p_audience: audience,
    p_from: from,
    p_to: to,
  });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    section: row.section as string,
    occurredOn: row.occurred_on as string | null,
    titleEn: row.title_en as string | null,
    titleTr: row.title_tr as string | null,
    detail: row.detail as string | null,
    entityKind: row.entity_kind as string | null,
    entityId: row.entity_id as string | null,
    confidentiality: row.confidentiality as DigestRow['confidentiality'],
  }));
}
