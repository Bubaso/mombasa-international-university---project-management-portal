import React from 'react';
import { UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { Pill } from '../ui/Controls';
import { CASE_PARTY_ROLE_STYLES, casePartyRoleLabel } from '../../lib/legal';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/**
 * Davanın tarafları (M5-02).
 *
 * Bu listenin yerinde beş kişi koda gömülü duruyordu — "Kim kimdir" sekmesi,
 * isimleriyle, bürolarıyla, tanık numaralarıyla ve haklarındaki
 * değerlendirmelerle. `case_parties` tablosu 0009'dan beri vardı ve hiçbir
 * yerden okunmuyordu, yani veri kaynak kodda tutuluyordu (CLAUDE.md §4).
 *
 * İki şey birden düzeliyor. Taraf listesi kayıt oluyor, yani değiştirildiğinde
 * kim değiştirdiği ve ne zaman belli — gömülü metinde bu bilgi yoktu ve
 * ekranın kendi uyarısı "güncelliği doğrulanmamıştır" diyordu. Ve gizlilik
 * sınıflandırması tarafa uygulanıyor: kimin hangi tarafı görebildiği
 * politikanın cevabı, istemcinin değil.
 *
 * Avukatlar burada DEĞİL. `case_counsel` onları tutuyor ve `CounselPanel`
 * yan sekmede okuyor; gömülü liste ikisini de gösteriyordu, yani aynı iki
 * avukat aynı bölümün iki sekmesinde biri kayıttan biri sabit metinden
 * geliyordu. Sapan kopya her zaman ikincisidir (CLAUDE.md §4).
 */
export const PartyList: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const parties = legal.useCaseParties(caseId);
  const rows = parties.data ?? [];
  // Bir ekran dolusu için tek okuma (M13-21).
  const origins = useRecordOrigins(rows.map((r) => r.id));

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <UserCheck className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Taraflar' : 'Parties'}
          <Pill>{rows.length}</Pill>
        </h2>
      </header>

      <div className="space-y-2 p-4">
        <QueryStatus queries={[parties]} />
        {parties.isSuccess && rows.length === 0 && (
          <EmptyState
            icon={UserCheck}
            title={tr ? 'Taraf kaydı yok' : 'No party recorded'}
            description={
              tr
                ? 'Davanın taraflarını girin: her biri bir rol taşır ve temsilcisi varsa yazılır.'
                : 'Record the parties to the case: each carries a role, and who represents them where that is known.'
            }
          />
        )}

        {rows.map((party) => (
          <article key={party.id} className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-slate-900">{party.name}</span>
                {party.representedBy && (
                  <div className="mt-0.5 text-xs text-slate-500">
                    {tr ? 'temsilci: ' : 'represented by '}
                    {party.representedBy}
                  </div>
                )}
              </div>
              <Pill className={CASE_PARTY_ROLE_STYLES[party.role]}>
                {casePartyRoleLabel(party.role, language)}
              </Pill>
            </div>
            <RecordOrigin origin={origins.of(party.id)} />
          </article>
        ))}
      </div>
    </section>
  );
};
