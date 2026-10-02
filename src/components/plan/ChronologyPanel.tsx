/**
 * The chronology, 1993 to today (M15-07).
 *
 * The requirement gives both reasons this exists: institutional memory and
 * legal evidence. That second one sets the rule — every entry names its
 * source, and the ones with a document in the vault are marked differently
 * from the ones resting on somebody's written recollection. An entry nobody
 * can trace is neither memory nor evidence.
 *
 * The registers only reach back to 2024, so the thirty years before that are
 * hand-recorded and joined to them in one view. And a 1993 event known only
 * to the year is shown as "1993", not as the first of January — printing a
 * day the portal does not know is how an invention becomes a fact.
 */
import React, { useState } from 'react';
import { Bilingual } from '../ui/Bilingual';
import { BookMarked, FileCheck2, Plus, Quote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAddChronologyEntry, useChronology } from '../../api/planHooks';
import { useDocuments } from '../../api/documentHooks';
import { useAuthority } from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { actsAs } from '../../lib/authority';
import { formatDate } from '../../lib/site';
import type { ChronologyEvent, UserRole } from '../../types';

const PLAN_KEEPERS: UserRole[] = [
  'admin',
  'project_director',
  'trustee',
  'board_director',
  'field_team',
];

const CATEGORIES = [
  { key: 'founding', tr: 'Kuruluş', en: 'Founding' },
  { key: 'land', tr: 'Arazi', en: 'Land' },
  { key: 'legal', tr: 'Hukuk', en: 'Legal' },
  { key: 'construction', tr: 'İnşaat', en: 'Construction' },
  { key: 'governance', tr: 'Yönetişim', en: 'Governance' },
  { key: 'funding', tr: 'Finansman', en: 'Funding' },
  { key: 'academic', tr: 'Akademik', en: 'Academic' },
  { key: 'other', tr: 'Diğer', en: 'Other' },
] as const;

const CATEGORY_TONE: Record<string, string> = {
  founding: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  land: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  legal: 'border-amber-300 bg-amber-50 text-amber-900',
  construction: 'border-sky-300 bg-sky-50 text-sky-900',
  governance: 'border-violet-300 bg-violet-50 text-violet-900',
  funding: 'border-teal-300 bg-teal-50 text-teal-900',
  academic: 'border-rose-300 bg-rose-50 text-rose-900',
  other: 'border-slate-300 bg-slate-100 text-slate-700',
};

/**
 * A date printed only as precisely as it is known.
 *
 * This is the whole reason `precision` is a column. Rendering a year-precision
 * 1993 event as "1 January 1993" would put a day into the record that nobody
 * ever established, and somebody would later cite it.
 */
function whenText(event: ChronologyEvent, language: 'tr' | 'en'): string {
  const year = event.occurredOn.slice(0, 4);
  if (event.precision === 'year') return year;
  if (event.precision === 'month') {
    return new Date(event.occurredOn).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-GB', {
      year: 'numeric',
      month: 'long',
    });
  }
  return formatDate(event.occurredOn, language);
}

