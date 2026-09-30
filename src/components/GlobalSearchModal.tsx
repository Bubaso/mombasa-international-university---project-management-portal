import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { useNavigate } from 'react-router-dom';
import { Search, X, Scale, FileText, Building2, Users, DollarSign } from 'lucide-react';

export const GlobalSearchModal: React.FC = () => {
  const { language, isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery } = useApp();
  const { data: legalCases = [] } = queries.useLegalCases();
  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();
  const { data: documentVault = [] } = queries.useDocumentVault();
  const { data: trustees = [] } = queries.useTrustees();
  const { data: transactions = [] } = queries.useTransactions();
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(!isSearchOpen);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setIsSearchOpen]);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  const query = searchQuery.toLowerCase().trim();

  const matchedCases = query
    ? legalCases.filter(
        (c: any) =>
          c.caseNumber.toLowerCase().includes(query) ||
          c.title.toLowerCase().includes(query) ||
          c.court.toLowerCase().includes(query) ||
          c.keyIssues.some((issue: any) => issue.toLowerCase().includes(query)),
      )
    : [];

  const matchedDocs = query
    ? documentVault.filter(
        (d: any) =>
          d.title.toLowerCase().includes(query) || d.category.toLowerCase().includes(query),
      )
    : [];

  const matchedBlocks = query
    ? constructionBlocks.filter(
        (b: any) =>
          b.name.toLowerCase().includes(query) ||
          b.code.toLowerCase().includes(query) ||
          b.contractor.toLowerCase().includes(query) ||
          b.items.some((item: any) => item.task.toLowerCase().includes(query)),
      )
    : [];

  const matchedTrustees = query
    ? trustees.filter(
        (t: any) =>
          t.name.toLowerCase().includes(query) ||
          t.nationalId.toLowerCase().includes(query) ||
          t.appointedBy.toLowerCase().includes(query) ||
          t.origin.toLowerCase().includes(query),
      )
    : [];

  const matchedTx = query
    ? transactions.filter(
        (tx: any) =>
          tx.referenceNo.toLowerCase().includes(query) ||
          tx.description.toLowerCase().includes(query) ||
          tx.payee.toLowerCase().includes(query),
      )
    : [];

  const totalResults =
    matchedCases.length +
    matchedDocs.length +
    matchedBlocks.length +
    matchedTrustees.length +
    matchedTx.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 gap-3 bg-slate-50">
          <Search className="w-5 h-5 text-amber-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === 'tr'
                ? 'Davalar, tapu belgeleri, müteahhitler, mütevelliler, harcamalar...'
                : 'Search court files, deed extracts, contractors, trustees, BoQ items...'
            }
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-white border border-slate-200 rounded shadow-xs">
            ESC
          </kbd>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!query && (
            <div className="text-center py-8 text-slate-500 text-xs">
              <p>
                {language === 'tr'
                  ? 'Hızlı aramak için anahtar kelime seçin veya yazın'
                  : 'Type to search historical project records across all modules'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {(language === 'tr'
                  ? [
                      'Mevcut Durum (Status Quo)',
                      'E062/2025',
                      '340 dönüm',
                      '807.3M KShs',
                      'Vakıf Senedi',
                      'Çatı Koruma',
                      'Zayed Vakfı',
                    ]
                  : [
                      'Status Quo',
                      'E062/2025',
                      '84 Acres',
                      'KShs 807M',
                      'Trust Deed',
                      'Roofing',
                      'Zayed Foundation',
                    ]
                ).map((term) => (
                  <button
                    key={term}
                    onClick={() => setSearchQuery(term)}
                    className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query && totalResults === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              {language === 'tr' ? 'Sonuç bulunamadı' : 'No records found matching your query'}
            </div>
          )}

          {/* Matched Legal Cases */}
          {matchedCases.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-amber-600" />
                <span>{language === 'tr' ? 'Hukuki Dosyalar' : 'Legal Cases & Appeals'}</span>
              </div>
              <div className="space-y-1.5">
                {matchedCases.map((c: any) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      navigate('/legal');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg bg-slate-50 hover:bg-amber-50/60 border border-slate-200 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-800">{c.caseNumber}</span>
                      <span className="text-[11px] text-slate-500">{c.court}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-800 mt-1 line-clamp-1">
                      {c.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                      {language === 'tr' ? c.descriptionTr : c.descriptionEn}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Documents */}
          {matchedDocs.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>{language === 'tr' ? 'Belgeler & Deliller' : 'Documents & Evidence'}</span>
              </div>
              <div className="space-y-1.5">
                {matchedDocs.map((d: any) => (
                  <div
                    key={d.id}
                    onClick={() => {
                      navigate('/documents');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50/60 border border-slate-200 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{d.title}</span>
                      <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {d.versionCount > 1
                          ? language === 'tr'
                            ? `${d.versionCount} sürüm`
                            : `${d.versionCount} versions`
                          : language === 'tr'
                            ? 'tek sürüm'
                            : 'one version'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                      {language === 'tr' ? d.descriptionTr : d.descriptionEn}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Construction */}
          {matchedBlocks.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{language === 'tr' ? 'İnşaat Blokları' : 'Construction Blocks & Tasks'}</span>
              </div>
              <div className="space-y-1.5">
                {matchedBlocks.map((b: any) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      navigate('/construction');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{b.name}</span>
                      <span className="text-amber-700 font-mono text-xs font-semibold">
                        {b.progressPercent}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {b.leadEngineer} · {b.contractor}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Trustees */}
          {matchedTrustees.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span>{language === 'tr' ? 'Mütevelliler' : 'Trustees & Governance'}</span>
              </div>
              <div className="space-y-1.5">
                {matchedTrustees.map((t: any) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      navigate('/governance');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg bg-slate-50 hover:bg-purple-50/60 border border-slate-200 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{t.name}</span>
                      <span className="text-slate-500 text-[11px]">{t.origin}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {t.appointedBy} · {t.nationalId}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Financial Tx */}
          {matchedTx.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>{language === 'tr' ? 'Mali İşlemler' : 'Financial Disbursements'}</span>
              </div>
              <div className="space-y-1.5">
                {matchedTx.map((tx: any) => (
                  <div
                    key={tx.id}
                    onClick={() => {
                      navigate('/finance');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{tx.description}</span>
                      <span className="font-mono text-emerald-700 font-semibold">
                        KShs {tx.amountKShs.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {tx.payee} · {tx.date}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
