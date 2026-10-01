/**
 * The navigation vocabulary, and only that.
 *
 * This file used to carry around three hundred lines of English and Turkish
 * strings for every screen, of which exactly one group was ever rendered.
 * The rest was not merely unused — it asserted things the system does not do
 * ("Hash Verified", "Securely Stored", "Encrypted & versioned") and described
 * a six-role model that thirteen roles replaced. A dead string is one reach
 * away from being a live claim, so it is gone.
 *
 * Everywhere else the project writes its text where it is used, as
 * `language === 'tr' ? '…' : '…'`. Navigation is the exception because three
 * components have to agree on the same labels.
 */
export const translations = {
  en: {
    nav: {
      dashboard: 'Executive Dashboard',
      project_info: 'Project Overview & Identity',
      legal: 'Legal Affairs & Court Cases',
      construction: 'Construction & Preservation',
      governance: 'Trustees & Governance',
      readiness: 'Compliance & Academic Readiness',
      stakeholders: 'Stakeholders & Relationships',
      meetings: 'Meetings & Decisions',
      obligations: 'Obligations & Commitments',
      risks: 'Risks & Issues',
      calendar: 'Calendar & Countdown',
      procurement: 'Procurement & Contracts',
      finance: 'Financials & Accounting API',
      documents: 'Document Vault & Audit',
      communication: 'Stakeholder Comms',
      assistant: 'Search & Assistant',
      admin: 'Access & Administration',
    },
  },
  tr: {
    nav: {
      dashboard: 'Yönetici Gösterge Paneli',
      project_info: 'Proje Künyesi & Bilgileri',
      legal: 'Hukuk İşleri ve Davalar',
      construction: 'İnşaat ve Koruma Tedbirleri',
      governance: 'Mütevelliler ve Yönetişim',
      readiness: 'Uyum ve Akademik Hazırlık',
      stakeholders: 'Paydaşlar ve İlişkiler',
      meetings: 'Toplantılar ve Kararlar',
      obligations: 'Yükümlülük ve Taahhütler',
      risks: 'Risk ve Sorunlar',
      calendar: 'Takvim ve Geri Sayım',
      procurement: 'Tedarik ve Sözleşmeler',
      finance: 'Mali Yönetim & Muhasebe API',
      documents: 'Belge Kasası ve Versiyonlar',
      communication: 'Paydaş İletişimi',
      assistant: 'Arama ve Asistan',
      admin: 'Erişim ve Yönetim',
    },
  },
};
