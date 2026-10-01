/**
 * The stakeholder register, out to a phone or a spreadsheet and back (M4-15).
 *
 * The decision that shapes this file is about what must NOT leave. The
 * register holds two different kinds of fact about a person:
 *
 *   contact        — name, title, organisation, email, telephone, location
 *   an assessment  — their stance, their influence, our interest, our notes
 *
 * The second is the trust's political reading of that person. A vCard goes
 * into an address book that syncs to a phone, to Google Contacts, and is
 * forwarded without a thought; "stance: opponent, influence 5" reaching the
 * person it describes is a different class of harm from a leaked phone
 * number. So the vCard carries contact facts only, with no option to add the
 * rest, and the CSV — which exists to be worked on in a spreadsheet — asks
 * explicitly and says what it is asking about.
 *
 * On the way back in, two of the register's defaults become visible. `stance`
 * defaults to 'unknown', which is right: an unexamined relationship is not a
 * neutral one. But `influence` and `interest` default to 3, so a row that says
 * nothing about them lands in the middle of the grid with a number nobody
 * chose — and the preview counts those rows and says so, because forty
 * contacts quietly claiming "influence 3" would shape a map of the project
 * that no one drew.
 */
import type { Stakeholder, StakeholderCategory } from '../types';

// ---------------------------------------------------------------------------
// vCard
// ---------------------------------------------------------------------------

/** vCard and iCalendar share §3.1 folding: 75 octets, continuation by space. */
function fold(line: string): string {
  if (new TextEncoder().encode(line).length <= 75) return line;
  const out: string[] = [];
  let width = 0;
  let chunk = '';
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    const limit = out.length === 0 ? 75 : 74;
    if (width + size > limit) {
      out.push(chunk);
      chunk = char;
      width = size;
    } else {
      chunk += char;
      width += size;
    }
  }
  if (chunk !== '') out.push(chunk);
  return out.join('\r\n ');
}

function escapeText(value: string): string {
  return value
    .split('\\')
    .join('\\\\')
    .split(';')
    .join('\\;')
    .split(',')
    .join('\\,')
    .replace(/\r?\n/g, '\\n');
}

export interface ExportOptions {
  /** Whether confidential and restricted records go into the file. */
  includeClosed: boolean;
}

export interface ExportResult {
  text: string;
  written: number;
  withheld: number;
}

const OPEN = ['public', 'internal'];

const forFile = (people: Stakeholder[], options: ExportOptions) => {
  const taken = people.filter((p) => options.includeClosed || OPEN.includes(p.confidentiality));
  return { taken, withheld: people.length - taken.length };
};

