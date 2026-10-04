/**
 * The weekly digest, and who it is for (M11-10).
 *
 * "Mütevelliye ayrı, saha ekibine ayrı, bağışçıya ayrı içerik." The audience
 * picker here is not a filter over one list: each audience is a different
 * query in SQL, which is why a trustee can preview the donor digest and see
 * exactly what a donor would see rather than their own week with sections
 * hidden. A donor view assembled by the client is a leak waiting for a bug.
 *
 * Nothing here sends anything. The digest is computed and shown; posting it
 * out weekly needs a mail provider this project does not have, which the
 * notification panel says in those words.
 */
import React, { useState } from 'react';
import { CalendarRange, Newspaper } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useDigest } from '../../api/commsHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill, Select } from '../ui/Controls';
import { formatDate } from '../../lib/site';
import type { DigestAudience } from '../../types';

const AUDIENCES: {
  key: DigestAudience;
  tr: string;
  en: string;
  why: { tr: string; en: string };
}[] = [
  {
    key: 'trustee',
    tr: 'Mütevelli',
    en: 'Trustee',
    why: {
      tr: 'Olan biten, önümüzdeki iki hafta ve kendilerini bekleyen kararlar.',
      en: 'What happened, the fortnight ahead, and what is waiting on them.',
    },
  },
  {
    key: 'field',
    tr: 'Saha ekibi',
    en: 'Site team',
    why: {
      tr: 'İnşaat, arazi ve hukuk; karar bekleyenler yok — onlar sahanın işi değil.',
      en: 'Construction, land and legal. No pending decisions: those are not the site’s to take.',
    },
  },
  {
    key: 'donor',
    tr: 'Bağışçı',
    en: 'Donor',
    why: {
      tr: 'Yalnızca yayımlanmış olan. Kaydedilmiş ama yayımlanmamış hiçbir şey görünmez.',
      en: 'Only what has been published. Nothing merely recorded appears.',
    },
  },
];

function weekAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export const DigestPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const [audience, setAudience] = useState<DigestAudience>('trustee');
  const [from, setFrom] = useState(weekAgo());
  const to = new Date().toISOString().slice(0, 10);
  const digest = useDigest(audience, from, to);

  const rows = digest.data ?? [];
  const sections = Array.from(new Set(rows.map((r) => r.section)));
  const chosen = AUDIENCES.find((a) => a.key === audience);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Haftalık özet' : 'The weekly digest'}
            </h2>
            <p className="max-w-2xl text-xs text-slate-500">
              {tr
                ? 'Üç hedef kitle, üç ayrı sorgu. Bağışçı özeti, mütevelli özetinin kırpılmışı değil — istemcide gizlenen bir bölüm, bir hatayla açılabilecek bir bölümdür.'
                : 'Three audiences, three queries. The donor digest is not the trustee one with sections hidden: a section hidden in the client is a section one bug away from showing.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={audience}
            onChange={(e) => setAudience(e.target.value as DigestAudience)}
            aria-label={tr ? 'Hedef kitle' : 'Audience'}
          >
            {AUDIENCES.map((a) => (
              <option key={a.key} value={a.key}>
                {tr ? a.tr : a.en}
              </option>
            ))}
          </Select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={tr ? 'Başlangıç' : 'From'}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      </header>

      {chosen && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <CalendarRange
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
            aria-hidden="true"
          />
          {tr ? chosen.why.tr : chosen.why.en}
        </p>
      )}

      <QueryStatus queries={[digest]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Bu aralıkta bu kitle için gösterilecek bir şey yok. Boş bir özet, uydurulmuş bir özetten iyidir.'
            : 'Nothing to show for this audience in this range. An empty digest beats an invented one.'}
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section}>
              <h3 className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                {section === 'happened'
                  ? tr
                    ? 'Olanlar'
                    : 'What happened'
                  : section === 'ahead'
                    ? tr
                      ? 'Önümüzdeki iki hafta'
                      : 'The fortnight ahead'
                    : tr
                      ? 'Sizi bekleyenler'
                      : 'Waiting on you'}
              </h3>
              <ul className="space-y-1">
                {rows
                  .filter((r) => r.section === section)
                  .map((r, i) => (
                    <li
                      key={`${r.entityKind}-${r.entityId}-${i}`}
                      className="flex flex-wrap items-baseline gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                    >
                      <span className="font-mono text-xs text-slate-500">
                        {r.occurredOn ? formatDate(r.occurredOn, language) : '—'}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-slate-900">
                        {(tr ? r.titleTr : r.titleEn) ?? r.titleEn ?? '—'}
                      </span>
                      {r.entityKind && (
                        <Pill className="border-slate-300 bg-white text-slate-600">
                          {r.entityKind}
                        </Pill>
                      )}
                      {r.detail && <p className="w-full text-xs text-slate-600">{r.detail}</p>}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
