import React from 'react';
import { ShieldCheck, MessagesSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import { Pill } from '../ui/Controls';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/**
 * Duruşma brifingi: savunma sütunları ve beklenen heyet soruları (M5-12).
 *
 * Gereksinim bunu kelimesi kelimesine istiyordu — "beklenen sorular, cevaplar,
 * içtihat, savunma sütunları — **veri olarak**, koda gömülü değil" — ve 5 Ekim
 * 2026'ya kadar koda gömülüydü. `loadHearingBrief()` adında bir fonksiyon
 * vardı ve `null` döndürüyordu; ondan önce de alanlarının çoğu eksik olan bir
 * vekil nesneyi okuyup Heyet Soru-Cevapları sekmesini açıldığı an çökertmişti.
 *
 * Brifingin BAŞLIĞI için tablo yok ve olmamalı: heyet `hearings.bench`, dava
 * adı `legal_cases`, kayıttaki avukat `case_counsel`. Üçünü burada yeniden
 * tutmak dördüncü bir doğruluk kaynağı açmak olurdu (CLAUDE.md §4).
 *
 * Cevabı yazılmamış bir soru gizlenmiyor, işaretleniyor. Hazırlıkta eksik olan
 * şey, listede olmayan şey değil; cevabı olmayan sorudur — ve duruşmada
 * sorulan da tam o olur.
 */
export const HearingBrief: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const pillars = legal.useDefencePillars(caseId);
  const rows = pillars.data ?? [];
  const origins = useRecordOrigins(rows.map((r) => r.id));

  const text = (en: string | null, trText: string | null) => (tr ? trText || en : en) ?? '';

  // Savunma sütunları hangi iddiaya karşı olduklarına göre kümelenir: iki ayrı
  // başvuruya verilen cevapları tek liste hâlinde okumak, hangisinin neye
  // cevap olduğunu kaybettirir.
  const byClaim = new Map<string, typeof rows>();
  for (const pillar of rows) {
    byClaim.set(pillar.against, [...(byClaim.get(pillar.against) ?? []), pillar]);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Savunma sütunları' : 'Defence pillars'}
          <Pill>{rows.length}</Pill>
        </h2>
      </header>

      <div className="space-y-3 p-4">
        <QueryStatus queries={[pillars]} />
        {pillars.isSuccess && rows.length === 0 && (
          <EmptyState
            icon={ShieldCheck}
            title={tr ? 'Savunma sütunu kaydı yok' : 'No defence pillar recorded'}
            description={
              tr
                ? 'Her sütun bir iddiaya karşı durur; hangi iddiaya cevap olduğu birlikte girilir.'
                : 'Each pillar answers a claim; record which claim it answers alongside it.'
            }
          />
        )}

        {[...byClaim.entries()].map(([claim, group]) => (
          <div key={claim} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {tr ? 'karşı: ' : 'against: '}
              {claim}
            </div>
            {group.map((pillar) => (
              <article key={pillar.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-slate-500">
                    {pillar.ordinal}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-900">
                      {text(pillar.titleEn, pillar.titleTr)}
                    </span>
                    {text(pillar.detailEn, pillar.detailTr) && (
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                        {text(pillar.detailEn, pillar.detailTr)}
                      </p>
                    )}
                  </div>
                </div>
                <RecordOrigin origin={origins.of(pillar.id)} />
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

/** Heyetten beklenen sorular ve verilecek cevaplar (M5-12). */
export const BenchQuestions: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const questions = legal.useBenchQuestions(caseId);
  const rows = questions.data ?? [];
  const origins = useRecordOrigins(rows.map((r) => r.id));
  const unanswered = rows.filter((r) => !r.answerEn && !r.answerTr).length;

  const text = (en: string | null, trText: string | null) => (tr ? trText || en : en) ?? '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <MessagesSquare className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Beklenen heyet soruları' : 'Anticipated bench questions'}
          <Pill>{rows.length}</Pill>
          {unanswered > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-800">
              {tr ? `${unanswered} cevapsız` : `${unanswered} unanswered`}
            </Pill>
          )}
        </h2>
      </header>

      <div className="space-y-2 p-4">
        <QueryStatus queries={[questions]} />
        {questions.isSuccess && rows.length === 0 && (
          <EmptyState
            icon={MessagesSquare}
            title={tr ? 'Soru kaydı yok' : 'No question recorded'}
            description={
              tr
                ? 'Heyetin sorması beklenen her soruyu konusuyla girin; cevabı sonra yazılabilir.'
                : 'Record each question the bench is expected to ask with its topic; the answer can follow.'
            }
          />
        )}

        {rows.map((item) => {
          const answer = text(item.answerEn, item.answerTr);
          return (
            <article key={item.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                  {text(item.questionEn, item.questionTr)}
                </span>
                <Pill>{item.topic}</Pill>
              </div>
              {answer ? (
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{answer}</p>
              ) : (
                <p className="mt-1 text-sm text-amber-800">
                  {tr ? 'Cevap yazılmadı.' : 'No answer written yet.'}
                </p>
              )}
              <RecordOrigin origin={origins.of(item.id)} />
            </article>
          );
        })}
      </div>
    </section>
  );
};
