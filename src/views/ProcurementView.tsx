/**
 * Procurement and contracts (M14).
 *
 * The requirement describes a situation rather than a feature: "dört avukat
 * adayı, müteahhit seçimi, denetçi arayışı, danışmanlar. Ama hiçbirinin seçim
 * gerekçesi, teklifi ve sözleşmesi tek yerde durmuyor." All of it has
 * happened. None of it is written down in one place.
 *
 * And it says why that is not an efficiency complaint: "Bir vakıfta bu sadece
 * verimlilik meselesi değil — bağışçıya ve denetime hesap verebilirliktir."
 *
 * So the three panels are the three questions an auditor asks, in the order
 * they ask them: what did you buy and why, what did you sign, and how did
 * they do. The reasons are required at the point of decision in all three,
 * because afterwards is when they get reconstructed.
 */
import React, { useState } from 'react';
import { ClipboardCheck, FileSignature, Scale, ShoppingBag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { RequestPanel } from '../components/procurement/RequestPanel';
import { ContractPanel } from '../components/procurement/ContractPanel';
import { ReviewPanel } from '../components/procurement/ReviewPanel';
import { MatchingPanel } from '../components/procurement/MatchingPanel';
import { DataFreshness } from '../components/DataFreshness';
import { fetchContracts } from '../api/procurement';

type Tab = 'requests' | 'contracts' | 'matching' | 'reviews';

export const ProcurementView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [tab, setTab] = useState<Tab>('requests');

  // Freshness is measured on the contracts, because their warning bands are
  // the part of this screen that is about today rather than about the record.
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: fetchContracts });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tr ? 'Tedarik ve sözleşmeler' : 'Procurement and contracts'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Ne alındı, ne imzalandı, nasıl çalıştılar.'
                : 'What was bought, what was signed, how they performed.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[contracts]} />
      </header>

      {/*
        Sekmeler, 5 Ekim 2026 (T14-04). Dört panel alt alta, 2.974 piksel.
        Talep varsayılan: tedarik bir talep ile başlıyor.

        Sekme SIRASI eski dizilişin gerekçesini koruyor: eşleştirme
        sözleşmelerden sonra, çünkü hepsini birden okuyor; değerlendirme en
        sonda, çünkü bir firmaya ne borçlu olunduğu tartışması puanlamadan
        önce kapanmalı (M14-07).
      */}
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'requests', icon: ShoppingBag, label: tr ? 'Talepler' : 'Requests' },
            { key: 'contracts', icon: FileSignature, label: tr ? 'Sözleşmeler' : 'Contracts' },
            { key: 'matching', icon: Scale, label: tr ? 'Eşleştirme' : 'Matching' },
            { key: 'reviews', icon: ClipboardCheck, label: tr ? 'Değerlendirme' : 'Reviews' },
          ] as { key: Tab; icon: React.ElementType; label: string }[]
        ).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'requests' && <RequestPanel />}
      {tab === 'contracts' && <ContractPanel />}
      {tab === 'matching' && <MatchingPanel />}
      {tab === 'reviews' && <ReviewPanel />}
    </div>
  );
};
