/**
 * Governance: the organs, the trustees, the resolutions, the declarations
 * (M10-01 … M10-04, M10-11).
 *
 * What this replaces is worth recording, because it is the pattern Faz 0 kept
 * finding. The screen held three resolutions in a React useState — typed into
 * the component, one of them allocating "34.3M KShs", each with a status of
 * "Enacted" that nothing computed — above a compliance section written as
 * prose and a trustee list whose only real query read a table storing a
 * national identity number as plain text.
 *
 * So the panels here answer the four questions the requirement says the trust
 * failed to answer, and each of them from a query:
 *
 *   Was the organ entitled to decide?      → the quorum, from the attendance
 *   Who are the trustees, and until when?  → the register, with its terms
 *   Did anybody carry the resolution out?  → the actions behind it
 *   Who declared what?                     → the declarations, confidentially
 *
 * The compliance calendar, the CUE checklist, the road map and the academic
 * registers live on the readiness screen next door: those are about getting
 * the university open, and this one is about the board governing itself.
 *
 * ---
 *
 * Sekmeler, 5 Ekim 2026 (T14-04). Beş kütük alt alta duruyordu ve ekran
 * **3.924 piksel** boyundaydı — dört ekran. Açan kişi organları, senedin
 * maddelerini, kararları, mütevelli kütüğünü ve çıkar beyanlarını aynı anda
 * görüyordu; hiçbiri ötekini beklemiyordu, hepsi birden geliyordu.
 *
 * Hiçbir panel kaldırılmadı, yeri değişti. Gruplama ekranın kendi sorduğu
 * dört soruyu takip ediyor: organ karar verebilir miydi (organlar, ve onları
 * kuran senet maddesi yanında), ne karar verildi (kararlar), kim karar
 * veriyor ve kim neyi beyan etti (mütevelliler).
 *
 * `RiskList`'in kalıbı: aynı depoda iki ayrı sekme mekanizması olmasın.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BookMarked, Gavel, ScrollText, Users2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { OrganPanel } from '../components/governance/OrganPanel';
import { TrusteeRegister } from '../components/governance/TrusteeRegister';
import { ResolutionRegister } from '../components/governance/ResolutionRegister';
import { ConflictPanel } from '../components/governance/ConflictPanel';
import { CharterReference } from '../components/governance/CharterReference';
import { DataFreshness } from '../components/DataFreshness';
import { fetchOrgans } from '../api/governance';

type Tab = 'organs' | 'charter' | 'resolutions' | 'trustees';

export const GovernanceCharterView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [tab, setTab] = useState<Tab>('organs');

  // Freshness is measured on the one query every panel here depends on, so
  // the indicator means the same thing as it does on the dashboard.
  const organs = useQuery({ queryKey: ['organs'], queryFn: fetchOrgans });

  const TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
    { key: 'organs', icon: Users2, label: tr ? 'Organlar' : 'Organs' },
    { key: 'charter', icon: BookMarked, label: tr ? 'Vakıf senedi' : 'Trust deed' },
    { key: 'resolutions', icon: Gavel, label: tr ? 'Kararlar' : 'Resolutions' },
    { key: 'trustees', icon: ScrollText, label: tr ? 'Mütevelliler' : 'Trustees' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Users2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">{tr ? 'Yönetişim' : 'Governance'}</h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Üç organ, mütevelli kütüğü, kararlar ve beyanlar.'
                : 'Three organs, trustees, resolutions and declarations.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[organs]} />
      </header>

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, icon: Icon, label }) => (
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

      {tab === 'organs' && <OrganPanel />}

      {/*
        Senet referansı KENDİ sekmesinde. Eskiden organların hemen altındaydı
        ve gerekçesi yazılıydı: "bir organ hakkındaki ilk soru onu senedin
        hangi maddesinin kurduğudur". Gerekçe doğru, ama bitişiklik uğruna iki
        tam kütük üst üste duruyordu — tek başına 1.000 pikselden fazla. Bir
        sekme de bitişiktir: tek tık. Taşıdığı şey aynen duruyor, M10-13'ün
        istediği "senede dayandırılmamış kurallar" listesi dahil.
      */}
      {tab === 'charter' && <CharterReference />}

      {tab === 'resolutions' && <ResolutionRegister />}

      {tab === 'trustees' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TrusteeRegister />
          <ConflictPanel />
        </div>
      )}

      <Link
        to="/readiness"
        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
      >
        <div>
          <p className="text-base font-semibold text-slate-900">
            {tr ? 'Uyum ve akademik hazırlık' : 'Compliance and academic readiness'}
          </p>
          <p className="text-xs text-slate-500">
            {tr
              ? 'Fasıl 164 ve KRA takvimi, CUE listesi, berat yolu, programlar.'
              : 'The Cap 164 and KRA calendar, the CUE checklist, the road map.'}
          </p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </Link>
    </div>
  );
};
