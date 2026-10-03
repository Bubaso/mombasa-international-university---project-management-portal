import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, Quote, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchProvenanceOfDocument, fetchRejections } from '../../api/proposals';
import { QueryStatus } from '../QueryStatus';
import { Pill } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import { targetFor } from '../../../supabase/functions/ai-assistant/targets.js';

/**
 * Bu belgeden ne çıktı (M13-21, M13-18).
 *
 * Bu panel, asistan ekranının boşalabilmesinin sebebi. Kabul edilen teklif
 * kaydını kütüğünde açtı ve reddedilen teklif kuyruktan çıktı; ikisinin de
 * kuyrukta kalmasının tek gerekçesi, bu bilgiyi başka hiçbir yerin
 * tutmamasıydı. Artık belgenin yanında duruyor:
 *
 *   - **Açılan kayıtlar**, her biri dayandığı cümleyle. "Bu kayıt nereden
 *     geldi" sorusu, kaydın kendisinden cevaplanabiliyor.
 *   - **Reddedilenler**, gerekçesiyle. Red bir karardır ve kararın kaydı
 *     kararların durduğu yerde durur — iş kuyruğunda değil. Aynı belge
 *     yeniden okunduğunda bu cümleler yeniden teklif edilmiyor, yani burada
 *     görünen liste aynı zamanda neyin bastırıldığının listesi.
 *
 * İkisi de boşsa panel hiç çizilmiyor: "bu belgeden hiçbir şey çıkmadı"
 * cümlesi, henüz okunmamış bir belge için yanlış olurdu.
 */

const registerName = (register: string, tr: boolean): string => {
  const target = targetFor(register);
  return target ? target.label[tr ? 'tr' : 'en'] : register;
};

export const DocumentOrigin: React.FC<{ documentId: string }> = ({ documentId }) => {
  const { language } = useApp();
  const tr = language === 'tr';

  const records = useQuery({
    queryKey: ['recordProvenance', documentId],
    queryFn: () => fetchProvenanceOfDocument(documentId),
  });
  const rejections = useQuery({
    queryKey: ['intakeRejections', documentId],
    queryFn: () => fetchRejections(documentId),
  });

  const created = records.data ?? [];
  const declined = rejections.data ?? [];

  if (records.isLoading || rejections.isLoading) {
    return <QueryStatus queries={[records, rejections]} />;
  }
  if (created.length === 0 && declined.length === 0) return null;

  return (
    <section className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-slate-900">
        {tr ? 'Bu belgeden çıkanlar' : 'What came out of this document'}
      </h3>
      <QueryStatus queries={[records, rejections]} />

      {created.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <FileCheck2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tr
              ? `${created.length} kayıt açıldı`
              : `${created.length} record${created.length === 1 ? '' : 's'} created`}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {created.map((row) => (
              <li
                key={row.recordId}
                className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill className="border-emerald-300 bg-white text-emerald-900">
                    {registerName(row.register, tr)}
                  </Pill>
                  <span className="text-xs text-slate-500">
                    {row.decidedAt ? formatDate(row.decidedAt, language) : '—'}
                    {row.decidedByName ? ` · ${row.decidedByName}` : ''}
                  </span>
                </div>
                <p className="mt-1 flex gap-1.5 text-xs leading-relaxed text-slate-600 italic">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" aria-hidden="true" />
                  {row.quote}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {declined.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tr
              ? `${declined.length} teklif reddedildi — bir daha teklif edilmiyor`
              : `${declined.length} proposal${declined.length === 1 ? '' : 's'} declined — they are not proposed again`}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {declined.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill>{registerName(row.register, tr)}</Pill>
                  <span className="text-xs text-slate-500">
                    {formatDate(row.decidedAt, language)}
                  </span>
                </div>
                {row.note && <p className="mt-1 text-xs text-slate-600">{row.note}</p>}
                <p className="mt-1 flex gap-1.5 text-xs leading-relaxed text-slate-500 italic">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                  {row.quote}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
