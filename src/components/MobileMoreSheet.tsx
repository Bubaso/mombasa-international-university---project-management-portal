import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { NAV_GROUPS } from '../lib/navigation';
import { UNIVERSITY, TRUST, name } from '../lib/org';
import { Globe, LogOut, Search, X, ChevronRight } from 'lucide-react';

interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Everywhere you can go, on a phone.
 *
 * This sheet used to list nine of the nineteen routes, hand-written, each
 * with its own description. Six routes were in neither this list nor the
 * bottom bar, so on a phone they did not exist: compliance and academic
 * readiness, risks, the plan, procurement, reports, and the assistant. That
 * was not a decision anybody made — the list had simply been written once
 * and never caught up with the sidebar.
 *
 * So it reads `lib/navigation.ts` now, the same six groups the sidebar shows,
 * and every route is two taps away: the menu, then the route.
 *
 * The per-route descriptions are gone with it. They were prose written beside
 * each entry — "340 dönüm arazi, 60 yıllık tapu, fakülteler, burs sözleşmesi"
 * — which made a list of nineteen unreadable, and several of them asserted
 * figures nobody had checked. A group heading says enough about where a route
 * sits, and the route's own screen says what is on it.
 */
export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({ isOpen, onClose }) => {
  const { language, setLanguage, setIsSearchOpen } = useApp();
  const tr = language === 'tr';
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const navigateTo = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end animate-fade-in">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="relative z-10 bg-white rounded-t-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up border-t border-slate-200">
        <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto" />

        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-800 font-bold text-sm">
              MIU
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {tr ? 'Tüm bölümler' : 'All sections'}
              </h3>
              <p className="text-sm text-slate-500">{tr ? UNIVERSITY.tr : UNIVERSITY.en}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={tr ? 'Kapat' : 'Close'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search is a way of getting around, not a feature: in a portal with
            nineteen routes it is often the shortest one. */}
        <button
          onClick={() => {
            onClose();
            setIsSearchOpen(true);
          }}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-600" />
            <span className="font-medium">
              {tr ? 'Tüm kayıtlarda ara…' : 'Search across all records…'}
            </span>
          </span>
          <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-500">
            {tr ? 'Bul' : 'Find'}
          </span>
        </button>

        <nav aria-label={tr ? 'Tüm bölümler' : 'All sections'} className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                {group.heading[language]}
              </h4>
              <ul className="space-y-1.5">
                {group.routes.map((route) => {
                  const Icon = route.icon;
                  const isCurrent = location.pathname === route.path;
                  return (
                    <li key={route.tab}>
                      <button
                        onClick={() => navigateTo(route.path)}
                        aria-current={isCurrent ? 'page' : undefined}
                        // See the sidebar: the route, readable from outside.
                        data-path={route.path}
                        className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300'
                            : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${
                              isCurrent
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            <Icon className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <span className="font-semibold text-sm text-slate-900">
                            {route.label[language]}
                          </span>
                        </span>
                        <ChevronRight
                          className="w-4 h-4 text-slate-500 shrink-0"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="text-xs font-bold uppercase text-slate-500 tracking-wider">
            {tr ? 'Dil' : 'Language'}
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <span className="flex items-center gap-2 text-slate-700 font-medium">
              <Globe className="w-4 h-4 text-amber-600" />
              <span>{tr ? 'Arayüz dili:' : 'Interface language:'}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLanguage('tr')}
                className={`px-3 py-1 rounded-lg font-bold text-sm transition-colors cursor-pointer ${
                  tr
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                TR
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-lg font-bold text-sm transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        {/* Signing out lives here on a phone, not in the top bar.
            The bar's right-hand cluster did not fit at 390px — the sign-out
            icon ended 8px past the viewport, which is where the horizontal
            rock on all nineteen routes came from. This is also simply where
            people look for it. */}
        {user && (
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                void signOut();
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 hover:bg-rose-100"
            >
              <span className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                {tr ? 'Çıkış yap' : 'Sign out'}
              </span>
              <span className="max-w-[160px] truncate text-xs font-normal text-rose-700">
                {user.name}
              </span>
            </button>
          </div>
        )}

        <div className="pt-2 text-center text-xs text-slate-500">
          {name(UNIVERSITY, language)} · {name(TRUST, language)}
        </div>
      </div>
    </div>
  );
};
