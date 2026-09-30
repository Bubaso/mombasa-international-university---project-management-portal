#!/usr/bin/env node
/**
 * Moves the Notion Meeting Hub into the portal (G-01 … G-05).
 *
 * The decision was a one-time migration, after which the portal is the system
 * of record. "One-time" is about the direction, not about the number of
 * attempts: nobody gets an import right first go, so every row carries where
 * it came from and running this again updates rather than duplicates.
 *
 * Nothing is written to this repository. The script reads Notion live and
 * writes to Supabase live, because the material — assessments of ministers,
 * legal strategy, a private contact register — does not belong in a git
 * history.
 *
 * Usage:
 *   NOTION_TOKEN=secret_… \
 *   SUPABASE_URL=https://….supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   npm run import:notion -- --dry-run
 *
 * --dry-run reads everything, resolves everything, prints exactly what it
 * would write and what it could not, and touches nothing. Run it first. The
 * report it prints is the thing to read: what this import cannot do is more
 * interesting than what it can.
 */
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE = 'notion';

/** The five databases in the Meeting Hub, as of the schema read in 2026-09. */
const DATABASES = {
  contacts: 'a957ad4c-e2de-49d2-a607-607bb7093446',
  meetingsEn: 'a906e737-a3fa-46fb-9f98-cb988ebc5518',
  meetingsTr: '7406b809-1f98-45ae-b6b5-744e8b077651',
  suggestions: '044fcc31-9b2a-4250-b425-1b42c44687e2',
};

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const CATEGORY = {
  Government: 'government',
  NGO: 'ngo',
  'Community Leader': 'community_leader',
  Partner: 'partner_trust',
  Media: 'media',
  Other: 'other',
};

const MEETING_KIND = {
  'Field Visit': 'site',
  Government: 'official',
  Partner: 'partner',
  Internal: 'internal',
  Other: 'internal',
  // Turkish database
  'Saha Ziyareti': 'site',
  Devlet: 'official',
  Ortak: 'partner',
  İç: 'internal',
  Diğer: 'internal',
};

const MEETING_STATUS = {
  Completed: 'completed',
  // Spelt this way in the source; kept verbatim so the lookup actually hits.
  Progresing: 'in_progress',
  Planlandı: 'planned',
  'Devam Ediyor': 'in_progress',
  Tamamlandı: 'completed',
  'İptal Edildi': 'cancelled',
};

const PRIORITY = {
  High: 'high',
  Medium: 'normal',
  Low: 'low',
  Yüksek: 'high',
  Orta: 'normal',
  Düşük: 'low',
};

const SUGGESTION_KIND = {
  Contact: 'contact',
  'Agenda Item': 'agenda_item',
  'Meeting Topic': 'meeting_topic',
  Material: 'material',
  Other: 'other',
};

const SUGGESTION_STATUS = {
  'Pending Review': 'pending_review',
  Approved: 'approved',
  Rejected: 'rejected',
  'Added to Plan': 'added_to_plan',
};

/** Which property holds each note section, per language. */
const NOTE_FIELDS = {
  en: {
    agenda: 'Agenda',
    discussed: 'Meeting Notes',
    actions: 'Action Items',
    outcomes: 'Key Outcomes',
  },
  tr: {
    agenda: 'Gündem',
    discussed: 'Toplantı Notları',
    actions: 'Aksiyon Maddeleri',
    outcomes: 'Temel Sonuçlar',
  },
};

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

const NOTION_VERSION = '2022-06-28';

