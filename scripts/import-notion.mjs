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
 * Usage, reading Notion over its own API:
 *   NOTION_TOKEN=secret_… \
 *   SUPABASE_URL=https://….supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   npm run import:notion -- --dry-run
 *
 * Usage, reading a snapshot taken some other way (a connector, an export):
 *   SUPABASE_ACCESS_TOKEN=sbp_… \
 *   npm run import:notion -- --source snapshot.json --project <ref> --dry-run
 *
 * The second form exists because Notion access does not always come as an
 * integration token. The snapshot carries the pages AND the decisions that
 * cannot be derived from them — which Turkish page is which English page,
 * how confidential each meeting is, which written names are the same person.
 * Those are judgements somebody made; keeping them in the snapshot rather
 * than in this file is also what keeps names and assessments out of git.
 *
 * --dry-run reads everything, resolves everything, prints exactly what it
 * would write and what it could not, and touches nothing. Run it first. The
 * report it prints is the thing to read: what this import cannot do is more
 * interesting than what it can.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};

const DRY_RUN = argv.includes('--dry-run');
const SOURCE = 'notion';

/** A snapshot taken outside this script, if one was given. */
const SNAPSHOT = (() => {
  const path = flag('source');
  if (!path) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
})();

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

/**
 * Every page in a database, following the cursor — or out of the snapshot.
 *
 * A snapshot page carries its properties already flattened to strings under
 * `plain`, because whatever read it has already done the work of turning a
 * Notion property into text. text() below understands both shapes.
 */
async function readDatabase(id, snapshotKey) {
  if (SNAPSHOT) {
    return SNAPSHOT.databases?.[snapshotKey] ?? [];
  }

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
  // A snapshot page is already flat. The <br> Notion writes into a multi-line
  // text property is turned back into a newline here, so an action list reads
  // as a list rather than as one long line with markup in it.
  if (page.plain) return (page.plain[name] ?? '').replace(/<br\s*\/?>/gi, '\n').trim();

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
  // Titles as well as honorifics, in both languages, because a minute writes
  // "Mr. Minister Mawiale" one week and "Bakan Mawiale" the next, and those
  // are one person. Stripping the title is what makes them one key.
  /^(mr|mrs|ms|miss|mme|mlle|dr|prof|h\.?e|hon|sir|sn|sayın|bay|bayan|av|avukat|adv|eng|mühendis|bakan|başkan|chairman|minister|lawyer|senator|senatör)\.?\s+/i;

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
  /** Meetings assembled from an English and a Turkish minute of the same meeting. */
  paired: 0,
  /** People the register was derived from, when there was no contact list. */
  derivedPeople: [],
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

/**
 * Two ways to write, because two kinds of credential exist.
 *
 * The service role key is the ordinary one. The Management API is the other:
 * it runs statements as the project owner, which on Supabase carries
 * BYPASSRLS, so an import reaches tables whose policies are written for
 * people rather than for importers. It is used when a personal access token
 * is what is to hand — the same token the migrations are applied with.
 *
 * Both expose the same two calls, so nothing below this point knows which
 * one it is talking to.
 */
function connect() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const db = createClient(url, key, { auth: { persistSession: false } });
    return {
      kind: 'service-role',
      upsert: (table, rows, conflict) => supabaseUpsert(db, table, rows, conflict),
      read: async (table, columns, where) => {
        let query = db.from(table).select(columns);
        if (where) query = query.in(where.column, where.values);
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        return data ?? [];
      },
    };
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const project = flag('project');
  if (token && project) return managementWriter(token, project);

  throw new Error(
    'Give it either SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, ' +
      'or SUPABASE_ACCESS_TOKEN + --project <ref>.',
  );
}

