import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from './PWAInstallButton';
import { Search, Globe, Menu } from 'lucide-react';

interface NavbarProps {
  onOpenMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenMenu }) => {
  const { language, setLanguage, setIsSearchOpen } = useApp();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200 backdrop-blur-md shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
        {/* Left: Sandwich Menu + Clean Brand */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Mobile Sandwich Button */}
          <button
            onClick={onOpenMenu}
            className="md:hidden p-2 -ml-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-none cursor-pointer"
            aria-label="Menüyü Aç"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo & Brand */}
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label={
              language === 'tr' ? 'Gösterge paneline git' : 'Go to the executive dashboard'
            }
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group text-left"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 p-0.5 shadow-sm flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-900 rounded-[9px] sm:rounded-[10px] flex items-center justify-center">
                <span className="font-extrabold text-[11px] sm:text-xs tracking-wider text-amber-400">
                  MIU
                </span>
              </div>
            </div>

            <div>
              <span className="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-amber-600 transition-colors block leading-tight">
                {language === 'tr' ? 'Mombasa Uluslararası Üniv.' : 'Mombasa Int. University'}
              </span>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate max-w-[160px] sm:max-w-xs leading-none mt-0.5">
                {language === 'tr'
                  ? 'Kenya Afrika Üniversitesi Vakfı'
                  : 'African University Trust (AUTK)'}
              </p>
            </div>
          </button>
        </div>

        {/* Center: Global Search Bar (Desktop) */}
        <div className="hidden lg:flex items-center flex-1 max-w-md mx-4">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-lg bg-slate-100/90 border border-slate-200 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors shadow-xs"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-amber-600" />
              <span>
                {language === 'tr'
                  ? 'Dava, tapu, metraj ve müteahhit ara...'
                  : 'Search cases, deeds, BoQ, contractors...'}
              </span>
            </span>
            <kbd className="font-mono text-[10px] bg-white text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 shadow-xs">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Quick Search on mobile */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            title={language === 'tr' ? 'Ara' : 'Search'}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* PWA Install Button (Desktop & Tablet) */}
          <div className="hidden sm:block">
            <PWAInstallButton />
          </div>

          {/* Language Toggle */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'tr' : 'en')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            title={language === 'en' ? 'Switch to Turkish' : 'İngilizceye Geç'}
          >
            <Globe className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-mono font-bold text-[11px] uppercase">
              {language === 'en' ? 'TR' : 'EN'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
