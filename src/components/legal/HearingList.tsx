import React, { useState } from 'react';
import { Gavel, Plus, CircleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as legal from '../../api/legalHooks';
import {
  HEARING_KIND_VALUES,
  PREPARATION_STYLES,
  PREPARATION_VALUES,
  hearingKindLabel,
  preparationLabel,
} from '../../lib/legal';
import { daysUntil } from '../../lib/meetings';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { SettledSection } from '../ui/SettledSection';
import { EmptyState } from '../EmptyState';
import type { Hearing, HearingKind, PreparationState } from '../../types';
import { useRecordOrigins } from '../../api/proposalHooks';
import { RecordOrigin } from '../ui/RecordOrigin';

/**
 * Hearings (M5-03).
 *
 * The only deadlines on this project that nobody sets and nobody can move. So
 * the column that matters is not the date — it is whether anybody has
 * prepared, and what has to be in hand on the day.
 */

/** Duruşma saati geçti mi? Gün değil saat: sabah dokuzdaki iş akşam geçmiştir. */
const hasHappened = (h: Hearing) => new Date(h.scheduledFor) < new Date();

/** Sonucu yazılmış mı? Boş metin yazılmamış sayılıyor. */
const hasOutcome = (h: Hearing) =>
  (h.outcomeTr ?? '').trim() !== '' || (h.outcomeEn ?? '').trim() !== '';

/**
 * Bir duruşmanın işi bitti mi?
 *
 * Bu kütükte hüküm enum'dan gelmiyor, ve gelemez: `preparation` hazırlığı
 * anlatıyor, duruşmayı bitirmiyor — hükmün kendisi bunu söylüyor
 * (`lib/registerStates`, `preparation_state`, `settled: []`). Bir duruşmanın
 * bitmişliği iki şeydir: **tarihi geçmiş** olmak ve **sonucunun kaydedilmiş**
 * olması.
 *
 * İkincisi kasıtlı: geçmiş ama sonucu yazılmamış duruşma bitmiş bir iş değil,
 * kimsenin yazmadığı bir sonuçtur, ve onu "tamamlanan"ın altına koymak
 * bilinmeyeni bilinmiş gibi göstermek olurdu (CLAUDE.md §2). Ekranda kalır ve
 * sonucunun kayıtlı olmadığını söyler.
 */
const isOver = (h: Hearing) => hasHappened(h) && hasOutcome(h);
export const HearingList: React.FC<{ caseId: string; canWrite: boolean }> = ({
  caseId,
  canWrite,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const hearings = legal.useHearings(caseId);
  const setPreparation = legal.useSetHearingPreparation();
  const [adding, setAdding] = useState(false);

  const rows = hearings.data ?? [];
  const waiting = rows.filter((h) => !isOver(h));
  const settled = rows.filter(isOver);
  // Bu ekranın bütün satırlarının kökeni, tek okumada (M13-21).
  const origins = useRecordOrigins(rows.map((r) => r.id));
  const upcoming = waiting.filter((h) => !hasHappened(h));
  // Geçmiş ama sonucu yazılmamış olanlar. Bu sayı bir kusur değil, sorunun
  // birinin önüne konmasıdır.
  const unwritten = waiting.length - upcoming.length;

  /** Bir satır; iki yerde çiziliyor (bekleyen ve bitmiş). */
  const row = (hearing: Hearing) => {
    const days = daysUntil(hearing.scheduledFor.slice(0, 10));
    const future = !hasHappened(hearing);
    const unready = future && hearing.preparation === 'not_started';
    return (
      <article
        key={hearing.id}
        className={`rounded-lg border px-3 py-2 ${
          unready ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-sm font-semibold text-slate-900">
                {hearing.scheduledFor.slice(0, 16).replace('T', ' ')}
              </span>
              <Pill>{hearingKindLabel(hearing.kind, language)}</Pill>
              {future && days != null && (
                <span
                  className={`text-xs ${
                    days <= 7 ? 'font-semibold text-rose-700' : 'text-slate-500'
                  }`}
                >
                  {days === 0 ? (tr ? 'bugün' : 'today') : tr ? `${days} gün` : `in ${days} days`}
                </span>
              )}
            </div>
            {hearing.bench && (
              <p className="mt-0.5 text-xs text-slate-500">
                {tr ? 'Heyet: ' : 'Bench: '}
                {hearing.bench}
              </p>
            )}
            <RecordOrigin origin={origins.of(hearing.id)} />
          </div>
          <Pill className={PREPARATION_STYLES[hearing.preparation]}>
            {preparationLabel(hearing.preparation, language)}
          </Pill>
        </div>

        {hearing.requiredDocuments.length > 0 && (
          <div className="mt-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {tr ? 'O gün elde olması gerekenler' : 'What has to be in hand'}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {hearing.requiredDocuments.map((doc, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <CircleAlert
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 text-slate-500"
                    aria-hidden="true"
                  />
                  {doc}
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasOutcome(hearing) ? (
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            <span className="font-medium">{tr ? 'Sonuç: ' : 'Outcome: '}</span>
            {(tr ? hearing.outcomeTr : hearing.outcomeEn) ?? hearing.outcomeEn ?? hearing.outcomeTr}
          </p>
        ) : (
          !future && (
            <p className="mt-1.5 text-xs text-amber-800">
              {tr
                ? 'Duruşma geçti, sonucu kayıtlı değil.'
                : 'The hearing has passed; its outcome is not recorded.'}
            </p>
          )
        )}

        {canWrite && (
          <div className="mt-2">
            <Field label={tr ? 'Hazırlık' : 'Preparation'}>
              <Select
                value={hearing.preparation}
                disabled={setPreparation.isPending}
                onChange={(e) =>
                  setPreparation.mutate({
                    id: hearing.id,
                    preparation: e.target.value as PreparationState,
                  })
                }
                className="w-auto"
              >
                {PREPARATION_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {preparationLabel(s, language)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Gavel className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {tr ? 'Duruşmalar' : 'Hearings'}
          {upcoming.length > 0 && (
            <Pill>{tr ? `${upcoming.length} önümüzde` : `${upcoming.length} ahead`}</Pill>
          )}
          {unwritten > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-800">
              {tr ? `${unwritten} sonucu kayıtlı değil` : `${unwritten} with no outcome recorded`}
            </Pill>
          )}
        </h2>
        {canWrite && !adding && (
          <ActionButton onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{tr ? 'Duruşma ekle' : 'Add'}</span>
          </ActionButton>
        )}
      </header>

      <div className="space-y-2 p-4">
        {adding && <NewHearingForm caseId={caseId} onDone={() => setAdding(false)} />}

        {rows.length === 0 && !adding ? (
          <EmptyState
            icon={Gavel}
            title={tr ? 'Duruşma kaydı yok' : 'No hearings recorded'}
            description={
              tr
                ? 'Tensip, duruşma ve karar tarihleri buraya girildiğinde takvimde ve geri sayımda görünürler.'
                : 'Mentions, hearings and judgment dates appear on the calendar and the countdown once recorded.'
            }
          />
        ) : (
          <>
            {waiting.map(row)}

            {/* Bekleyen kalmadıysa bunu söylemek gerekiyor: boş bir alan,
                bitmişlerin altında "hepsi oldu" ile "hiç duruşma yoktu"yu
                birbirine karıştırır. */}
            {waiting.length === 0 && settled.length > 0 && (
              <p className="text-xs text-slate-500">
                {tr
                  ? 'Önümüzde duruşma yok; kayıtlı olanların hepsi yapılmış ve sonucu yazılmış.'
                  : 'No hearing is ahead; every one recorded here has happened and its outcome is written.'}
              </p>
            )}

            <SettledSection rows={settled} label={{ tr: 'Yapılmış', en: 'Held' }}>
              {(shown) => <div className="space-y-2">{shown.map(row)}</div>}
            </SettledSection>
          </>
        )}
        <WriteError error={setPreparation.error} />
      </div>
    </section>
  );
};

const NewHearingForm: React.FC<{ caseId: string; onDone: () => void }> = ({ caseId, onDone }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = legal.useCreateHearing();

  const [scheduledFor, setScheduledFor] = useState('');
  const [kind, setKind] = useState<HearingKind>('hearing');
  const [bench, setBench] = useState('');
  const [required, setRequired] = useState('');

  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!scheduledFor) return;
        create.mutate(
          {
            legalCaseId: caseId,
            scheduledFor: new Date(scheduledFor).toISOString(),
            kind,
            bench: bench.trim() || null,
            requiredDocuments: required
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Field label={tr ? 'Tarih ve saat' : 'When'}>
          <TextInput
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            required
          />
        </Field>
        <Field label={tr ? 'Tür' : 'Kind'}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as HearingKind)}>
            {HEARING_KIND_VALUES.map((k) => (
              <option key={k} value={k}>
                {hearingKindLabel(k, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr ? 'Heyet' : 'Bench'}>
          <TextInput value={bench} onChange={(e) => setBench(e.target.value)} />
        </Field>
      </div>
      <Field
        label={
          tr
            ? 'O gün elde olması gerekenler (her satıra bir tane)'
            : 'What has to be in hand (one per line)'
        }
        className="mt-2.5"
      >
        <textarea
          value={required}
          onChange={(e) => setRequired(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </Field>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {tr
          ? 'Bunlar serbest metin, belge bağı değil — çünkü yarısı henüz kimsede olmayan evraklar. Listeyi görmek, o evrakı aramaya başlamanın kendisidir.'
          : 'Free text rather than document links, because half of these are papers nobody has yet. Seeing the list is how the search for them starts.'}
      </p>

      <WriteError error={create.error} />

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton type="button" onClick={onDone} disabled={create.isPending}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </ActionButton>
        <ActionButton type="submit" tone="primary" disabled={create.isPending}>
          {tr ? 'Ekle' : 'Add'}
        </ActionButton>
      </div>
    </form>
  );
};
