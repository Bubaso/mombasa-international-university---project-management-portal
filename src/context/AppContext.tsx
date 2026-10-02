import React, { createContext, useContext, useState } from 'react';
import { type Language } from '../types';
import { translations } from '../i18n/translations';

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  clarificationAnswers: Record<string, string>;
  setClarificationAnswer: (id: string, answer: string) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('tr');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});

  const t = translations[language];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const setClarificationAnswer = (id: string, answer: string) => {
    setClarificationAnswers((prev) => ({ ...prev, [id]: answer }));
    showToast(language === 'tr' ? 'Açıklama kaydedildi' : 'Clarification response saved');
  };

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        t,
        searchQuery,
        setSearchQuery,
        isSearchOpen,
        setIsSearchOpen,
        clarificationAnswers,
        setClarificationAnswer,
        toastMessage,
        showToast,
      }}
    >
      {children}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-slate-800">{toastMessage}</span>
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