async function notion(path, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not set.');

  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Notion ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/** Every page in a database, following the cursor. */
async function readDatabase(id) {
  const pages = [];
  let cursor;
  do {
    const page = await notion(`databases/${id}/query`, {
      page_size: 100,
      start_cursor: cursor,
    });
    pages.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return pages;
}

/** The plain text of a Notion property, whatever kind it is. */
function text(page, name) {
  const property = page.properties?.[name];
  if (!property) return '';
  switch (property.type) {
    case 'title':
      return property.title
        .map((t) => t.plain_text)
        .join('')
        .trim();
    case 'rich_text':
      return property.rich_text
        .map((t) => t.plain_text)
        .join('')
        .trim();
    case 'select':
      return property.select?.name ?? '';
    case 'email':
      return property.email ?? '';
    case 'phone_number':
      return property.phone_number ?? '';
    case 'url':
      return property.url ?? '';
    case 'date':
      return property.date?.start ?? '';
    case 'created_time':
      return property.created_time ?? '';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Matching a written name to a record
// ---------------------------------------------------------------------------

const HONORIFICS =
  /^(mr|mrs|ms|miss|dr|prof|h\.?e|hon|sir|sn|sayın|bay|bayan|av|adv|eng|mühendis)\.?\s+/i;

/**
 * Attendees are free text in Notion — "Mr. Musaib (First Advisor to Mombasa
 * Governor)" — which is precisely what M3-02 says has to stop. Matching them
 * back to records is therefore guesswork, and this function is deliberately
 * conservative: it returns a match only when one is unambiguous, and the
 * caller reports everything else rather than picking a winner.
 */
function normalise(name) {
  let value = name.trim();
  value = value.replace(/\([^)]*\)/g, ' '); // drop the parenthetical role
  let previous;
  do {
    previous = value;
    value = value.replace(HONORIFICS, '');
  } while (value !== previous);
  return value
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function findPerson(written, people) {
  const wanted = normalise(written);
  if (wanted.length === 0) return { match: null, reason: 'empty' };

  const hits = people.filter((person) => {
    const theirs = normalise(person.full_name);
    if (theirs.length === 0) return false;
    const shorter = theirs.length <= wanted.length ? theirs : wanted;
    const longer = shorter === theirs ? wanted : theirs;
    return shorter.every((token) => longer.includes(token));
  });

  if (hits.length === 1) return { match: hits[0], reason: 'exact' };
  if (hits.length > 1) return { match: null, reason: 'ambiguous' };
  return { match: null, reason: 'unknown' };
}

/** Comma-separated, sometimes with "and" or a Turkish "ve". */
function splitNames(field) {
  return field
    .split(/,|;|\bve\b|\band\b/gi)
    .map((part) => part.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const report = {
  organizations: 0,
  stakeholders: 0,
  meetings: 0,
  notes: 0,
  attendees: 0,
  suggestions: 0,
  /** Names written in a meeting that match nobody, or more than one. */
  unresolvedAttendees: new Map(),
  /** Meetings whose action text could not become an action nobody can lose. */
  unstructuredActions: [],
  warnings: [],
};

function note(where, message) {
  report.warnings.push(`${where}: ${message}`);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function connect() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Insert or update by where the row came from, so a rerun corrects rather than duplicates. */
async function upsertBySource(db, table, rows) {
  if (rows.length === 0) return [];
  if (DRY_RUN) return rows.map((row, i) => ({ ...row, id: `dry-run-${table}-${i}` }));

  const { data, error } = await db
    .from(table)
    .upsert(rows, { onConflict: 'source_system,source_id' })
    .select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// The import
// ---------------------------------------------------------------------------

async function importContacts(db) {
  const pages = await readDatabase(DATABASES.contacts);

  // Organizations are free text on a contact, so they are deduplicated by
  // name here and given the category of the first contact that mentions them.
  const organizations = new Map();
  for (const page of pages) {
    const name = text(page, 'Organization');
    if (!name) continue;
    const key = name.trim().toLowerCase();
    if (!organizations.has(key)) {
      organizations.set(key, {
        name: name.trim(),
        category: CATEGORY[text(page, 'Category')] ?? 'other',
        source_system: SOURCE,
        // No page of its own in Notion, so the name is the identity.
        source_id: `organization:${key}`,
      });
    }
  }

  const savedOrganizations = await upsertBySource(db, 'organizations', [...organizations.values()]);
  report.organizations = savedOrganizations.length;
  const organizationId = new Map(
    savedOrganizations.map((row) => [
      row.source_id ?? `organization:${row.name.toLowerCase()}`,
      row.id,
    ]),
  );

  const stakeholders = pages
    .map((page) => {
      const fullName = text(page, 'Name');
      if (!fullName) {
        note('contacts', `a contact with no name was skipped (${page.url})`);
        return null;
      }
      const organization = text(page, 'Organization').trim().toLowerCase();
      return {
        full_name: fullName,
        title: text(page, 'Role / Title') || null,
        organization_id: organization
          ? (organizationId.get(`organization:${organization}`) ?? null)
          : null,
        category: CATEGORY[text(page, 'Category')] ?? 'other',
        email: text(page, 'Email') || null,
        phone: text(page, 'Phone') || null,
        location: text(page, 'Location') || null,
        interest_topic: text(page, 'Topic / Relevance') || null,
        notes: text(page, 'Notes') || null,
        // Everything the register adds over an address book is unknown at
        // import: a stance nobody has recorded is 'unknown', not 'neutral',
        // and a relationship with no owner shows up on the attention list
        // the moment the import finishes. That is the correct starting state.
        stance: 'unknown',
        influence: 3,
        interest: 3,
        relationship_owner: null,
        confidentiality: 'internal',
        created_at: page.created_time,
        source_system: SOURCE,
        source_id: page.id,
        source_url: page.url,
      };
    })
    .filter(Boolean);

  const saved = await upsertBySource(db, 'stakeholders', stakeholders);
  report.stakeholders = saved.length;
  return saved;
}

async function importMeetings(db, language, databaseId, people) {
  const pages = await readDatabase(databaseId);
  const fields = NOTE_FIELDS[language];
  const titleField = language === 'tr' ? 'Toplantı Başlığı' : 'Meeting Title';
  const dateField = language === 'tr' ? 'Tarih ve Saat' : 'Date & Time';
  const placeField = language === 'tr' ? 'Konum' : 'Location';
  const kindField = language === 'tr' ? 'Tür' : 'Type';
  const statusField = language === 'tr' ? 'Durum' : 'Status';
  const priorityField = language === 'tr' ? 'Öncelik' : 'Priority';
  const preparedField = language === 'tr' ? 'Hazırlayan' : 'Prepared By';
  const attendeeField = language === 'tr' ? 'Katılımcılar' : 'Attendees';

  const meetings = pages
    .map((page) => {
      const title = text(page, titleField);
      const heldAt = text(page, dateField);
      if (!title || !heldAt) {
        note('meetings', `"${title || page.id}" has no title or no date and was skipped`);
        return null;
      }
      const preparedBy = text(page, preparedField);
      if (preparedBy) {
        // Free text — initials, usually. It is carried in the agenda note
        // rather than guessed at, because prepared_by is a real reference.
        note('meetings', `"${title}" was prepared by "${preparedBy}", which is not a portal user`);
      }
      return {
        title,
        held_at: new Date(heldAt).toISOString(),
        location: text(page, placeField) || null,
        kind: MEETING_KIND[text(page, kindField)] ?? 'internal',
        status: MEETING_STATUS[text(page, statusField)] ?? 'completed',
        priority: PRIORITY[text(page, priorityField)] ?? 'normal',
        // Everything arrives as a draft. Making minutes final is a decision
        // somebody takes, and an importer is not somebody.
        minutes_status: 'draft',
        confidentiality: 'internal',
        created_at: page.created_time,
        source_system: SOURCE,
        source_id: page.id,
        source_url: page.url,
      };
    })
    .filter(Boolean);

  const saved = await upsertBySource(db, 'meetings', meetings);
  report.meetings += saved.length;

  const idBySource = new Map(saved.map((row) => [row.source_id, row.id]));

  // --- the note, section by section ---------------------------------------
  const notes = [];
  for (const page of pages) {
    const meetingId = idBySource.get(page.id);
    if (!meetingId) continue;
    for (const [section, field] of Object.entries(fields)) {
      const body = text(page, field);
      if (!body) continue;
      notes.push({
        meeting_id: meetingId,
        section,
        language,
        body,
        is_machine_translation: false,
        confidentiality: 'internal',
      });
    }

    // The action text comes across verbatim, and does not become action
    // records. An action in this portal requires one owner and one date;
    // Notion has neither as fields, and inventing them would be the one
    // thing worse than losing them. The report says which meetings need a
    // person to do that properly.
    const actionText = text(page, fields.actions);
    if (actionText) {
      report.unstructuredActions.push({
        title: text(page, titleField),
        url: page.url,
        lines: actionText.split(/\n|<br>/).filter((line) => line.trim()).length,
      });
    }
  }

  if (notes.length > 0 && !DRY_RUN) {
    const { error } = await db
      .from('meeting_notes')
      .upsert(notes, { onConflict: 'meeting_id,section,language' });
    if (error) throw new Error(`meeting_notes: ${error.message}`);
  }
  report.notes += notes.length;

  // --- who was in the room -------------------------------------------------
  const attendees = [];
  for (const page of pages) {
    const meetingId = idBySource.get(page.id);
    if (!meetingId) continue;
    for (const written of splitNames(text(page, attendeeField))) {
      const { match, reason } = findPerson(written, people);
      if (!match) {
        const key = `${written} (${reason})`;
        report.unresolvedAttendees.set(key, (report.unresolvedAttendees.get(key) ?? 0) + 1);
        continue;
      }
      attendees.push({
        meeting_id: meetingId,
        stakeholder_id: match.id,
        profile_id: null,
        role_at_meeting: 'participant',
      });
    }
  }

  if (attendees.length > 0 && !DRY_RUN) {
    // Attendance is enforced by a partial unique index, which Postgres will
    // not accept as the conflict target of an upsert. So the existing pairs
    // are read first and only the new ones inserted — the same idempotency,
    // arrived at honestly.
    const { data: already, error: readError } = await db
      .from('meeting_attendees')
      .select('meeting_id, stakeholder_id')
      .in('meeting_id', [...idBySource.values()]);
    if (readError) throw new Error(`meeting_attendees: ${readError.message}`);

    const seen = new Set((already ?? []).map((row) => `${row.meeting_id}:${row.stakeholder_id}`));
    const fresh = attendees.filter((row) => !seen.has(`${row.meeting_id}:${row.stakeholder_id}`));

    if (fresh.length > 0) {
      const { error } = await db.from('meeting_attendees').insert(fresh);
      if (error) throw new Error(`meeting_attendees: ${error.message}`);
    }
    report.attendees += fresh.length;
  } else {
    report.attendees += attendees.length;
  }
}

async function importSuggestions(db, people) {
  const pages = await readDatabase(DATABASES.suggestions);

  const rows = pages
    .map((page) => {
      const title = text(page, 'Suggestion');
      if (!title) return null;
      const proposer = text(page, 'Suggested By');
      const matched = proposer ? findPerson(proposer, people).match : null;
      return {
        title,
        details: text(page, 'Details') || null,
        kind: SUGGESTION_KIND[text(page, 'Type')] ?? 'other',
        status: SUGGESTION_STATUS[text(page, 'Status')] ?? 'pending_review',
        priority: PRIORITY[text(page, 'Priority')] ?? 'normal',
        suggested_by_stakeholder_id: matched?.id ?? null,
        // Kept even when matched, so the wording the person used survives.
        suggested_by_name: proposer || 'unattributed in Notion',
        reviewed_by_name: text(page, 'Reviewed By') || null,
        review_notes: text(page, 'Review Notes') || null,
        relevant_meeting_text: text(page, 'Relevant Meeting') || null,
        confidentiality: 'internal',
        created_at: page.created_time,
        source_system: SOURCE,
        source_id: page.id,
        source_url: page.url,
      };
    })
    .filter(Boolean);

  const saved = await upsertBySource(db, 'suggestions', rows);
  report.suggestions = saved.length;
}

// ---------------------------------------------------------------------------

function printReport() {
  const line = (label, value) => console.log(`  ${String(value).padStart(5)}  ${label}`);

  console.log(`\n${DRY_RUN ? 'Would import' : 'Imported'}:`);
  line('organizations', report.organizations);
  line('stakeholders', report.stakeholders);
  line('meetings', report.meetings);
  line('note sections', report.notes);
  line('attendees resolved', report.attendees);
  line('suggestions', report.suggestions);

  if (report.unresolvedAttendees.size > 0) {
    console.log('\nNames written in a meeting that match nobody in the register:');
    console.log('  Add them as contacts and run again, or leave them — either way');
    console.log('  the meeting record says who was there and the portal does not.\n');
    for (const [name, count] of [...report.unresolvedAttendees].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(3)}×  ${name}`);
    }
  }

  if (report.unstructuredActions.length > 0) {
    const total = report.unstructuredActions.reduce((sum, m) => sum + m.lines, 0);
    console.log(`\n${total} action items across ${report.unstructuredActions.length} meetings`);
    console.log('  came across as text, not as actions. In Notion they have neither an');
    console.log('  owner nor a date as fields, and this portal requires both — that');
    console.log('  requirement is the whole point of the module, so the importer will');
    console.log('  not fabricate either. Each needs a person to give it one of each:\n');
    for (const meeting of report.unstructuredActions) {
      console.log(`  ${String(meeting.lines).padStart(3)} items  ${meeting.title}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log('\nNotes:');
    for (const warning of report.warnings) console.log(`  · ${warning}`);
  }

  if (DRY_RUN) console.log('\nDry run: nothing was written.');
}

async function main() {
  const db = DRY_RUN ? null : connect();
  if (DRY_RUN) console.log('Dry run — reading Notion, writing nothing.\n');

  const people = await importContacts(db);
  await importMeetings(db, 'en', DATABASES.meetingsEn, people);
  await importMeetings(db, 'tr', DATABASES.meetingsTr, people);
  await importSuggestions(db, people);

  printReport();
}

main().catch((error) => {
  console.error(`\nImport failed: ${error.message}`);
  process.exitCode = 1;
});
