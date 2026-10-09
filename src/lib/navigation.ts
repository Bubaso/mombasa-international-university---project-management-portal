import type React from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  Scale,
  Building2,
  Users2,
  Handshake,
  CalendarDays,
  ScrollText,
  CalendarClock,
  Receipt,
  FolderGit2,
  MessagesSquare,
  ShieldCheck,
  TriangleAlert,
  Bot,
  ShoppingBag,
  GanttChartSquare,
  ClipboardList,
} from 'lucide-react';
import { type ActiveTab } from '../types';

/**
 * The portal's navigation: nineteen routes, in six named groups.
 *
 * One list, read by the sidebar and by the phone's menu sheet. It used to be
 * two: the sidebar carried all nineteen routes and the phone sheet carried
 * nine, so six of them — compliance, risks, plan, procurement, reports and
 * the assistant — simply could not be reached from a phone. Nobody had
 * decided to hide them; the second list had just never caught up with the
 * first. A grouping written twice drifts the same way, so it is written here.
 *
 * Each route carries two names, and the difference matters:
 *
 *   `label` is what navigation shows. It is short on purpose. The sidebar is
 *   256px wide, and five of the old labels did not fit it: "Plan, Kilometre
 *   Taşları ve Kron…", "Uyum ve Akademik Hazır…". A label you cannot read is
 *   not a label, and cutting the end off the longest words costs exactly the
 *   part that distinguishes one screen from another.
 *
 *   `title` is the full name, for the page heading, where there is room for
 *   it and where saying the whole thing is useful.
 *
 * No route carries a badge. The six that used to — "Temyiz E062",
 * "Koruma Tedbiri", "API Hazır", "v2.1", "E062", "%52" — were all typed in,
 * and all read as a current statement of fact by everyone who saw them: an
 * appeal number, a court measure, an integration that does not exist, a
 * version nobody set, and a construction progress figure. That is the same
 * defect Faz 0 took off the screen, so a badge here has to come from a query
 * or not exist.
 */

export interface NavRoute {
  tab: ActiveTab;
  path: string;
  /** Short, for navigation. Must fit a 256px sidebar without truncating. */
  label: { tr: string; en: string };
  /** The full name, for the page heading. */
  title: { tr: string; en: string };
  icon: React.ElementType;
}

