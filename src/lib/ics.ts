/**
 * The calendar, as a file a calendar program will read (M3-16).
 *
 * The requirement says "Google/Outlook, .ics", and what is honest to build
 * without a server is the file. Three decisions carry the project's own rules
 * into a format that does not enforce them:
 *
 * 1. A DATE IS NOT A TIME. Most of this calendar is dates: an obligation falls
 *    due on the 25th, a filing deadline is a day. iCalendar has an all-day
 *    form for exactly this, and the alternative — picking 09:00 because a
 *    calendar grid wants a row — would put a time in somebody's diary that
 *    nobody ever set.
 *
 * 2. A HEARING HAS NO RECORDED END. The register stores when a hearing starts
 *    and says nothing about how long it runs, so the event carries DTSTART and
 *    no DTEND. A default hour would be an invention, and the description says
 *    the record gives no end rather than leaving the reader to assume one.
 *
 * 3. THE FILE LEAVES THE PORTAL'S ACCESS CONTROL BEHIND. Everything else in
 *    this system is read under row level security; an .ics on a laptop, synced
 *    to a phone, is read by whoever holds the laptop. So the caller chooses
 *    whether confidential and restricted matters go into it, the choice
 *    defaults to no, and CLASS carries the tier for the clients that honour it.
 *
 * Folding and escaping are RFC 5545's, not approximations of it: a line over
 * 75 octets that is not folded, or a comma that is not escaped, produces a
 * file that imports silently wrong.
 */
import type { CalendarEntry, Confidentiality } from '../types';

/** RFC 5545 §3.1: lines are folded at 75 octets, continuations begin with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  // Fold on characters rather than bytes so a multi-byte character is never
  // split in half — Turkish text is full of them.
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

/** RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  // RFC 5545: backslash first, or the escapes it adds get escaped again.
  return value
    .split('\\')
    .join('\\\\')
    .split(';')
    .join('\\;')
    .split(',')
    .join('\\,')
    .replace(/\r?\n/g, '\\n');
}

function stampUtc(iso: string): string {
  return `${iso.slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/** An all-day event ends the day after it starts, per §3.6.1. */
function dayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

const CLASS: Record<Confidentiality, string> = {
  public: 'PUBLIC',
  internal: 'PUBLIC',
  confidential: 'CONFIDENTIAL',
  restricted: 'PRIVATE',
};

const KIND_WORD: Record<string, { en: string; tr: string }> = {
  hearing: { en: 'Hearing', tr: 'Duruşma' },
  filing: { en: 'Filing deadline', tr: 'Layiha süresi' },
  obligation: { en: 'Obligation', tr: 'Yükümlülük' },
  action: { en: 'Action', tr: 'Aksiyon' },
  question: { en: 'Open question', tr: 'Açık soru' },
  meeting: { en: 'Meeting', tr: 'Toplantı' },
};

export interface IcsOptions {
  language: 'tr' | 'en';
  /** Whether confidential and restricted matters go into the file. */
  includeClosed: boolean;
  /** Fixed in tests; the current moment otherwise. */
  now?: string;
}

export interface IcsResult {
  text: string;
  /** How many entries went in. */
  events: number;
  /** How many were left out because they are not for a file, and why. */
  withheld: number;
  /** How many carry a date with no time, and are therefore all-day. */
  allDay: number;
}

const OPEN_TIERS: Confidentiality[] = ['public', 'internal'];

export function toIcs(entries: CalendarEntry[], options: IcsOptions): IcsResult {
  const tr = options.language === 'tr';
  const now = stampUtc(options.now ?? new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AUTK//MIU Portal//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(tr ? 'MIU proje takvimi' : 'MIU project calendar')}`,
  ];

  let events = 0;
  let withheld = 0;
  let allDay = 0;

  for (const entry of entries) {
    if (!options.includeClosed && !OPEN_TIERS.includes(entry.confidentiality)) {
      withheld += 1;
      continue;
    }

    const kind = KIND_WORD[entry.kind];
    const label = (tr ? entry.titleTr : entry.titleEn) ?? entry.titleEn ?? entry.titleTr ?? '';
    const prefix = kind ? (tr ? kind.tr : kind.en) : entry.kind;
    const summary = label ? `${prefix}: ${label}` : prefix;

    const notes: string[] = [];
    if (entry.detail) notes.push(entry.detail.replace(/_/g, ' '));
    if (entry.state) notes.push(entry.state.replace(/_/g, ' '));

    // The dates are decided before anything is written, so a record with no
    // date needs nothing unwound.
    const when: string[] = [];
    if (entry.dueAt) {
      when.push(`DTSTART:${stampUtc(entry.dueAt)}`);
      // No DTEND. The register records when a hearing starts and nothing
      // about how long it runs, and an invented hour in somebody's diary is
      // worse than an instant they can read the record about.
      notes.push(
        tr
          ? 'Kayıtta bitiş saati yok — bu etkinliğin süresi portalda tutulmuyor.'
          : 'The record gives no end time; this event carries only its start.',
      );
    } else if (entry.dueOn) {
      when.push(`DTSTART;VALUE=DATE:${entry.dueOn.replace(/-/g, '')}`);
      when.push(`DTEND;VALUE=DATE:${dayAfter(entry.dueOn)}`);
      allDay += 1;
    } else {
      // A record with no date is not an event.
      withheld += 1;
      continue;
    }

    lines.push('BEGIN:VEVENT');
    // Stable, so re-importing updates an event rather than adding a second.
    lines.push(`UID:${entry.kind}-${entry.id}@miu-kenya.web.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(...when);

    lines.push(fold(`SUMMARY:${escapeText(summary)}`));
    if (notes.length > 0) lines.push(fold(`DESCRIPTION:${escapeText(notes.join(' · '))}`));
    lines.push(`CLASS:${CLASS[entry.confidentiality]}`);
    if (entry.needsAttention) lines.push('PRIORITY:1');
    lines.push('END:VEVENT');
    events += 1;
  }

  lines.push('END:VCALENDAR');
  return { text: `${lines.join('\r\n')}\r\n`, events, withheld, allDay };
}