export const ChronologyPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const chronology = useChronology(200);
  const documents = useDocuments();
  const authority = useAuthority();
  const add = useAddChronologyEntry();

  const mayKeep = actsAs(authority.data, ...PLAN_KEEPERS);
  const [filter, setFilter] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    occurredOn: '',
    precision: 'day' as ChronologyEvent['precision'],
    category: 'legal',
    titleEn: '',
    detailEn: '',
    documentId: '',
    sourceNote: '',
  });

  const all = chronology.data ?? [];
  const rows = filter ? all.filter((e) => e.category === filter) : all;
  const unevidenced = all.filter((e) => e.source === 'recorded' && e.documentId == null).length;
  const earliest = all.length > 0 ? all[all.length - 1] : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <BookMarked className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Proje kronolojisi' : 'Project chronology'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Tek zaman çizelgesi: kütüklerin görmediği yıllar elle, gerisi kütüklerden. Her olay kaynağına bağlı — bu hem kurumsal hafıza hem hukukî delil olduğu için.'
                : 'One time line: the years the registers never saw are hand-recorded, the rest come from the registers. Every event names its source, because this is legal evidence as well as memory.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {earliest && (
            <Pill>
              {tr ? 'en eski ' : 'back to '}
              {earliest.occurredOn.slice(0, 4)}
            </Pill>
          )}
          {unevidenced > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {tr ? `${unevidenced} kaydın belgesi yok` : `${unevidenced} with no document yet`}
            </Pill>
          )}
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={tr ? 'Kategori' : 'Category'}
          >
            <option value="">{tr ? 'hepsi' : 'everything'}</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {tr ? c.tr : c.en}
              </option>
            ))}
          </Select>
          {mayKeep && !adding && (
            <ActionButton onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {tr ? 'Geçmiş olay ekle' : 'Record a past event'}
            </ActionButton>
          )}
        </div>
      </header>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.titleEn.trim() || !form.occurredOn) return;
            add.mutate(
              {
                occurredOn: form.occurredOn,
                precision: form.precision,
                category: form.category,
                titleEn: form.titleEn,
                detailEn: form.detailEn,
                documentId: form.documentId || null,
                sourceNote: form.sourceNote,
              },
              {
                onSuccess: () => {
                  setForm({
                    occurredOn: '',
                    precision: 'day',
                    category: 'legal',
                    titleEn: '',
                    detailEn: '',
                    documentId: '',
                    sourceNote: '',
                  });
                  setAdding(false);
                },
              },
            );
          }}
          className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3"
        >
          <Field label={tr ? 'Tarih' : 'Date'}>
            <TextInput
              type="date"
              value={form.occurredOn}
              onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>
          {/* Why this field exists: a 1993 event known only to the year must
              not be printed as a day nobody established. */}
          <Field label={tr ? 'Tarih ne kadar kesin' : 'How well the date is known'}>
            <Select
              value={form.precision}
              onChange={(e) =>
                setForm({ ...form, precision: e.target.value as ChronologyEvent['precision'] })
              }
            >
              <option value="day">{tr ? 'gün belli' : 'to the day'}</option>
              <option value="month">{tr ? 'sadece ayı belli' : 'to the month'}</option>
              <option value="year">{tr ? 'sadece yılı belli' : 'to the year only'}</option>
            </Select>
          </Field>
          <Field label={tr ? 'Kategori' : 'Category'}>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {tr ? c.tr : c.en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr ? 'Ne oldu' : 'What happened'} className="sm:col-span-3">
            <TextInput
              value={form.titleEn}
              onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
              required
            />
          </Field>
          <Field label={tr ? 'Kasadaki belge' : 'Document in the vault'}>
            <Select
              value={form.documentId}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
            >
              <option value="">{tr ? '(henüz yok)' : '(not digitised yet)'}</option>
              {(documents.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </Field>
          {/* One of the two is required by the database, and the api layer
              says so in words rather than letting a constraint name arrive. */}
          <Field
            label={tr ? 'Belge yoksa: bunu nereden biliyoruz' : 'If no document: how we know this'}
            className="sm:col-span-2"
          >
            <TextInput
              value={form.sourceNote}
              onChange={(e) => setForm({ ...form, sourceNote: e.target.value })}
              placeholder={
                tr
                  ? '2025 tadil senedi, giriş paragrafı 2’de anılıyor.'
                  : 'Recited in the 2025 amended trust deed, recital 2.'
              }
            />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-3">
            <ActionButton type="submit" disabled={add.isPending}>
              {tr ? 'Kronolojiye ekle' : 'Add to the chronology'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="cursor-pointer text-xs text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
            <div className="flex-1">
              <WriteError error={add.error} />
            </div>
          </div>
        </form>
      )}

      <QueryStatus queries={[chronology]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Kronoloji boş. Kütükler 2024’te başlıyor; 1993’ten o tarihe kadarki otuz yıl yalnızca belgelerde duruyor ve buraya elle girilmesi gerekiyor.'
            : 'The chronology is empty. The registers begin in 2024; the thirty years before that exist only in documents and have to be entered here by hand.'}
        </p>
      ) : (
        <ol className="relative space-y-2 border-l border-slate-200 pl-4">
          {rows.map((event) => (
            <li key={`${event.source}-${event.id}`} className="relative">
              <span
                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-white bg-slate-300"
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-slate-700">
                      {whenText(event, language)}
                    </span>
                    <Pill className={CATEGORY_TONE[event.category] ?? CATEGORY_TONE.other}>
                      {(tr
                        ? CATEGORIES.find((c) => c.key === event.category)?.tr
                        : CATEGORIES.find((c) => c.key === event.category)?.en) ?? event.category}
                    </Pill>
                    {/* Which half of the time line this came from. */}
                    <Pill className="border-slate-200 bg-white text-slate-500">
                      {event.source === 'recorded'
                        ? tr
                          ? 'elle kaydedildi'
                          : 'hand-recorded'
                        : event.source}
                    </Pill>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-900">
                    <Bilingual
                      table="chronology_entries"
                      id={event.id}
                      base="title"
                      en={event.titleEn}
                      tr={event.titleTr}
                    />
                  </p>
                  {event.detailEn && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{event.detailEn}</p>
                  )}
                  {/* The source, named. Without it this is an account rather
                      than evidence. */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    {event.documentId ? (
                      <button
                        type="button"
                        onClick={() => navigate('/documents')}
                        className="flex cursor-pointer items-center gap-1 text-indigo-700 hover:underline"
                      >
                        <FileCheck2 className="h-3 w-3" aria-hidden="true" />
                        {tr ? 'belge kasada' : 'document in the vault'}
                      </button>
                    ) : event.sourceNote ? (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Quote className="h-3 w-3" aria-hidden="true" />
                        {event.sourceNote}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
