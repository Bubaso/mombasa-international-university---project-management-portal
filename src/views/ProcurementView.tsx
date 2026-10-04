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
import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { RequestPanel } from '../components/procurement/RequestPanel';
import { ContractPanel } from '../components/procurement/ContractPanel';
import { ReviewPanel } from '../components/procurement/ReviewPanel';
import { MatchingPanel } from '../components/procurement/MatchingPanel';
import { DataFreshness } from '../components/DataFreshness';
import { fetchContracts } from '../api/procurement';

export const ProcurementView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

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
                ? 'Ne alındı ve neden, ne imzalandı, nasıl çalıştılar. Bir vakıfta bu verimlilik değil hesap verebilirlik meselesi — bu yüzden gerekçe her üç adımda da karar anında isteniyor.'
                : 'What was bought and why, what was signed, and how they performed. In a trust this is accountability rather than efficiency, which is why the reasoning is required at the moment of the decision in all three.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[contracts]} />
      </header>

      <RequestPanel />
      <ContractPanel />
      {/* After the contracts, because it reads across all of them, and before
          the performance reviews, because a disagreement about what a firm is
          owed is the thing to settle before scoring them (M14-07). */}
      <MatchingPanel />
      <ReviewPanel />
    </div>
  );
};