export interface NavGroup {
  id: string;
  heading: { tr: string; en: string };
  routes: NavRoute[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    heading: { tr: 'Genel bakış', en: 'Overview' },
    routes: [
      {
        tab: 'dashboard',
        path: '/',
        label: { tr: 'Gösterge paneli', en: 'Dashboard' },
        title: { tr: 'Yönetici Gösterge Paneli', en: 'Executive Dashboard' },
        icon: LayoutDashboard,
      },
      {
        tab: 'calendar',
        path: '/calendar',
        label: { tr: 'Takvim', en: 'Calendar' },
        title: { tr: 'Takvim ve Geri Sayım', en: 'Calendar & Countdown' },
        icon: CalendarClock,
      },
      {
        tab: 'reports',
        path: '/reports',
        label: { tr: 'Raporlar', en: 'Reports' },
        title: { tr: 'Derlenen Raporlar', en: 'Compiled Reports' },
        icon: ClipboardList,
      },
    ],
  },
  {
    id: 'governance',
    heading: { tr: 'Proje ve yönetişim', en: 'Project & governance' },
    routes: [
      {
        tab: 'project_info',
        path: '/project_info',
        label: { tr: 'Proje künyesi', en: 'Project overview' },
        title: { tr: 'Proje Künyesi ve Bilgileri', en: 'Project Overview & Identity' },
        icon: GraduationCap,
      },
      {
        tab: 'governance',
        path: '/governance',
        label: { tr: 'Mütevelliler', en: 'Trustees' },
        title: { tr: 'Mütevelliler ve Yönetişim', en: 'Trustees & Governance' },
        icon: Users2,
      },
      {
        tab: 'readiness',
        path: '/readiness',
        label: { tr: 'Akademik hazırlık', en: 'Academic readiness' },
        title: { tr: 'Uyum ve Akademik Hazırlık', en: 'Compliance & Academic Readiness' },
        icon: GraduationCap,
      },
    ],
  },
  {
    id: 'legal',
    heading: { tr: 'Hukuk ve yükümlülük', en: 'Legal & obligations' },
    routes: [
      {
        tab: 'legal',
        path: '/legal',
        label: { tr: 'Hukuk işleri', en: 'Legal affairs' },
        title: { tr: 'Hukuk İşleri ve Davalar', en: 'Legal Affairs & Court Cases' },
        icon: Scale,
      },
      {
        tab: 'obligations',
        path: '/obligations',
        label: { tr: 'Yükümlülükler', en: 'Obligations' },
        title: { tr: 'Yükümlülük ve Taahhütler', en: 'Obligations & Commitments' },
        icon: ScrollText,
      },
      {
        tab: 'risks',
        path: '/risks',
        label: { tr: 'Risk ve sorunlar', en: 'Risks & issues' },
        title: { tr: 'Risk ve Sorunlar', en: 'Risks & Issues' },
        icon: TriangleAlert,
      },
    ],
  },
  {
    id: 'site',
    heading: { tr: 'Saha, plan ve para', en: 'Site, plan & money' },
    routes: [
      {
        tab: 'construction',
        path: '/construction',
        label: { tr: 'İnşaat', en: 'Construction' },
        title: { tr: 'İnşaat ve Koruma Tedbirleri', en: 'Construction & Preservation' },
        icon: Building2,
      },
      {
        tab: 'plan',
        path: '/plan',
        label: { tr: 'Plan', en: 'Plan' },
        title: { tr: 'Plan, Kilometre Taşları ve Kronoloji', en: 'Plan, Milestones & Chronology' },
        icon: GanttChartSquare,
      },
      {
        tab: 'procurement',
        path: '/procurement',
        label: { tr: 'Tedarik', en: 'Procurement' },
        title: { tr: 'Tedarik ve Sözleşmeler', en: 'Procurement & Contracts' },
        icon: ShoppingBag,
      },
      {
        tab: 'finance',
        path: '/finance',
        label: { tr: 'Mali yönetim', en: 'Financials' },
        // Not "Accounting API": there is no accounting integration, and the
        // label was claiming one every time anybody opened the portal.
        title: { tr: 'Mali Yönetim ve Muhasebe', en: 'Financials & Accounting' },
        icon: Receipt,
      },
    ],
  },
  {
    id: 'records',
    heading: { tr: 'Kayıt ve ilişkiler', en: 'Records & relationships' },
    routes: [
      {
        tab: 'meetings',
        path: '/meetings',
        label: { tr: 'Toplantılar', en: 'Meetings' },
        title: { tr: 'Toplantılar ve Kararlar', en: 'Meetings & Decisions' },
        icon: CalendarDays,
      },
      {
        tab: 'documents',
        path: '/documents',
        label: { tr: 'Belge kasası', en: 'Document vault' },
        title: { tr: 'Belge Kasası ve Versiyonlar', en: 'Document Vault & Versions' },
        icon: FolderGit2,
      },
      {
        tab: 'stakeholders',
        path: '/stakeholders',
        label: { tr: 'Paydaşlar', en: 'Stakeholders' },
        title: { tr: 'Paydaşlar ve İlişkiler', en: 'Stakeholders & Relationships' },
        icon: Handshake,
      },
      {
        tab: 'communication',
        path: '/communication',
        label: { tr: 'İletişim', en: 'Communication' },
        title: { tr: 'Paydaş İletişimi', en: 'Stakeholder Comms' },
        icon: MessagesSquare,
      },
    ],
  },
  {
    id: 'system',
    heading: { tr: 'Sistem', en: 'System' },
    routes: [
      {
        tab: 'assistant',
        path: '/assistant',
        label: { tr: 'Arama ve asistan', en: 'Search & assistant' },
        title: { tr: 'Arama ve Asistan', en: 'Search & Assistant' },
        icon: Bot,
      },
      {
        tab: 'admin',
        path: '/admin',
        label: { tr: 'Erişim ve yönetim', en: 'Access & administration' },
        title: { tr: 'Erişim ve Yönetim', en: 'Access & Administration' },
        icon: ShieldCheck,
      },
    ],
  },
];

/** Every route, flat, in the order the groups put them in. */
export const NAV_ROUTES: NavRoute[] = NAV_GROUPS.flatMap((g) => g.routes);

/** The route a path belongs to, for headings and for "where am I". */
export function routeForPath(pathname: string): NavRoute | undefined {
  // Longest match first, so /meetings/:id resolves to /meetings rather than
  // to / — which is what a plain `startsWith` scan over this list would do.
  return [...NAV_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((r) => pathname === r.path || (r.path !== '/' && pathname.startsWith(r.path + '/')));
}

/** The group a path belongs to, for the heading above it. */
export function groupForPath(pathname: string): NavGroup | undefined {
  const route = routeForPath(pathname);
  return route ? NAV_GROUPS.find((g) => g.routes.some((r) => r.tab === route.tab)) : undefined;
}
