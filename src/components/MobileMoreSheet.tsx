import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { type ActiveTab } from '../types';
import {
  GraduationCap,
  Users2,
  FolderGit2,
  MessagesSquare,
  ShieldCheck,
  Handshake,
  CalendarDays,
  ScrollText,
  CalendarClock,
  Globe,
  Search,
  X,
  ChevronRight,
} from 'lucide-react';

interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({ isOpen, onClose }) => {
  const { language, setLanguage, setIsSearchOpen } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const navigateTo = (path: string) => {
    navigate(path);
    onClose();
  };

  const moreItems: {
    tab: ActiveTab;
    path: string;
    labelTr: string;
    labelEn: string;
    descTr: string;
    descEn: string;
    icon: React.ElementType;
    color: string;
  }[] = [
    {
      tab: 'project_info',
      path: '/project_info',
      labelTr: 'Proje Künyesi & Bilgileri',
      labelEn: 'Project Overview & Identity',
      descTr: '340 dönüm arazi, 60 yıllık tapu, fakülteler, burs sözleşmesi',
      descEn: '84 acres, 60-year lease, faculties & scholarship terms',
      icon: GraduationCap,
      color: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    {
      tab: 'governance',
      path: '/governance',
      labelTr: 'Mütevelliler & Yönetişim',
      labelEn: 'Board of Trustees & Charter',
      descTr: 'Fasıl 164 tescilli 12 mütevelli, CUE berat yol haritası',
      descEn: 'Cap 164 12-member board, CUE charter milestones',
      icon: Users2,
      color: 'bg-purple-100 text-purple-800 border-purple-300',
    },
    {
      tab: 'documents',
      path: '/documents',
      labelTr: 'Belge Kasası',
      labelEn: 'Document Vault',
      descTr: 'Tapu, layiha ve metraj kayıtları — şimdilik yalnızca künye bilgisi',
      descEn: 'Deed, pleading and BoQ records — metadata only for now',
      icon: FolderGit2,
      color: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    {
      tab: 'communication',
      path: '/communication',
      labelTr: 'Paydaşlar Arası İletişim',
      labelEn: 'Stakeholder Comms',
      descTr: 'Avukatlar, şantiye müteahhitleri ve vakıflar arası mesajlaşma',
      descEn: 'Direct coordination between counsel, site engineers & trustees',
      icon: MessagesSquare,
      color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    {
      tab: 'stakeholders',
      path: '/stakeholders',
      labelTr: 'Paydaşlar ve İlişkiler',
      labelEn: 'Stakeholders & Relationships',
      descTr: 'Kim bizden yana, kimi etkiliyor, en son ne zaman konuşuldu',
      descEn: 'Who is with us, who they reach, and when we last spoke',
      icon: Handshake,
      color: 'bg-teal-100 text-teal-800 border-teal-300',
    },
    {
      tab: 'meetings',
      path: '/meetings',
      labelTr: 'Toplantılar ve Kararlar',
      labelEn: 'Meetings & Decisions',
      descTr: 'Tutanak, karar, aksiyon ve cevaplanmamış sorular',
      descEn: 'Minutes, decisions, actions and unanswered questions',
      icon: CalendarDays,
      color: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    },
    {
      tab: 'obligations',
      path: '/obligations',
      labelTr: 'Yükümlülük ve Taahhütler',
      labelEn: 'Obligations & Commitments',
      descTr: 'Kira, mahkeme, senet ve mutabakatların yüklediği her şey — ve verilen sözler',
      descEn: 'What the lease, the courts and the memoranda require — and what was promised',
      icon: ScrollText,
      color: 'bg-rose-100 text-rose-800 border-rose-300',
    },
    {
      tab: 'calendar',
      path: '/calendar',
      labelTr: 'Takvim ve Geri Sayım',
      labelEn: 'Calendar & Countdown',
      descTr: 'Duruşma, usul süresi, yükümlülük ve aksiyon — tarihi olan her şey',
      descEn: 'Hearings, deadlines, obligations and actions — everything with a date',
      icon: CalendarClock,
      color: 'bg-slate-100 text-slate-800 border-slate-300',
    },
    {
      tab: 'admin',
      path: '/admin',
      labelTr: 'Erişim ve Yönetim',
      labelEn: 'Access & Administration',
      descTr: 'Kimin neye eriştiği, kapsam, paylaşım ve denetim kaydı',
      descEn: 'Who can reach what: scope, sharing, delegation and the audit trail',
      icon: ShieldCheck,
      color: 'bg-amber-100 text-amber-800 border-amber-300',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end animate-fade-in">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div className="relative z-10 bg-white rounded-t-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up border-t border-slate-200">
        {/* Drag handle */}
        <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto" />

        {/* Sheet Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-800 font-bold text-xs">
              MIU
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'tr' ? 'Diğer Modüller & Ayarlar' : 'More Modules & Settings'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {language === 'tr'
                  ? 'Mombasa Uluslararası Üniversitesi'
                  : 'Mombasa International University'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Search Quick Trigger */}
        <button
          onClick={() => {
            onClose();
            setIsSearchOpen(true);
          }}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-600" />
            <span className="font-medium">
              {language === 'tr' ? 'Tüm modüllerde ara...' : 'Search across all records...'}
            </span>
          </span>
          <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-500">
            {language === 'tr' ? 'Bul' : 'Find'}
          </span>
        </button>

        {/* Quick Module Destinations */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
            {language === 'tr' ? 'Önemli Bölümler' : 'Dedicated Sections'}
          </div>
          <div className="space-y-2">
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isCurrent = location.pathname === item.path;
              return (
                <button
                  key={item.tab}
                  onClick={() => navigateTo(item.path)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300'
                      : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${item.color}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">
                        {language === 'tr' ? item.labelTr : item.labelEn}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">
                        {language === 'tr' ? item.descTr : item.descEn}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Language & Role Switchers */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
            {language === 'tr' ? 'Kullanıcı Rolü & Dil' : 'User Role & Language'}
          </div>

          {/* Language Switcher Bar */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="flex items-center gap-2 text-slate-700 font-medium">
              <Globe className="w-4 h-4 text-amber-600" />
              <span>{language === 'tr' ? 'Arayüz Dili:' : 'Interface Language:'}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLanguage('tr')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  language === 'tr'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                TR
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
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

        {/* Footer info */}
        <div className="pt-2 text-center text-[10px] text-slate-400">
          Mombasa International University · AUTK Cap 164 · Plot MN/I/5141
        </div>
      </div>
    </div>
  );
};
