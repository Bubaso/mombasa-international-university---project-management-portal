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
  Receipt,
  FolderGit2,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
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

      {/* Bottom Project Info Card */}
      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700 space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-amber-800 font-semibold">
            <span className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>{language === 'tr' ? 'Yargıtay Durumu' : 'Court of Appeal'}</span>
            </span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono font-medium">
              {language === 'tr' ? 'MEVCUT DURUM' : 'STATUS QUO'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 line-clamp-2">
            {language === 'tr'
              ? '9 Şubat 2026: Sınırlar koruma altında, öncelikli temyiz süreci aktif.'
              : '9 Feb 2026: Priority hearing granted, 5-acre boundary order active.'}
          </p>
          <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Cap 164 · Mombasa</span>
            <span className="font-medium text-slate-600">807.3M KShs</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
