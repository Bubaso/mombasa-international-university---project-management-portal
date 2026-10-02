/**
 * Supplier performance (M14-06).
 *
 * The register this replaces was one `performance_note` column on
 * contractors — overwritten each time, with no period, no score and no
 * history, and nothing in the application ever displayed it. For a module
 * whose stated purpose is accountability to donors and auditors, a record
 * that the last person to touch it decides is not a record.
 *
 * So these are dated, scored on four axes and append-only. The panel says so,
 * because somebody about to write one should know they cannot take it back:
 * a correcting review is how a mistake gets fixed, and both stay on the file.
 */
import React, { useState } from 'react';
import { Lock, Plus, Star } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAddReview, useReviews } from '../../api/procurementHooks';
import { useContractAlerts } from '../../api/procurementHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { formatDate } from '../../lib/site';

/** The four axes, which are the four things that actually go wrong here. */
const AXES = [
  { key: 'quality', tr: 'Kalite', en: 'Quality' },
  { key: 'timeliness', tr: 'Zamanlama', en: 'Timeliness' },
  { key: 'costControl', tr: 'Maliyet', en: 'Cost control' },
  { key: 'cooperation', tr: 'İşbirliği', en: 'Cooperation' },
] as const;

const Score: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`h-3 w-3 ${n <= value ? 'fill-amber-400 text-amber-500' : 'text-slate-500'}`}
        aria-hidden="true"
      />
    ))}
  </span>
);

export const ReviewPanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const reviews = useReviews();
  const contracts = useContractAlerts();
  const add = useAddReview();

  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState({
    contractId: '',
    quality: 3,
    timeliness: 3,
    costControl: 3,
    cooperation: 3,
    noteEn: '',
    periodStart: '',
    periodEnd: '',
  });

  const rows = reviews.data ?? [];
  const live = contracts.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Star className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Tedarikçi performansı' : 'Supplier performance'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Tarihli, puanlı ve sonradan değiştirilemez. Düzeltme, yeni bir değerlendirme yazmakla yapılıyor — ikisi de dosyada kalıyor.'
                : 'Dated, scored, and not editable afterwards. A correction is a new review, and both stay on the file.'}
            </p>
          </div>
        </div>
        {!writing && live.length > 0 && (
          <ActionButton onClick={() => setWriting(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {tr ? 'Değerlendirme yaz' : 'Write a review'}
          </ActionButton>
        )}
      </header>

      {writing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.noteEn.trim() || !form.contractId) return;
            // Which supplier this is about comes from the contract, resolved
            // in the API layer. Asking the screen to say it again is how the
            // two come to disagree.
            add.mutate(
              {
                contractId: form.contractId,
                quality: form.quality,
                timeliness: form.timeliness,
                costControl: form.costControl,
                cooperation: form.cooperation,
                noteEn: form.noteEn,
                periodStart: form.periodStart || null,
                periodEnd: form.periodEnd || null,
              },
              { onSuccess: () => setWriting(false) },
            );
          }}
          className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <Field label={tr ? 'Hangi sözleşme' : 'Which contract'}>
            <Select
              value={form.contractId}
              onChange={(e) => setForm({ ...form, contractId: e.target.value })}
              required
            >
              <option value="">{tr ? 'seçin…' : 'choose…'}</option>
              {live.map((c) => (
                <option key={c.contractId} value={c.contractId}>
                  {[c.referenceNo, c.counterpartyName].filter(Boolean).join(' — ')}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AXES.map((axis) => (
              <Field key={axis.key} label={tr ? axis.tr : axis.en}>
                <Select
                  value={String(form[axis.key])}
                  onChange={(e) => setForm({ ...form, [axis.key]: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          <Field label={tr ? 'Değerlendirme' : 'The review'}>
            <TextInput
              value={form.noteEn}
              onChange={(e) => setForm({ ...form, noteEn: e.target.value })}
              placeholder={
                tr
                  ? 'Hukuken sağlam, dosyayı iki kez geciktirdi.'
                  : 'Sound on the law, late with the record twice.'
              }
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={tr ? 'Dönem başı' : 'Period from'}>
              <TextInput
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </Field>
            <Field label={tr ? 'Dönem sonu' : 'Period to'}>
              <TextInput
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              />
            </Field>
          </div>

          <p className="flex items-center gap-1 text-xs text-amber-800">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {tr ? 'Kaydedildikten sonra düzeltilemez.' : 'Once recorded this cannot be edited.'}
          </p>

          <div className="flex items-center gap-2">
            <ActionButton type="submit" disabled={add.isPending}>
              {tr ? 'Değerlendirmeyi kaydet' : 'Record the review'}
            </ActionButton>
            <button
              type="button"
              onClick={() => setWriting(false)}
              className="cursor-pointer text-xs text-slate-500 underline"
            >
              {tr ? 'vazgeç' : 'cancel'}
            </button>
          </div>
          <WriteError error={add.error} />
        </form>
      )}

      <QueryStatus queries={[reviews]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {tr
            ? 'Değerlendirme yok. Bir tedarikçinin nasıl çalıştığı, sözleşme yenilenirken sorulacak ilk soru — ve kayıt yoksa cevabı hatırada kalıyor.'
            : 'No review yet. How a supplier performed is the first question asked when a contract comes up for renewal, and without a record the answer lives in somebody’s memory.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((review) => (
            <li key={review.id} className="py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-900">
                      {review.partyName ?? (tr ? '(taraf adı yok)' : '(party unnamed)')}
                    </span>
                    <Pill
                      className={
                        review.overall >= 4
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : review.overall >= 3
                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                            : 'border-rose-300 bg-rose-50 text-rose-900'
                      }
                    >
                      {review.overall.toFixed(2)} / 5
                    </Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-700">
                    {(tr ? review.noteTr : review.noteEn) ?? review.noteEn}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {AXES.map((axis) => (
                      <span
                        key={axis.key}
                        className="flex items-center gap-1 text-xs text-slate-500"
                      >
                        {tr ? axis.tr : axis.en}
                        <Score value={review[axis.key]} />
                      </span>
                    ))}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[
                      review.reviewedByName,
                      formatDate(review.reviewedAt, language),
                      review.periodStart && review.periodEnd
                        ? `${formatDate(review.periodStart, language)} → ${formatDate(review.periodEnd, language)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
