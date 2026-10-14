/**
 * Turning a search hit into something a person can click (M13-05).
 *
 * The database deliberately keeps no routes: `searchable` returns a `kind`
 * and the ids, and where that lives in this application is this
 * application's business. The mapping is here rather than inside the modal so
 * the result list and the assistant's citations agree about where a record
 * is.
 */
import {
  Banknote,
  Building2,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  FileSignature,
  FileText,
  Gavel,
  HardHat,
  Landmark,
  ListChecks,
  MessageSquareQuote,
  ScrollText,
  Scale,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { SearchKind } from '../types';

interface KindShape {
  tr: string;
  en: string;
  icon: React.ElementType;
  /** The screen the record lives on. */
  base: string;
  /** True when the parent's id is what names the screen, not the row's own. */
  viaParent?: boolean;
}

const SHAPE: Record<SearchKind, KindShape> = {
  legal_case: { tr: 'Dava', en: 'Case', icon: Scale, base: '/legal' },
  legal_order: { tr: 'Mahkeme kararı', en: 'Court order', icon: Gavel, base: '/legal' },
  legal_opinion: {
    tr: 'Hukukî görüş',
    en: 'Legal opinion',
    icon: MessageSquareQuote,
    base: '/legal',
  },
  hearing: { tr: 'Duruşma', en: 'Hearing', icon: Landmark, base: '/legal' },
  filing: { tr: 'Dosyalama', en: 'Filing', icon: FileSignature, base: '/legal' },
  document: { tr: 'Belge', en: 'Document', icon: FileText, base: '/documents' },
  stakeholder: { tr: 'Paydaş', en: 'Stakeholder', icon: Users, base: '/stakeholders' },
  meeting: { tr: 'Toplantı', en: 'Meeting', icon: CalendarClock, base: '/meetings' },
  meeting_note: {
    tr: 'Toplantı notu',
    en: 'Minute',
    icon: ClipboardList,
    base: '/meetings',
    viaParent: true,
  },
  decision: {
    tr: 'Karar',
    en: 'Decision',
    icon: Gavel,
    base: '/meetings',
    viaParent: true,
  },
  action_item: {
    tr: 'Aksiyon',
    en: 'Action',
    icon: ListChecks,
    base: '/meetings',
    viaParent: true,
  },
  open_question: {
    tr: 'Açık soru',
    en: 'Open question',
    icon: CircleHelp,
    base: '/meetings',
    viaParent: true,
  },
  obligation: { tr: 'Yükümlülük', en: 'Obligation', icon: ScrollText, base: '/obligations' },
  transaction: { tr: 'Mali işlem', en: 'Transaction', icon: Banknote, base: '/finance' },
  risk: { tr: 'Risk', en: 'Risk', icon: TriangleAlert, base: '/risks' },
  issue: { tr: 'Sorun', en: 'Issue', icon: TriangleAlert, base: '/risks' },
  assumption: { tr: 'Varsayım', en: 'Assumption', icon: CircleHelp, base: '/risks' },
  block: { tr: 'Blok', en: 'Block', icon: Building2, base: '/construction' },
  site_task: { tr: 'Saha işi', en: 'Site task', icon: HardHat, base: '/construction' },
};

export function kindLabel(kind: SearchKind, language: 'tr' | 'en'): string {
  const shape = SHAPE[kind];
  if (!shape) return kind;
  return language === 'tr' ? shape.tr : shape.en;
}

export function kindIcon(kind: SearchKind): React.ElementType {
  return SHAPE[kind]?.icon ?? FileText;
}

/**
 * Where to send somebody who clicks the hit.
 *
 * A minute, a decision, an action and an open question all belong to a
 * meeting, and the meeting is what has a screen of its own — so those route
 * by their parent. Everything else lands on its register, because that is as
 * far as this portal's routes currently go: there is no /risks/:id yet, and
 * pretending there is would be a dead link.
 */
export function routeFor(hit: { kind: SearchKind; id: string; parentId: string | null }): string {
  const shape = SHAPE[hit.kind];
  if (!shape) return '/';
  if (shape.viaParent) return hit.parentId ? `${shape.base}/${hit.parentId}` : shape.base;
  if (hit.kind === 'meeting') return `${shape.base}/${hit.id}`;
  return shape.base;
}

/**
 * One row per record, not one per matching paragraph.
 *
 * Found on the real archive. A meeting carries its minute as four note rows —
 * agenda, discussed, actions, outcomes — in two languages, so eight rows can
 * belong to one meeting. Searching the imported archive for a name that runs
 * through two meetings returned nine results that were two records, and the
 * nine all opened the same two screens.
 *
 * Collapsing is by DESTINATION, and only where the destination names a
 * record. A register root must not collapse: ten risks all route to /risks,
 * and folding them into one row would hide nine risks rather than nine
 * paragraphs. The ordering survives because the search returns its hits by
 * rank and the first of a group is kept.
 */
export function collapseByRecord<
  T extends { kind: SearchKind; id: string; parentId: string | null },
>(hits: T[]): { hit: T; alsoMatched: number }[] {
  const groups = new Map<string, { hit: T; alsoMatched: number }>();
  for (const hit of hits) {
    const shape = SHAPE[hit.kind];
    // A record-specific destination is groupable; a register root is not.
    const key =
      shape && (shape.viaParent || hit.kind === 'meeting')
        ? `route:${routeFor(hit)}`
        : `row:${hit.kind}:${hit.id}`;
    const seen = groups.get(key);
    if (seen) seen.alsoMatched += 1;
    else groups.set(key, { hit, alsoMatched: 0 });
  }
  return [...groups.values()];
}

/** Every register, in the order the search box offers them as filters. */
export const ALL_KINDS: SearchKind[] = Object.keys(SHAPE) as SearchKind[];
