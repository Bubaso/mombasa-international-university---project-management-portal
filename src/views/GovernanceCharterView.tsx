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
 * So the four panels here answer the four questions the requirement says the
 * trust failed to answer, and each of them from a query:
 *
 *   Was the organ entitled to decide?      → the quorum, from the attendance
 *   Who are the trustees, and until when?  → the register, with its terms
 *   Did anybody carry the resolution out?  → the actions behind it
 *   Who declared what?                     → the declarations, confidentially
 *
 * The compliance calendar, the CUE checklist, the road map and the academic
 * registers live on the readiness screen next door: those are about getting
 * the university open, and this one is about the board governing itself.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Users2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { OrganPanel } from '../components/governance/OrganPanel';
import { TrusteeRegister } from '../components/governance/TrusteeRegister';
import { ResolutionRegister } from '../components/governance/ResolutionRegister';
import { ConflictPanel } from '../components/governance/ConflictPanel';
import { CharterReference } from '../components/governance/CharterReference';
import { DataFreshness } from '../components/DataFreshness';
import { fetchOrgans } from '../api/governance';

export const GovernanceCharterView: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';

  // Freshness is measured on the one query every panel here depends on, so
  // the indicator means the same thing as it does on the dashboard.
  const organs = useQuery({ queryKey: ['organs'], queryFn: fetchOrgans });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Users2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">{tr ? 'Yönetişim' : 'Governance'}</h1>
            <p className="max-w-2xl text-sm text-slate-500">
              {tr
                ? 'Üç organ, mütevelli kütüğü, resmî kararlar ve beyanlar.'
                : 'Three organs, the trustee register, formal resolutions and declarations.'}
            </p>
          </div>
        </div>
        <DataFreshness queries={[organs]} />
      </header>

      <OrganPanel />
      {/* Directly after the organs, because the first question about an
          organ is which clause of the deed creates it, and the page's
          other half is the organs that have no answer (M10-13). */}
      <CharterReference />
      <ResolutionRegister />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrusteeRegister />
        <ConflictPanel />
      </div>

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
              ? 'Fasıl 164 ve KRA takvimi, CUE kontrol listesi, berat yol haritası, programlar ve sayılı yükümlülükler.'
              : 'The Cap 164 and KRA calendar, the CUE checklist, the charter road map, the programmes and the quantified obligations.'}
          </p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </Link>
    </div>
  );
};