async function supabaseUpsert(db, table, rows, conflict) {
  const { data, error } = await db.from(table).upsert(rows, { onConflict: conflict }).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

/** A SQL literal. Everything here is somebody's words, so nothing is interpolated raw. */
function literal(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function managementWriter(token, project) {
  const run = async (sql) => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`management api: ${response.status} ${body}`);
    return JSON.parse(body);
  };

  return {
    kind: 'management-api',
    run,
    upsert: async (table, rows, conflict) => {
      if (rows.length === 0) return [];
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const values = rows
        .map((row) => `(${columns.map((c) => literal(row[c] ?? null)).join(', ')})`)
        .join(',\n    ');
      const updates = columns
        .filter((c) => !conflict.split(',').includes(c))
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');
      const sql =
        `insert into ${table} (${columns.join(', ')}) values\n    ${values}\n` +
        `on conflict (${conflict}) do update set ${updates}\n` +
        `returning *;`;
      return run(sql);
    },
    read: async (table, columns, where) => {
      const filter = where
        ? ` where ${where.column} in (${where.values.map(literal).join(', ')})`
        : '';
      return run(`select ${columns} from ${table}${filter};`);
    },
  };
}

/** Insert or update by where the row came from, so a rerun corrects rather than duplicates. */
async function upsertBySource(db, table, rows) {
  if (rows.length === 0) return [];
  if (DRY_RUN) return rows.map((row, i) => ({ ...row, id: `dry-run-${table}-${i}` }));
  return db.upsert(table, rows, 'source_system,source_id');
}

// ---------------------------------------------------------------------------
// The import
// ---------------------------------------------------------------------------

async function importContacts(db) {
  const pages = await readDatabase(DATABASES.contacts, 'contacts');

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

// ---------------------------------------------------------------------------
// People, when there is no contact register to read
// ---------------------------------------------------------------------------

/**
 * Derives the stakeholder register from who was in the room.
 *
 * The Meeting Hub's Contacts database is empty, so there is nothing to match
 * attendees against — which would have meant importing 22 meetings and
 * recording, for every one of them, that the portal does not know who
 * attended. The names are right there in the attendee field; this builds the
 * register from them instead.
 *
 * What it will NOT do is decide that two spellings are one person. "Mr.
 * Khamisi", "Mr. Hamisi" and "Mr. Lawyer Hamis" may be three people or one,
 * and only somebody who was there knows. The snapshot carries that judgement
 * as an alias map; without one, each spelling becomes its own record and the
 * report says so. Merging two people wrongly is worse than listing one twice,
 * because the second is visible and the first is not.
 */
function derivePeople(pages, attendeeField, aliases) {
  const canonical = new Map(
    Object.entries(aliases ?? {}).map(([written, real]) => [written.toLocaleLowerCase('tr'), real]),
  );

  const people = new Map();
  for (const page of pages) {
    for (const written of splitNames(text(page, attendeeField))) {
      const tokens = normalise(written);
      if (tokens.length === 0) continue;
      const key = tokens.join(' ');
      const name = canonical.get(key) ?? canonical.get(written.toLocaleLowerCase('tr')) ?? written;
      const identity = normalise(name).join(' ');
      if (!identity) continue;

      const existing = people.get(identity);
      if (existing) {
        existing.seen += 1;
        // The parenthetical a name was first written with is the only title
        // anybody recorded: "Mr. Musaib (First Advisor to Mombasa Governor)".
        if (!existing.title) existing.title = roleInBrackets(written);
        continue;
      }
      people.set(identity, {
        full_name: name.replace(/\s*\([^)]*\)\s*/g, ' ').trim(),
        title: roleInBrackets(written),
        seen: 1,
      });
    }
  }
  return people;
}

/** "Mr. Musaib (First Advisor to Mombasa Governor)" → the part in brackets. */
function roleInBrackets(written) {
  const match = written.match(/\(([^)]+)\)/);
  if (!match) return null;
  const inside = match[1].trim();
  // A bracket holding another spelling of the same name is not a title.
  return normalise(inside).length <= 2 && /^(dr|mr|mrs|mme|ms)\b/i.test(inside) ? null : inside;
}

