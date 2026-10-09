import React from 'react';
import { Gavel } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { Pill } from '../ui/Controls';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/**
 * Temyiz itirazları (M5-17).
 *
 * Dokuz itiraz koda gömülü bir dizideydi ve hiçbir gereksinim satırı onları
 * istemiyordu — ürün dokümanının bilmediği bir şey ekranda duruyordu. M5-17
 * bu bileşenle birlikte yazıldı.
 *
 * Sıra numarası listedeki yer değil, dilekçedeki numara: mahkeme kaydında
 * "3. itiraz" diye geçen şey burada da 3. Tablo bir dava içinde tekil
 * tutuyor, çünkü aynı numarayı taşıyan iki itiraz mahkemeye öyle
 * sunulmamıştır.
 */
export const AppealGrounds: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const grounds = legal.useAppealGrounds(caseId);
  const rows = grounds.data ?? [];
  const origins = useRecordOrigins(rows.map((r) => r.id));

  const text = (en: string | null, trText: string | null) => (tr ? trText || en : en) ?? '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Gavel className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Temyiz itirazları' : 'Grounds of appeal'}
          <Pill>{rows.length}</Pill>
        </h2>
      </header>

      <div className="space-y-2 p-4">
        <QueryStatus queries={[grounds]} />
        {grounds.isSuccess && rows.length === 0 && (
          <EmptyState
            icon={Gavel}
            title={tr ? 'İtiraz kaydı yok' : 'No ground recorded'}
            description={
              tr
                ? 'Her itirazı dilekçedeki numarasıyla girin; dayandığı karar paragrafı varsa yazılır.'
                : 'Record each ground by its number in the filing, with the paragraph of the judgment it answers.'
            }
          />
        )}

        {rows.map((ground) => (
          <article key={ground.id} className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 font-mono text-xs text-slate-500">
                {ground.ordinal}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-slate-900">
                  {text(ground.titleEn, ground.titleTr)}
                </span>
                {ground.judgmentParagraph && (
                  <Pill className="ml-1.5 border-slate-300 bg-slate-100 text-slate-700">
                    {tr ? 'par. ' : 'para. '}
                    {ground.judgmentParagraph}
                  </Pill>
                )}
                {text(ground.detailEn, ground.detailTr) && (
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                    {text(ground.detailEn, ground.detailTr)}
                  </p>
                )}
              </div>
            </div>
            <RecordOrigin origin={origins.of(ground.id)} />
          </article>
        ))}
      </div>
    </section>
  );
};
