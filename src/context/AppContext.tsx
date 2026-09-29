import React, { createContext, useContext, useState } from 'react';
import { type Language, type UserRole, type CurrentUser, type AccountingApiConfig } from '../types';
import { translations } from '../i18n/translations';

export const AVAILABLE_ROLES = [
  { role: 'trustee' as UserRole, nameEn: 'Board Trustee', nameTr: 'Mütevelli' },
  { role: 'legal_counsel' as UserRole, nameEn: 'Legal Counsel', nameTr: 'Hukuk Müşaviri' },
  { role: 'contractor_qs' as UserRole, nameEn: 'Contractor / QS', nameTr: 'Müteahhit / QS' },
  { role: 'auditor_finance' as UserRole, nameEn: 'Auditor', nameTr: 'Denetçi' },
  { role: 'executive' as UserRole, nameEn: 'Executive', nameTr: 'Yönetici' }
];

export const INITIAL_USER: CurrentUser = {
  id: 'u-1',
  name: 'Simon Karina',
  role: 'legal_counsel',
  organization: 'Simon Karina & Khatib Advocates',
  email: 'simon@example.com'
};

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
  currentUser: CurrentUser;
  switchRole: (role: UserRole) => void;
  accountingConfig: AccountingApiConfig;
  updateAccountingConfig: (updates: Partial<AccountingApiConfig>) => void;
  triggerAccountingSync: () => Promise<void>;
  isSyncingAccounting: boolean;
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
  const [currentUser, setCurrentUser] = useState<CurrentUser>(INITIAL_USER);
  const [accountingConfig, setAccountingConfig] = useState<AccountingApiConfig>({
    provider: 'QuickBooks',
    status: 'connected',
    lastSyncTimestamp: new Date().toISOString(),
    apiUrl: '',
    apiKeyMasked: '',
    syncFrequency: 'daily',
    autoSyncBills: false,
    autoSyncAssets: false
  });
  const [isSyncingAccounting, setIsSyncingAccounting] = useState<boolean>(false);
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

  const switchRole = (role: UserRole) => {
    const roleMeta = AVAILABLE_ROLES.find((r) => r.role === role);
    setCurrentUser((prev) => ({
      ...prev,
      role,
      name: roleMeta ? (language === 'tr' ? roleMeta.nameTr : roleMeta.nameEn) : prev.name
    }));
    showToast(
      language === 'tr'
        ? `Rol değiştirildi: ${roleMeta?.nameTr || role}`
        : `Switched role to: ${roleMeta?.nameEn || role}`
    );
  };

  const updateAccountingConfig = (updates: Partial<AccountingApiConfig>) => {
    setAccountingConfig((prev) => ({ ...prev, ...updates }));
    showToast(language === 'tr' ? 'Muhasebe API ayarları güncellendi' : 'Accounting API configuration updated');
  };

  const triggerAccountingSync = async () => {
    setIsSyncingAccounting(true);
    setAccountingConfig((prev) => ({ ...prev, status: 'syncing' }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setAccountingConfig((prev) => ({
      ...prev,
      status: 'connected',
      lastSyncTimestamp: new Date().toISOString()
    }));
    setIsSyncingAccounting(false);
    showToast(
      language === 'tr'
        ? `${accountingConfig.provider} API ile çift yönlü senkronizasyon tamamlandı`
        : `Bi-directional sync with ${accountingConfig.provider} completed successfully`
    );
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
        currentUser,
        switchRole,
        accountingConfig,
        updateAccountingConfig,
        triggerAccountingSync,
        isSyncingAccounting,
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
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold animate-fade-in">
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
