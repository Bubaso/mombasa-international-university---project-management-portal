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

/** Every register, in the order the search box offers them as filters. */
export const ALL_KINDS: SearchKind[] = Object.keys(SHAPE) as SearchKind[];