async function importPeopleFromMeetings(db, pageSets, aliases) {
  const found = new Map();
  for (const { pages, attendeeField } of pageSets) {
    for (const [identity, person] of derivePeople(pages, attendeeField, aliases)) {
      const existing = found.get(identity);
      if (existing) {
        existing.seen += person.seen;
        if (!existing.title) existing.title = person.title;
      } else {
        found.set(identity, { ...person });
      }
    }
  }

  const rows = [...found.entries()].map(([identity, person]) => ({
    full_name: person.full_name,
    title: person.title,
    category: 'other',
    // Nothing else is known, and the register says so rather than guessing.
    // Every one of these appears on the attention list as having no
    // relationship owner the moment the import finishes — which is the first
    // piece of work the migration creates, not a defect in it.
    stance: 'unknown',
    influence: 3,
    interest: 3,
    relationship_owner: null,
    notes: `Recorded from the attendee list of ${person.seen} meeting${person.seen === 1 ? '' : 's'} in the Notion Meeting Hub. Category, stance and influence are not known and have not been guessed.`,
    confidentiality: 'internal',
    source_system: SOURCE,
    // No page of their own in Notion: the normalised name is the identity.
    source_id: `attendee:${identity}`,
  }));

  const saved = await upsertBySource(db, 'stakeholders', rows);
  report.stakeholders += saved.length;
  report.derivedPeople = rows.map((row) => row.full_name).sort();
  return saved;
}

/** The property names, per language, in one place. */
const MEETING_FIELDS = {
  en: {
    title: 'Meeting Title',
    date: 'Date & Time',
    place: 'Location',
    kind: 'Type',
    status: 'Status',
    priority: 'Priority',
    prepared: 'Prepared By',
    attendees: 'Attendees',
  },
  tr: {
    title: 'Toplantı Başlığı',
    date: 'Tarih ve Saat',
    place: 'Konum',
    kind: 'Tür',
    status: 'Durum',
    priority: 'Öncelik',
    prepared: 'Hazırlayan',
    attendees: 'Katılımcılar',
  },
};

/**
 * The two meeting databases hold the SAME meetings, written twice.
 *
 * This is the finding that changed the shape of the import. Notion has a
 * "📋 Meetings" database and a "📋 Toplantılar (Türkçe)" one, and they are not
 * two sets of meetings: they are 22 meetings minuted in English and the same
 * 22 minuted in Turkish. Imported as the script originally read them — two
 * databases, two source ids, two sets of rows — the portal would have held 44
 * meetings, every one of them duplicated, and no later correction would be
 * able to tell which was which.
 *
 * They cannot be paired automatically either. Three pairs disagree about the
 * date or the hour, and two different meetings share one timestamp, so
 * matching on time produces both misses and wrong hits. The pairing is a
 * judgement; the snapshot carries it, and anything the snapshot does not pair
 * is imported on its own rather than guessed at.
 *
 * Merging is per field, not per language, because the two sides are not
 * copies: the Turkish minute of the Abbas Esmail meeting carries the fee he
 * quoted — 100,000 USD for a ten-page appeal — and the English one has no
 * notes at all. Picking a "primary language" would have lost that number.
 */