export function toVCard(people: Stakeholder[], options: ExportOptions): ExportResult {
  const { taken, withheld } = forFile(people, options);
  const cards: string[] = [];

  for (const person of taken) {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    lines.push(fold(`FN:${escapeText(person.fullName)}`));
    // The register keeps one name field, and splitting a Kenyan or Turkish
    // name into given and family parts is a guess — "Mr. Tariq Shahbal" and
    // "Mme. Frida" do not split the same way. So the structured property
    // carries the whole name rather than a guess at its halves, and FN above
    // is what every reader actually displays.
    lines.push(fold(`N:${escapeText(person.fullName)};;;;`));
    if (person.organizationName) lines.push(fold(`ORG:${escapeText(person.organizationName)}`));
    if (person.title) lines.push(fold(`TITLE:${escapeText(person.title)}`));
    if (person.email) lines.push(fold(`EMAIL;TYPE=INTERNET:${escapeText(person.email)}`));
    if (person.phone) lines.push(fold(`TEL;TYPE=VOICE:${escapeText(person.phone)}`));
    if (person.whatsapp && person.whatsapp !== person.phone) {
      lines.push(fold(`TEL;TYPE=CELL:${escapeText(person.whatsapp)}`));
    }
    if (person.location) lines.push(fold(`ADR;TYPE=WORK:;;${escapeText(person.location)};;;;`));
    // Deliberately no NOTE, no X- property for stance, influence or interest.
    // Those are the trust's reading of this person and they stay in the portal.
    lines.push(`UID:stakeholder-${person.id}@miu-kenya.web.app`);
    lines.push('END:VCARD');
    cards.push(lines.join('\r\n'));
  }

  return {
    text: cards.length === 0 ? '' : `${cards.join('\r\n')}\r\n`,
    written: taken.length,
    withheld,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CONTACT_COLUMNS = [
  'full_name',
  'title',
  'organization',
  'category',
  'email',
  'phone',
  'whatsapp',
  'location',
  'preferred_language',
  'interest_topic',
] as const;

const ASSESSMENT_COLUMNS = ['stance', 'influence', 'interest', 'notes'] as const;

/** RFC 4180: quote when the value holds a comma, a quote or a line break. */
function csvCell(value: string | number | null): string {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export interface CsvOptions extends ExportOptions {
  /**
   * Whether the trust's reading of each person — stance, influence, interest,
   * notes — goes into the file. Off by default, and the screen says what it is.
   */
  includeAssessment: boolean;
}

export function toCsv(people: Stakeholder[], options: CsvOptions): ExportResult {
  const { taken, withheld } = forFile(people, options);
  const columns: string[] = [
    ...CONTACT_COLUMNS,
    ...(options.includeAssessment ? ASSESSMENT_COLUMNS : []),
  ];

  const rows = [columns.join(',')];
  for (const p of taken) {
    const cells: (string | number | null)[] = [
      p.fullName,
      p.title,
      p.organizationName,
      p.category,
      p.email,
      p.phone,
      p.whatsapp,
      p.location,
      p.preferredLanguage,
      p.interestTopic,
    ];
    if (options.includeAssessment) cells.push(p.stance, p.influence, p.interest, p.notes);
    rows.push(cells.map(csvCell).join(','));
  }

  // A byte-order mark, so Excel opens Turkish text as Turkish rather than as
  // mojibake. Stripped again on the way back in.
  return { text: `\uFEFF${rows.join('\r\n')}\r\n`, written: taken.length, withheld };
}

// ---------------------------------------------------------------------------
// Reading one back
// ---------------------------------------------------------------------------

/** A minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
export function splitCsv(text: string): string[][] {
  const body = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const CATEGORIES: StakeholderCategory[] = [
  'government',
  'judiciary',
  'partner_trust',
  'legal',
  'contractor',
  'academia',
  'ngo',
  'community_leader',
  'media',
  'donor',
  'opposing_party',
  'other',
];

export interface IncomingContact {
  line: number;
  fullName: string;
  title: string | null;
  category: StakeholderCategory;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  preferredLanguage: string | null;
  interestTopic: string | null;
  /** What the file did not say, and what the register will therefore record. */
  takesDefaultCategory: boolean;
  takesDefaultGrid: boolean;
  /** Set when a person already in the register looks like this one. */
  matches: { id: string; fullName: string; on: 'email' | 'name' }[];
}

export interface Refusal {
  line: number;
  reason: string;
}

export interface ParsedContacts {
  contacts: IncomingContact[];
  refused: Refusal[];
  /** Columns in the file that this portal has no field for. */
  ignoredColumns: string[];
}

/**
 * Reads a CSV into contacts, and reports rather than repairs.
 *
 * Nothing here writes. The point of returning both lists is that somebody
 * sees what a file is about to do before it does it — the lesson of the Notion
 * migration, where the dry run changed three decisions.
 */
export function parseContacts(text: string, existing: Stakeholder[]): ParsedContacts {
  const rows = splitCsv(text);
  const refused: Refusal[] = [];
  if (rows.length === 0) {
    return {
      contacts: [],
      refused: [{ line: 0, reason: 'the file holds no rows' }],
      ignoredColumns: [],
    };
  }

  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const known = [...CONTACT_COLUMNS, ...ASSESSMENT_COLUMNS] as readonly string[];
  const ignoredColumns = header.filter((h) => h !== '' && !known.includes(h));
  const at = (row: string[], column: string): string => {
    const index = header.indexOf(column);
    return index === -1 ? '' : (row[index] ?? '').trim();
  };

  if (!header.includes('full_name')) {
    return {
      contacts: [],
      refused: [{ line: 1, reason: 'no full_name column — a contact without a name is not one' }],
      ignoredColumns,
    };
  }

  const byEmail = new Map<string, Stakeholder>();
  const byName = new Map<string, Stakeholder>();
  for (const person of existing) {
    if (person.email) byEmail.set(person.email.trim().toLowerCase(), person);
    byName.set(person.fullName.trim().toLowerCase(), person);
  }

  const contacts: IncomingContact[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const line = i + 1;
    const fullName = at(row, 'full_name');
    if (fullName === '') {
      refused.push({ line, reason: 'no name' });
      continue;
    }
    const key = fullName.toLowerCase();
    if (seen.has(key)) {
      refused.push({ line, reason: `the file already has a row for ${fullName}` });
      continue;
    }
    seen.add(key);

    const rawCategory = at(row, 'category').toLowerCase();
    const category = (CATEGORIES as string[]).includes(rawCategory)
      ? (rawCategory as StakeholderCategory)
      : 'other';
    if (rawCategory !== '' && category === 'other' && rawCategory !== 'other') {
      refused.push({ line, reason: `"${rawCategory}" is not a category this register has` });
      continue;
    }

    const email = at(row, 'email') || null;
    const matches: IncomingContact['matches'] = [];
    const onEmail = email ? byEmail.get(email.toLowerCase()) : undefined;
    if (onEmail) matches.push({ id: onEmail.id, fullName: onEmail.fullName, on: 'email' });
    const onName = byName.get(key);
    if (onName && onName.id !== onEmail?.id) {
      matches.push({ id: onName.id, fullName: onName.fullName, on: 'name' });
    }

    contacts.push({
      line,
      fullName,
      title: at(row, 'title') || null,
      category,
      email,
      phone: at(row, 'phone') || null,
      whatsapp: at(row, 'whatsapp') || null,
      location: at(row, 'location') || null,
      preferredLanguage: at(row, 'preferred_language') || null,
      interestTopic: at(row, 'interest_topic') || null,
      takesDefaultCategory: rawCategory === '',
      // The register's influence and interest are NOT NULL with a default of 3.
      // A file that says nothing about them does not leave them unknown — it
      // puts the person in the middle of the grid, which is a position nobody
      // assessed.
      takesDefaultGrid: at(row, 'influence') === '' && at(row, 'interest') === '',
      matches,
    });
  }

  return { contacts, refused, ignoredColumns };
}
