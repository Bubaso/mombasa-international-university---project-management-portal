import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { type ActiveTab } from '../types';
import { LayoutDashboard, Scale, Building2, Receipt, LayoutGrid } from 'lucide-react';

interface MobileBottomNavProps {
  onOpenMore: () => void;
  isMoreOpen: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenMore, isMoreOpen }) => {
  const { language } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems: {
    tab: ActiveTab;
    path: string;
    labelTr: string;
    labelEn: string;
    icon: React.ElementType;
    badge?: string;
  }[] = [
    {
      tab: 'dashboard',
      path: '/',
      labelTr: 'Gündem',
      labelEn: 'Agenda',
      icon: LayoutDashboard,
    },
    {
      tab: 'legal',
      path: '/legal',
      labelTr: 'Hukuk',
      labelEn: 'Legal',
      icon: Scale,
      badge: 'E062',
    },
    {
      tab: 'construction',
      path: '/construction',
      labelTr: 'İnşaat',
      labelEn: 'Build',
      icon: Building2,
      badge: '%52',
    },
    {
      tab: 'finance',
      path: '/finance',
      labelTr: 'Maliye',
      labelEn: 'Finance',
      icon: Receipt,
    },
  ];

  return (
    <nav
      data-print="hide"
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1 flex items-center justify-around shadow-lg safe-area-bottom"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path && !isMoreOpen;

        return (
          <button
            key={item.tab}
            onClick={() => navigate(item.path)}
            className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all cursor-pointer min-h-[50px] ${
              isActive
                ? 'text-amber-800 font-bold'
                : 'text-slate-500 hover:text-slate-800 font-medium'
            }`}
          >
            {/* Active Pill Indicator */}
            {isActive && <span className="absolute top-1 w-6 h-1 rounded-full bg-amber-600" />}

            <div className="relative mt-1">
              <Icon
                className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-amber-700' : ''}`}
              />
              {item.badge && (
                <span className="absolute -top-1.5 -right-3 text-[9px] font-mono px-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold leading-none py-0.5">
                  {item.badge}
                </span>
              )}
            </div>

            <span className="text-[10px] mt-1 tracking-tight">
              {language === 'tr' ? item.labelTr : item.labelEn}
            </span>
          </button>
        );
      })}

      {/* 5th Tab: Menü / Daha Fazla (More Sheet Trigger) */}
      <button
        onClick={onOpenMore}
        className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all cursor-pointer min-h-[50px] ${
          isMoreOpen ||
          (location.pathname !== '/' &&
            location.pathname !== '/legal' &&
            location.pathname !== '/construction' &&
            location.pathname !== '/finance')
            ? 'text-amber-800 font-bold'
            : 'text-slate-500 hover:text-slate-800 font-medium'
        }`}
      >
        {(isMoreOpen ||
          (location.pathname !== '/' &&
            location.pathname !== '/legal' &&
            location.pathname !== '/construction' &&
            location.pathname !== '/finance')) && (
          <span className="absolute top-1 w-6 h-1 rounded-full bg-amber-600" />
        )}
        <div className="relative mt-1">
          <LayoutGrid className="w-5 h-5" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 absolute -top-0.5 -right-0.5" />
        </div>
        <span className="text-[10px] mt-1 tracking-tight">
          {language === 'tr' ? 'Menü' : 'More'}
        </span>
      </button>
    </nav>
  );
};
