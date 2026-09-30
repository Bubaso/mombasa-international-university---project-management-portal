import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { type ActiveTab } from '../types';
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
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { t, language } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems: {
    tab: ActiveTab;
    path: string;
    label: string;
    icon: React.ElementType;
    badge?: string | number;
    badgeColor?: string;
  }[] = [
    { tab: 'dashboard', path: '/', label: t.nav.dashboard, icon: LayoutDashboard },
    { tab: 'project_info', path: '/project_info', label: t.nav.project_info, icon: GraduationCap },
    {
      tab: 'legal',
      path: '/legal',
      label: t.nav.legal,
      icon: Scale,
      badge: language === 'tr' ? 'Temyiz E062' : 'Appeal E062',
      badgeColor: 'text-amber-800 bg-amber-100 border border-amber-300',
    },
    {
      tab: 'construction',
      path: '/construction',
      label: t.nav.construction,
      icon: Building2,
      badge: language === 'tr' ? 'Koruma Tedbiri' : 'Preservation',
      badgeColor: 'text-rose-800 bg-rose-100 border border-rose-300',
    },
    { tab: 'governance', path: '/governance', label: t.nav.governance, icon: Users2 },
    { tab: 'stakeholders', path: '/stakeholders', label: t.nav.stakeholders, icon: Handshake },
    { tab: 'meetings', path: '/meetings', label: t.nav.meetings, icon: CalendarDays },
    // The connective tissue: what the lease, the courts, the deed and the
    // people around this project have each undertaken, in one list.
    { tab: 'obligations', path: '/obligations', label: t.nav.obligations, icon: ScrollText },
    { tab: 'risks', path: '/risks', label: t.nav.risks, icon: TriangleAlert },
    // Everything with a date, from every register at once.
    { tab: 'calendar', path: '/calendar', label: t.nav.calendar, icon: CalendarClock },
    {
      tab: 'finance',
      path: '/finance',
      label: t.nav.finance,
      icon: Receipt,
      badge: language === 'tr' ? 'API Hazır' : 'API Live',
      badgeColor: 'text-emerald-800 bg-emerald-100 border border-emerald-300',
    },
    {
      tab: 'documents',
      path: '/documents',
      label: t.nav.documents,
      icon: FolderGit2,
      badge: 'v2.1',
    },
    {
      tab: 'communication',
      path: '/communication',
      label: t.nav.communication,
      icon: MessagesSquare,
    },
    // Everyone signed in belongs here: for most people it is where they read
    // what their own access consists of, not where they change anyone else's.
    { tab: 'admin', path: '/admin', label: t.nav.admin, icon: ShieldCheck },
  ];

  return (
    <aside className="hidden md:flex md:sticky top-16 z-30 h-[calc(100vh-4rem)] w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 shadow-xs">
      {/* Nav Items */}
      <div className="p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.tab}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left group cursor-pointer ${
                isActive
                  ? 'bg-amber-50 text-amber-900 font-semibold border-l-2 border-amber-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-amber-600' : 'text-slate-500 group-hover:text-slate-700'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                    item.badgeColor || 'text-slate-600 bg-slate-100'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/*
        What used to be here: a card asserting the appeal's current standing
        and the capital invested, both typed in. It said "STATUS QUO" and
        "9 Feb 2026: priority hearing granted" on every page of the portal,
        in the present tense, from a string — so it would have gone on saying
        that whatever happened in court. A hardcoded legal status is worse
        than a missing one: it is read as current by everybody who sees it,
        and nobody thinks to check a thing the interface states plainly.

        The court's standing is in the legal register, the invested total in
        the ledger, and both say where they came from and when. What stays
        here is the identity of the project, which does not change (M12-03).
      */}
      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600 shadow-xs">
          <div className="font-semibold text-slate-700">
            {language === 'tr' ? 'MIU · Utange/Majaoni' : 'MIU · Utange/Majaoni'}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {language === 'tr' ? 'Parsel MN/I/5141 · Fasıl 164' : 'Plot MN/I/5141 · Cap 164'}
          </div>
        </div>
      </div>
    </aside>
  );
};