async function importMeetings(db, pagesEn, pagesTr, people) {
  const pairs = new Map((SNAPSHOT?.pairs ?? []).map(([en, tr]) => [en, tr]));
  const trById = new Map(pagesTr.map((page) => [page.id, page]));
  const pairedTr = new Set(pairs.values());

  const confidentiality = SNAPSHOT?.confidentiality ?? {};

  /** One meeting, from one or both of its two minutes. */
  const assemble = (primary, primaryLang, secondary, secondaryLang) => {
    const pf = MEETING_FIELDS[primaryLang];
    const sf = secondary ? MEETING_FIELDS[secondaryLang] : null;

    const pick = (key) => text(primary, pf[key]) || (sf ? text(secondary, sf[key]) : '');

    const title = text(primary, pf.title);
    const heldAt = pick('date');
    if (!title || !heldAt) {
      note('meetings', `"${title || primary.id}" has no title or no date and was skipped`);
      return null;
    }

    const preparedBy = pick('prepared');
    if (preparedBy) {
      // Free text — initials, usually. prepared_by is a real reference to a
      // portal user, so it is left null and the fact recorded here instead.
      note('meetings', `"${title}" was prepared by "${preparedBy}", which is not a portal user`);
    }

    return {
      title,
      title_tr:
        secondary && secondaryLang === 'tr'
          ? text(secondary, MEETING_FIELDS.tr.title) || null
          : primaryLang === 'tr'
            ? title
            : null,
      held_at: new Date(heldAt).toISOString(),
      location: pick('place') || null,
      kind: MEETING_KIND[pick('kind')] ?? 'internal',
      status: MEETING_STATUS[pick('status')] ?? 'completed',
      priority: PRIORITY[pick('priority')] ?? 'normal',
      // Everything arrives as a draft. Making minutes final is a decision
      // somebody takes, and an importer is not somebody.
      minutes_status: 'draft',
      // Not a blanket 'internal'. These minutes carry assessments of serving
      // officials, a judge's reputation, and what the trust would accept to
      // walk away; the snapshot says which are restricted and the default
      // below is the cautious one rather than the open one.
      confidentiality: confidentiality[primary.id] ?? 'confidential',
      // Only when the source recorded one. Passing null would violate the
      // column's own NOT NULL and lose the default, which is now().
      ...(primary.created_time ? { created_at: primary.created_time } : {}),
      source_system: SOURCE,
      source_id: primary.id,
      source_url: primary.url,
    };
  };

  const assembled = [];
  for (const page of pagesEn) {
    const partner = pairs.has(page.id) ? (trById.get(pairs.get(page.id)) ?? null) : null;
    if (pairs.has(page.id) && !partner) {
      note(
        'meetings',
        `"${text(page, MEETING_FIELDS.en.title)}" is paired with a Turkish page that is not in the snapshot`,
      );
    }
    const row = assemble(page, 'en', partner, 'tr');
    if (row) assembled.push({ row, en: page, tr: partner });
  }

  // A Turkish minute nobody paired is a meeting in its own right, not a
  // translation that lost its partner — so it is imported rather than dropped.
  for (const page of pagesTr) {
    if (pairedTr.has(page.id)) continue;
    note(
      'meetings',
      `"${text(page, MEETING_FIELDS.tr.title)}" has no English counterpart and was imported on its own`,
    );
    const row = assemble(page, 'tr', null, null);
    if (row) assembled.push({ row, en: null, tr: page });
  }

  const saved = await upsertBySource(
    db,
    'meetings',
    assembled.map((item) => item.row),
  );
  report.meetings += saved.length;
  report.paired = assembled.filter((item) => item.en && item.tr).length;

  const idBySource = new Map(saved.map((row) => [row.source_id, row.id]));

  // --- the note, section by section ---------------------------------------
  const notes = [];
  for (const { row, en, tr } of assembled) {
    const meetingId = idBySource.get(row.source_id);
    if (!meetingId) continue;

    for (const [page, language] of [
      [en, 'en'],
      [tr, 'tr'],
    ]) {
      if (!page) continue;
      for (const [section, field] of Object.entries(NOTE_FIELDS[language])) {
        const body = text(page, field);
        if (!body) continue;
        notes.push({
          meeting_id: meetingId,
          section,
          language,
          body,
          is_machine_translation: false,
          confidentiality: row.confidentiality,
        });
      }

      // The action text comes across verbatim, and does not become action
      // records. An action in this portal requires one owner and one date;
      // Notion has neither as fields, and inventing them would be the one
      // thing worse than losing them. The report says which meetings need a
      // person to do that properly.
      if (language === 'en' || !en) {
        const actionText = text(page, NOTE_FIELDS[language].actions);
        if (actionText) {
          report.unstructuredActions.push({
            title: row.title,
            url: page.url,
            lines: actionText.split(/\n|<br>/).filter((line) => line.trim()).length,
          });
        }
      }
    }
  }

  if (notes.length > 0 && !DRY_RUN) {
    await db.upsert('meeting_notes', notes, 'meeting_id,section,language');
  }
  report.notes += notes.length;

  // --- who was in the room -------------------------------------------------
  const attendees = [];
  const seenPair = new Set();
  for (const { row, en, tr } of assembled) {
    const meetingId = idBySource.get(row.source_id);
    if (!meetingId) continue;
    const written = [
      ...(en ? splitNames(text(en, MEETING_FIELDS.en.attendees)) : []),
      ...(tr ? splitNames(text(tr, MEETING_FIELDS.tr.attendees)) : []),
    ];
    for (const name of written) {
      const { match, reason } = findPerson(resolveAlias(name), people);
      if (!match) {
        const key = `${name} (${reason})`;
        report.unresolvedAttendees.set(key, (report.unresolvedAttendees.get(key) ?? 0) + 1);
        continue;
      }
      // The same person is named in both minutes of the same meeting; they
      // were in the room once.
      const pair = `${meetingId}:${match.id}`;
      if (seenPair.has(pair)) continue;
      seenPair.add(pair);
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
    const already = await db.read('meeting_attendees', 'meeting_id, stakeholder_id', {
      column: 'meeting_id',
      values: [...idBySource.values()],
    });

    const seen = new Set(already.map((r) => `${r.meeting_id}:${r.stakeholder_id}`));
    const fresh = attendees.filter((r) => !seen.has(`${r.meeting_id}:${r.stakeholder_id}`));

    if (fresh.length > 0) await db.upsert('meeting_attendees', fresh, 'id');
    report.attendees += fresh.length;
  } else {
    report.attendees += attendees.length;
  }
}

/** The snapshot's judgement about which written names are the same person. */
function resolveAlias(written) {
  const aliases = SNAPSHOT?.aliases ?? {};
  const key = normalise(written).join(' ');
  return aliases[key] ?? aliases[written.toLocaleLowerCase('tr')] ?? written;
}

async function importSuggestions(db, people) {
  const pages = await readDatabase(DATABASES.suggestions, 'suggestions');

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
  line('of those, assembled from an English and a Turkish minute', report.paired);
  line('note sections', report.notes);
  line('attendees resolved', report.attendees);
  line('suggestions', report.suggestions);

  if (report.derivedPeople.length > 0) {
    console.log('\nThe register was built from attendee lists, because Notion had no');
    console.log('contacts. Every one of these starts with no owner, no stance and no');
    console.log('category — which is the first work the migration creates:\n');
    for (const name of report.derivedPeople) console.log(`  · ${name}`);
  }

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
  if (DRY_RUN) {
    console.log(`Dry run — reading ${SNAPSHOT ? 'the snapshot' : 'Notion'}, writing nothing.\n`);
  } else {
    console.log(`Writing through the ${db.kind}.\n`);
  }

  const pagesEn = await readDatabase(DATABASES.meetingsEn, 'meetingsEn');
  const pagesTr = await readDatabase(DATABASES.meetingsTr, 'meetingsTr');

  // The contact register first, if there is one. When it is empty — which it
  // is — the people come from who was in the room instead, because importing
  // 22 meetings and recording for each that the portal does not know who
  // attended is not a migration, it is a list of titles.
  let people = await importContacts(db);
  if (people.length === 0) {
    note(
      'contacts',
      'the Notion contact register is empty; the people were derived from attendee lists',
    );
    people = await importPeopleFromMeetings(
      db,
      [
        { pages: pagesEn, attendeeField: MEETING_FIELDS.en.attendees },
        { pages: pagesTr, attendeeField: MEETING_FIELDS.tr.attendees },
      ],
      SNAPSHOT?.aliases,
    );
  }

  await importMeetings(db, pagesEn, pagesTr, people);
  await importSuggestions(db, people);

  printReport();
}

main().catch((error) => {
  console.error(`\nImport failed: ${error.message}`);
  process.exitCode = 1;
});
